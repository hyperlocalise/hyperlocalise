/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";
import {
  crowdinAuthenticatedUserUrl,
  normalizeCrowdinApiBaseUrl,
} from "@/lib/providers/adapters/crowdin/crowdin-api";
import { crowdinAuth } from "@/lib/providers/adapters/crowdin/crowdin-auth";
import { lokaliseAuth } from "@/lib/providers/adapters/lokalise/lokalise-auth";
import {
  phraseStringsAuthorizationHeader,
  resolvePhraseBaseUrl,
} from "@/lib/providers/adapters/phrase/phrase-api";
import { getPhraseUserConnection } from "@/lib/providers/adapters/phrase/phrase-auth";
import {
  phraseTmsAuthorizationHeader,
  resolvePhraseTmsBaseUrl,
} from "@/lib/providers/adapters/phrase/phrase-tms-api";
import {
  parseSmartlingCredentials,
  SmartlingApiClient,
  SmartlingApiError,
} from "@/lib/providers/adapters/smartling/smartling-api";
import type { ExternalTmsProviderKind } from "@/lib/providers/contracts/external-tms-provider-kind";
import {
  API_TOKEN_AUTH_MODE,
  crowdinUsesPerUserAuth,
  OAUTH_AUTH_MODE,
  type ExternalTmsCredential,
} from "@/lib/providers/credentials/organization-external-tms-provider-credentials";
import { resolveExternalTmsSecretMaterialForActor } from "@/lib/providers/shared/tms-provider-content";
import { normalizeProviderBaseUrl } from "@/lib/providers/shared/provider-url-safety";

export type ExternalTmsAccessToken = {
  providerKind: ExternalTmsProviderKind;
  credentialId: string;
  authMode: string;
  baseUrl: string;
  headerName: string;
  headerValue: string;
  expiresAt: string | null;
  probeUrl: string | null;
  /** The provider account the credential belongs to, when stored with it (Smartling's account UID). */
  accountId?: string | null;
};

export class ExternalTmsAccessTokenError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: 400 | 404 | 502 = 400,
  ) {
    super(message);
    this.name = "ExternalTmsAccessTokenError";
  }
}

export async function mintExternalTmsAccessToken(input: {
  organizationId: string;
  providerKind: ExternalTmsProviderKind;
  credentialId?: string;
  actorUserId?: string | null;
  fetchFn?: typeof fetch;
}): Promise<ExternalTmsAccessToken> {
  const credential = await loadCredential(input);
  if (!credential || credential.providerKind !== input.providerKind) {
    throw new ExternalTmsAccessTokenError(
      "provider_credential_not_found",
      "No TMS credential exists for this organization and provider.",
      404,
    );
  }

  try {
    if (input.providerKind === "smartling") {
      return await mintSmartlingAccessToken({
        credential,
        fetchFn: input.fetchFn,
      });
    }

    const secretMaterial = await resolveExternalTmsSecretMaterialForActor({
      credential,
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
    });
    const expiresAt = await readActorOAuthExpiresAt({
      credential,
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
    });

    return formatAccessToken({
      credential,
      secretMaterial,
      expiresAt,
    });
  } catch (error) {
    throw mapMintError(error);
  }
}

async function loadCredential(input: {
  organizationId: string;
  providerKind: ExternalTmsProviderKind;
  credentialId?: string;
}): Promise<ExternalTmsCredential | null> {
  const [credential] = await db
    .select()
    .from(schema.organizationExternalTmsProviderCredentials)
    .where(
      input.credentialId
        ? and(
            eq(schema.organizationExternalTmsProviderCredentials.id, input.credentialId),
            eq(
              schema.organizationExternalTmsProviderCredentials.organizationId,
              input.organizationId,
            ),
            eq(schema.organizationExternalTmsProviderCredentials.providerKind, input.providerKind),
          )
        : and(
            eq(
              schema.organizationExternalTmsProviderCredentials.organizationId,
              input.organizationId,
            ),
            eq(schema.organizationExternalTmsProviderCredentials.providerKind, input.providerKind),
          ),
    )
    .limit(1);

  return credential ?? null;
}

async function mintSmartlingAccessToken(input: {
  credential: ExternalTmsCredential;
  fetchFn?: typeof fetch;
}): Promise<ExternalTmsAccessToken> {
  const secretMaterial = await resolveExternalTmsSecretMaterialForActor({
    credential: input.credential,
    organizationId: input.credential.organizationId,
  });
  const baseUrl =
    normalizeProviderBaseUrl(input.credential.baseUrl, "https://api.smartling.com") ??
    "https://api.smartling.com";
  const client = new SmartlingApiClient({
    credentials: secretMaterial,
    authBaseUrl: `${baseUrl}/auth-api/v2`,
    fetchFn: input.fetchFn,
  });

  try {
    const tokens = await client.authenticate();
    return {
      providerKind: "smartling",
      credentialId: input.credential.id,
      authMode: input.credential.authMode ?? API_TOKEN_AUTH_MODE,
      baseUrl,
      headerName: "Authorization",
      headerValue: bearerAuthorization(tokens.accessToken),
      expiresAt: tokens.expiresAt ? new Date(tokens.expiresAt).toISOString() : null,
      probeUrl: null,
      // go-svc needs it for account-scoped glossaries and translation memories.
      accountId: parseSmartlingCredentials(secretMaterial).accountUid?.trim() || null,
    };
  } catch (error) {
    if (error instanceof SmartlingApiError) {
      throw new ExternalTmsAccessTokenError(
        error.code ?? "smartling_auth_failed",
        "Smartling rejected the stored credential.",
        error.status === 401 || error.status === 403 ? 400 : 502,
      );
    }
    throw error;
  }
}

async function readActorOAuthExpiresAt(input: {
  credential: ExternalTmsCredential;
  organizationId: string;
  actorUserId?: string | null;
}): Promise<string | null> {
  if (!input.actorUserId) {
    return input.credential.oauthExpiresAt?.toISOString() ?? null;
  }

  if (input.credential.providerKind === "phrase" && input.credential.authMode === OAUTH_AUTH_MODE) {
    const connection = await getPhraseUserConnection({
      organizationId: input.organizationId,
      userId: input.actorUserId,
    });
    return connection?.oauthExpiresAt?.toISOString() ?? null;
  }

  if (
    input.credential.providerKind === "lokalise" &&
    input.credential.authMode === OAUTH_AUTH_MODE
  ) {
    const connection = await lokaliseAuth.getUserConnection({
      organizationId: input.organizationId,
      userId: input.actorUserId,
    });
    return connection?.oauthExpiresAt?.toISOString() ?? null;
  }

  if (
    input.credential.providerKind === "crowdin" &&
    crowdinUsesPerUserAuth(input.credential.authMode)
  ) {
    const connection = await crowdinAuth.getUserConnection({
      organizationId: input.organizationId,
      userId: input.actorUserId,
    });
    return connection?.oauthExpiresAt?.toISOString() ?? null;
  }

  return input.credential.oauthExpiresAt?.toISOString() ?? null;
}

function formatAccessToken(input: {
  credential: ExternalTmsCredential;
  secretMaterial: string;
  expiresAt: string | null;
}): ExternalTmsAccessToken {
  const authMode = input.credential.authMode ?? API_TOKEN_AUTH_MODE;

  if (input.credential.providerKind === "crowdin") {
    const baseUrl = normalizeCrowdinApiBaseUrl(input.credential.baseUrl);
    const probeUrl = crowdinAuthenticatedUserUrl(input.credential.baseUrl);
    if (!baseUrl || !probeUrl) {
      throw new ExternalTmsAccessTokenError(
        "provider_base_url_invalid",
        "Provider base URL is invalid.",
      );
    }
    return {
      providerKind: "crowdin",
      credentialId: input.credential.id,
      authMode,
      baseUrl,
      headerName: "Authorization",
      headerValue: bearerAuthorization(input.secretMaterial),
      expiresAt: authMode === OAUTH_AUTH_MODE ? input.expiresAt : null,
      probeUrl,
    };
  }

  if (input.credential.providerKind === "phrase") {
    if (authMode === OAUTH_AUTH_MODE) {
      const baseUrl = resolvePhraseTmsBaseUrl({ baseUrl: input.credential.baseUrl });
      return {
        providerKind: "phrase",
        credentialId: input.credential.id,
        authMode,
        baseUrl,
        headerName: "Authorization",
        headerValue: phraseTmsAuthorizationHeader(input.secretMaterial),
        expiresAt: input.expiresAt,
        probeUrl: `${baseUrl}/api2/v1/auth/whoAmI`,
      };
    }

    const baseUrl = resolvePhraseBaseUrl({
      region: input.credential.region,
      baseUrl: input.credential.baseUrl,
    });
    return {
      providerKind: "phrase",
      credentialId: input.credential.id,
      authMode,
      baseUrl,
      headerName: "Authorization",
      headerValue: phraseStringsAuthorizationHeader(input.secretMaterial),
      expiresAt: null,
      probeUrl: `${baseUrl}/user`,
    };
  }

  if (input.credential.providerKind === "lokalise") {
    const baseUrl =
      normalizeProviderBaseUrl(input.credential.baseUrl, "https://api.lokalise.com") ??
      "https://api.lokalise.com";
    const oauth = authMode === OAUTH_AUTH_MODE;
    const trimmed = input.secretMaterial.trim();
    const usesBearer = oauth || /^bearer\s+/i.test(trimmed);
    return {
      providerKind: "lokalise",
      credentialId: input.credential.id,
      authMode,
      baseUrl,
      headerName: usesBearer ? "Authorization" : "X-Api-Token",
      headerValue: usesBearer ? bearerAuthorization(trimmed) : trimmed,
      expiresAt: oauth ? input.expiresAt : null,
      probeUrl: `${baseUrl}/api2/projects?limit=1`,
    };
  }

  throw new ExternalTmsAccessTokenError(
    "invalid_external_tms_provider_kind",
    "Unsupported TMS provider.",
  );
}

function bearerAuthorization(token: string) {
  const trimmed = token.trim();
  if (/^bearer\s+/i.test(trimmed)) {
    return trimmed;
  }
  return `Bearer ${trimmed}`;
}

function mapMintError(error: unknown) {
  if (error instanceof ExternalTmsAccessTokenError) {
    return error;
  }

  const code = error instanceof Error ? error.message : "tms_access_token_failed";
  if (
    code === "crowdin_user_connection_required" ||
    code === "phrase_user_connection_required" ||
    code === "lokalise_user_connection_required" ||
    code === "crowdin_user_connection_auth_mode_mismatch" ||
    code === "crowdin_legacy_api_token_deprecated"
  ) {
    return new ExternalTmsAccessTokenError(
      code,
      "Connect a user TMS account before minting an access token.",
    );
  }

  if (code === "provider_base_url_invalid") {
    return new ExternalTmsAccessTokenError(code, "Provider base URL is invalid.");
  }

  if (
    code.endsWith("_oauth_refresh_failed") ||
    code.endsWith("_oauth_token_response_invalid") ||
    code === "smartling_credentials_invalid"
  ) {
    return new ExternalTmsAccessTokenError(code, "TMS token refresh failed.", 502);
  }

  return error;
}
