import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";

import { assertCapability } from "@/api/auth/policy";
import { db, schema } from "@/lib/database";
import type { OrganizationMembershipRole } from "@/lib/database/types";
import {
  decryptProviderCredential,
  encryptProviderCredential,
  maskProviderCredentialSuffix,
  unwrapProviderCredentialCrypto,
} from "@/lib/security/provider-credential-crypto";
import {
  getTmsProviderCapability,
  type TmsProviderCapability,
  type TmsProviderCapabilityAction,
} from "@/lib/providers/tms-capabilities";
import { listProviderWebhookSubscriptionSummaries } from "@/lib/providers/webhooks/provider-webhook-subscription-manager";
import type { ProviderWebhookSubscriptionSummary } from "@/lib/providers/webhooks/provider-webhook-subscription-types";
import { assertProviderUrlResolvable } from "@/lib/providers/provider-url-resolve";
import { normalizeProviderBaseUrl } from "@/lib/providers/provider-url-safety";
import { resolvePhraseBaseUrl } from "@/lib/providers/adapters/phrase/phrase-base-url";

export type { ExternalTmsProviderKind } from "@/lib/providers/contracts/external-tms-provider-kind";
import type { ExternalTmsProviderKind } from "@/lib/providers/contracts/external-tms-provider-kind";

type OrganizationExternalTmsProviderCredential =
  typeof schema.organizationExternalTmsProviderCredentials.$inferSelect;

export type ExternalTmsCredential = Omit<
  OrganizationExternalTmsProviderCredential,
  "authMode" | "oauthExpiresAt"
> &
  Partial<Pick<OrganizationExternalTmsProviderCredential, "authMode" | "oauthExpiresAt">>;

export const CROWDIN_OAUTH_AUTH_MODE = "oauth";
export const API_TOKEN_AUTH_MODE = "api_token";
export const CROWDIN_OAUTH_TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

const crowdinOAuthTokenBundleSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  tokenType: z.string().min(1).default("bearer"),
  expiresAt: z.string().datetime(),
});

export type CrowdinOAuthTokenBundle = z.infer<typeof crowdinOAuthTokenBundleSchema>;

const crowdinOAuthClientMaterialSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
});

export type CrowdinOAuthClientMaterial = z.infer<typeof crowdinOAuthClientMaterialSchema>;

export function assertExternalTmsCredentialAdmin(role: OrganizationMembershipRole) {
  assertCapability(role, "provider_credentials:write");
}

export type ExternalTmsProviderCredentialSummary = {
  id: string;
  providerKind: ExternalTmsProviderKind;
  displayName: string;
  authMode: string;
  region: string | null;
  baseUrl: string | null;
  oauthExpiresAt: string | null;
  validationStatus: string;
  validationMessage: string | null;
  lastValidatedAt: string | null;
  maskedSecretSuffix: string;
  createdAt: string;
  updatedAt: string;
};

export type ExternalTmsProviderCredentialListItem = ExternalTmsProviderCredentialSummary & {
  lastSuccessfulSyncAt: string | null;
  projectCount: number;
  capabilities: Record<TmsProviderCapabilityAction, TmsProviderCapability>;
  webhookSubscriptions: ProviderWebhookSubscriptionSummary[];
};

function summarizeExternalCredential(
  credential: typeof schema.organizationExternalTmsProviderCredentials.$inferSelect,
): ExternalTmsProviderCredentialSummary {
  return {
    id: credential.id,
    providerKind: credential.providerKind as ExternalTmsProviderKind,
    displayName: credential.displayName,
    authMode: credential.authMode,
    region: credential.region,
    baseUrl: credential.baseUrl,
    oauthExpiresAt: credential.oauthExpiresAt?.toISOString() ?? null,
    validationStatus: credential.validationStatus,
    validationMessage: credential.validationMessage,
    lastValidatedAt: credential.lastValidatedAt?.toISOString() ?? null,
    maskedSecretSuffix: credential.maskedSecretSuffix,
    createdAt: credential.createdAt.toISOString(),
    updatedAt: credential.updatedAt.toISOString(),
  };
}

export async function listOrganizationExternalTmsProviderCredentialSummaries(
  organizationId: string,
): Promise<ExternalTmsProviderCredentialSummary[]> {
  const credentials = await db
    .select()
    .from(schema.organizationExternalTmsProviderCredentials)
    .where(eq(schema.organizationExternalTmsProviderCredentials.organizationId, organizationId));

  return credentials.map(summarizeExternalCredential);
}

/**
 * Returns the single active TMS credential for an org. When legacy rows exist,
 * the most recently updated credential wins.
 */
export async function getActiveOrganizationExternalTmsProviderCredential(
  organizationId: string,
): Promise<ExternalTmsProviderCredentialSummary | null> {
  const [credential] = await db
    .select()
    .from(schema.organizationExternalTmsProviderCredentials)
    .where(eq(schema.organizationExternalTmsProviderCredentials.organizationId, organizationId))
    .orderBy(desc(schema.organizationExternalTmsProviderCredentials.updatedAt))
    .limit(1);

  return credential ? summarizeExternalCredential(credential) : null;
}

export async function getActiveOrganizationExternalTmsProviderCredentialRow(
  organizationId: string,
): Promise<OrganizationExternalTmsProviderCredential | null> {
  const [credential] = await db
    .select()
    .from(schema.organizationExternalTmsProviderCredentials)
    .where(eq(schema.organizationExternalTmsProviderCredentials.organizationId, organizationId))
    .orderBy(desc(schema.organizationExternalTmsProviderCredentials.updatedAt))
    .limit(1);

  return credential ?? null;
}

export async function listOrganizationExternalTmsProviderCredentialDetails(
  organizationId: string,
): Promise<ExternalTmsProviderCredentialListItem[]> {
  const credentials = await listOrganizationExternalTmsProviderCredentialSummaries(organizationId);
  if (credentials.length === 0) {
    return [];
  }

  const providerKinds = credentials.map((c) => c.providerKind);

  const [projectCounts, lastSyncs, webhookSubscriptions] = await Promise.all([
    db
      .select({
        providerKind: schema.projects.externalProviderKind,
        count: sql<number>`count(*)`.mapWith(Number),
      })
      .from(schema.projects)
      .where(
        and(
          eq(schema.projects.organizationId, organizationId),
          eq(schema.projects.source, "external_tms"),
          eq(schema.projects.isActive, true),
          inArray(schema.projects.externalProviderKind, providerKinds),
        ),
      )
      .groupBy(schema.projects.externalProviderKind),
    db
      .select({
        providerKind: schema.providerSyncRuns.providerKind,
        completedAt: sql<Date | null>`max(${schema.providerSyncRuns.completedAt})`.mapWith((v) =>
          v == null ? null : new Date(v),
        ),
      })
      .from(schema.providerSyncRuns)
      .where(
        and(
          eq(schema.providerSyncRuns.organizationId, organizationId),
          eq(schema.providerSyncRuns.status, "succeeded"),
          ne(schema.providerSyncRuns.kind, "health_check"),
          inArray(schema.providerSyncRuns.providerKind, providerKinds),
        ),
      )
      .groupBy(schema.providerSyncRuns.providerKind),
    Promise.all(
      credentials.map((credential) =>
        listProviderWebhookSubscriptionSummaries({
          organizationId,
          providerCredentialId: credential.id,
        }),
      ),
    ),
  ]);

  const projectCountByProvider = Object.fromEntries(
    projectCounts.map((row) => [row.providerKind, row.count]),
  ) as Record<string, number>;

  const lastSyncByProvider = Object.fromEntries(
    lastSyncs.map((row) => [row.providerKind, row.completedAt?.toISOString() ?? null]),
  ) as Record<string, string | null>;

  return credentials.map((credential, index) => ({
    ...credential,
    lastSuccessfulSyncAt: lastSyncByProvider[credential.providerKind] ?? null,
    projectCount: projectCountByProvider[credential.providerKind] ?? 0,
    capabilities: getTmsProviderCapability(credential.providerKind).capabilities,
    webhookSubscriptions: webhookSubscriptions[index] ?? [],
  }));
}

export async function getOrganizationExternalTmsProviderCredentialSummaryById(
  organizationId: string,
  credentialId: string,
) {
  const [credential] = await db
    .select()
    .from(schema.organizationExternalTmsProviderCredentials)
    .where(
      and(
        eq(schema.organizationExternalTmsProviderCredentials.organizationId, organizationId),
        eq(schema.organizationExternalTmsProviderCredentials.id, credentialId),
      ),
    )
    .limit(1);

  return credential ? summarizeExternalCredential(credential) : null;
}

export async function getOrganizationExternalTmsProviderCredentialSummary(
  organizationId: string,
  providerKind: ExternalTmsProviderKind,
) {
  const [credential] = await db
    .select()
    .from(schema.organizationExternalTmsProviderCredentials)
    .where(
      and(
        eq(schema.organizationExternalTmsProviderCredentials.organizationId, organizationId),
        eq(schema.organizationExternalTmsProviderCredentials.providerKind, providerKind),
      ),
    )
    .limit(1);

  return credential ? summarizeExternalCredential(credential) : null;
}

export async function upsertOrganizationExternalTmsProviderCredential(input: {
  organizationId: string;
  userId: string;
  role: OrganizationMembershipRole;
  providerKind: ExternalTmsProviderKind;
  displayName: string;
  secretMaterial: string;
  region?: string | null;
  baseUrl?: string | null;
}) {
  assertExternalTmsCredentialAdmin(input.role);

  const now = new Date();
  const encrypted = unwrapProviderCredentialCrypto(encryptProviderCredential(input.secretMaterial));
  const baseUrl = await normalizeExternalTmsCredentialBaseUrl({
    providerKind: input.providerKind,
    region: input.region ?? null,
    baseUrl: input.baseUrl ?? null,
  });

  const credential = await db.transaction(async (tx) => {
    await tx
      .delete(schema.organizationExternalTmsProviderCredentials)
      .where(
        and(
          eq(
            schema.organizationExternalTmsProviderCredentials.organizationId,
            input.organizationId,
          ),
          ne(schema.organizationExternalTmsProviderCredentials.providerKind, input.providerKind),
        ),
      );

    const [row] = await tx
      .insert(schema.organizationExternalTmsProviderCredentials)
      .values({
        organizationId: input.organizationId,
        createdByUserId: input.userId,
        updatedByUserId: input.userId,
        providerKind: input.providerKind,
        displayName: input.displayName,
        authMode: API_TOKEN_AUTH_MODE,
        region: input.region ?? null,
        baseUrl,
        oauthExpiresAt: null,
        validationStatus: "unvalidated",
        encryptionAlgorithm: encrypted.algorithm,
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        keyVersion: encrypted.keyVersion,
        maskedSecretSuffix: maskProviderCredentialSuffix(input.secretMaterial),
      })
      .onConflictDoUpdate({
        target: [
          schema.organizationExternalTmsProviderCredentials.organizationId,
          schema.organizationExternalTmsProviderCredentials.providerKind,
        ],
        set: {
          updatedByUserId: input.userId,
          displayName: input.displayName,
          authMode: API_TOKEN_AUTH_MODE,
          region: input.region ?? null,
          baseUrl,
          oauthExpiresAt: null,
          validationStatus: "unvalidated",
          validationMessage: null,
          lastValidatedAt: null,
          encryptionAlgorithm: encrypted.algorithm,
          ciphertext: encrypted.ciphertext,
          iv: encrypted.iv,
          authTag: encrypted.authTag,
          keyVersion: encrypted.keyVersion,
          maskedSecretSuffix: maskProviderCredentialSuffix(input.secretMaterial),
          updatedAt: now,
        },
      })
      .returning();

    return row;
  });

  return credential;
}

export async function upsertCrowdinOAuthProviderCredential(input: {
  organizationId: string;
  userId: string;
  role: OrganizationMembershipRole;
  displayName: string;
  oauthClient?: CrowdinOAuthClientMaterial;
  tokenBundle?: CrowdinOAuthTokenBundle;
  baseUrl?: string | null;
}) {
  assertExternalTmsCredentialAdmin(input.role);

  const now = new Date();
  const oauthClient = input.oauthClient ?? input.tokenBundle;
  if (!oauthClient) {
    throw new Error("crowdin_oauth_client_required");
  }

  const secretMaterial = JSON.stringify({
    clientId: oauthClient.clientId,
    clientSecret: oauthClient.clientSecret,
  });
  const encrypted = unwrapProviderCredentialCrypto(encryptProviderCredential(secretMaterial));
  const baseUrl = await normalizeExternalTmsCredentialBaseUrl({
    providerKind: "crowdin",
    region: null,
    baseUrl: input.baseUrl ?? null,
  });

  const credential = await db.transaction(async (tx) => {
    await tx
      .delete(schema.organizationExternalTmsProviderCredentials)
      .where(
        and(
          eq(
            schema.organizationExternalTmsProviderCredentials.organizationId,
            input.organizationId,
          ),
          ne(schema.organizationExternalTmsProviderCredentials.providerKind, "crowdin"),
        ),
      );

    const [row] = await tx
      .insert(schema.organizationExternalTmsProviderCredentials)
      .values({
        organizationId: input.organizationId,
        createdByUserId: input.userId,
        updatedByUserId: input.userId,
        providerKind: "crowdin",
        displayName: input.displayName,
        authMode: CROWDIN_OAUTH_AUTH_MODE,
        region: null,
        baseUrl,
        oauthExpiresAt: null,
        validationStatus: "unvalidated",
        encryptionAlgorithm: encrypted.algorithm,
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        keyVersion: encrypted.keyVersion,
        maskedSecretSuffix: "oauth",
      })
      .onConflictDoUpdate({
        target: [
          schema.organizationExternalTmsProviderCredentials.organizationId,
          schema.organizationExternalTmsProviderCredentials.providerKind,
        ],
        set: {
          updatedByUserId: input.userId,
          displayName: input.displayName,
          authMode: CROWDIN_OAUTH_AUTH_MODE,
          region: null,
          baseUrl,
          oauthExpiresAt: null,
          validationStatus: "unvalidated",
          validationMessage: null,
          lastValidatedAt: null,
          encryptionAlgorithm: encrypted.algorithm,
          ciphertext: encrypted.ciphertext,
          iv: encrypted.iv,
          authTag: encrypted.authTag,
          keyVersion: encrypted.keyVersion,
          maskedSecretSuffix: "oauth",
          updatedAt: now,
        },
      })
      .returning();

    return row;
  });

  return credential;
}

type CredentialCryptoFields = Pick<
  ExternalTmsCredential,
  "encryptionAlgorithm" | "keyVersion" | "ciphertext" | "iv" | "authTag"
>;

export function decryptCrowdinOAuthTokenBundle(
  credential: CredentialCryptoFields,
): CrowdinOAuthTokenBundle {
  const secretMaterial = unwrapProviderCredentialCrypto(
    decryptProviderCredential({
      algorithm: credential.encryptionAlgorithm,
      keyVersion: credential.keyVersion,
      ciphertext: credential.ciphertext,
      iv: credential.iv,
      authTag: credential.authTag,
    }),
  );
  const parsed = crowdinOAuthTokenBundleSchema.safeParse(safeJsonParse(secretMaterial));
  if (!parsed.success) {
    throw new Error("crowdin_oauth_token_invalid");
  }

  return parsed.data;
}

function decryptCrowdinOAuthClientMaterial(
  credential: CredentialCryptoFields,
): CrowdinOAuthClientMaterial {
  const secretMaterial = unwrapProviderCredentialCrypto(
    decryptProviderCredential({
      algorithm: credential.encryptionAlgorithm,
      keyVersion: credential.keyVersion,
      ciphertext: credential.ciphertext,
      iv: credential.iv,
      authTag: credential.authTag,
    }),
  );
  const raw = safeJsonParse(secretMaterial);
  const clientMaterial = crowdinOAuthClientMaterialSchema.safeParse(raw);
  if (clientMaterial.success) {
    return clientMaterial.data;
  }

  const tokenBundle = crowdinOAuthTokenBundleSchema.safeParse(raw);
  if (tokenBundle.success) {
    return {
      clientId: tokenBundle.data.clientId,
      clientSecret: tokenBundle.data.clientSecret,
    };
  }

  throw new Error("crowdin_oauth_client_invalid");
}

export function isCrowdinOAuthAccessTokenFresh(tokenBundle: CrowdinOAuthTokenBundle) {
  return (
    new Date(tokenBundle.expiresAt).getTime() - Date.now() > CROWDIN_OAUTH_TOKEN_REFRESH_BUFFER_MS
  );
}

export async function resolveExternalTmsSecretMaterial(input: {
  credential: ExternalTmsCredential;
  fetchFn?: typeof fetch;
}) {
  const secretMaterial = unwrapProviderCredentialCrypto(
    decryptProviderCredential({
      algorithm: input.credential.encryptionAlgorithm,
      keyVersion: input.credential.keyVersion,
      ciphertext: input.credential.ciphertext,
      iv: input.credential.iv,
      authTag: input.credential.authTag,
    }),
  );

  if (
    input.credential.providerKind !== "crowdin" ||
    input.credential.authMode !== CROWDIN_OAUTH_AUTH_MODE
  ) {
    return secretMaterial;
  }

  throw new Error("crowdin_user_connection_required");
}

export async function resolveDeprecatedCrowdinOAuthSecretMaterial(input: {
  credential: ExternalTmsCredential;
  fetchFn?: typeof fetch;
}) {
  const tokenBundle = decryptCrowdinOAuthTokenBundle(input.credential);
  if (isCrowdinOAuthAccessTokenFresh(tokenBundle)) {
    return tokenBundle.accessToken;
  }

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${[
        "crowdin_oauth_refresh",
        input.credential.id,
      ].join(":")}, 0))`,
    );

    const [freshCredential] = await tx
      .select()
      .from(schema.organizationExternalTmsProviderCredentials)
      .where(eq(schema.organizationExternalTmsProviderCredentials.id, input.credential.id))
      .limit(1);

    if (!freshCredential) {
      throw new Error("provider_credential_not_found");
    }

    const lockedTokenBundle = decryptCrowdinOAuthTokenBundle(freshCredential);
    if (isCrowdinOAuthAccessTokenFresh(lockedTokenBundle)) {
      return lockedTokenBundle.accessToken;
    }

    const refreshed = await refreshCrowdinOAuthToken({
      tokenBundle: lockedTokenBundle,
      fetchFn: input.fetchFn,
    });
    const encrypted = unwrapProviderCredentialCrypto(
      encryptProviderCredential(JSON.stringify(refreshed)),
    );

    await tx
      .update(schema.organizationExternalTmsProviderCredentials)
      .set({
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        encryptionAlgorithm: encrypted.algorithm,
        keyVersion: encrypted.keyVersion,
        oauthExpiresAt: new Date(refreshed.expiresAt),
        updatedAt: new Date(),
      })
      .where(eq(schema.organizationExternalTmsProviderCredentials.id, input.credential.id));

    return refreshed.accessToken;
  });
}

export async function refreshCrowdinOAuthToken(input: {
  tokenBundle: CrowdinOAuthTokenBundle;
  fetchFn?: typeof fetch;
}): Promise<CrowdinOAuthTokenBundle> {
  const response = await (input.fetchFn ?? fetch)("https://accounts.crowdin.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: input.tokenBundle.clientId,
      client_secret: input.tokenBundle.clientSecret,
      refresh_token: input.tokenBundle.refreshToken,
    }),
    redirect: "error",
  });

  if (!response.ok) {
    throw new Error("crowdin_oauth_refresh_failed");
  }

  const body = await response.json();
  return mapCrowdinOAuthTokenResponse(body, {
    clientId: input.tokenBundle.clientId,
    clientSecret: input.tokenBundle.clientSecret,
  });
}

export function getCrowdinOAuthClientFromCredential(credential: ExternalTmsCredential) {
  if (credential.providerKind !== "crowdin" || credential.authMode !== CROWDIN_OAUTH_AUTH_MODE) {
    throw new Error("crowdin_oauth_credential_required");
  }

  return decryptCrowdinOAuthClientMaterial(credential);
}

export function mapCrowdinOAuthTokenResponse(
  body: unknown,
  client: { clientId: string; clientSecret: string },
): CrowdinOAuthTokenBundle {
  const parsed = z
    .object({
      access_token: z.string().min(1),
      refresh_token: z.string().min(1),
      token_type: z.string().min(1).default("bearer"),
      expires_in: z.number().positive(),
    })
    .safeParse(body);

  if (!parsed.success) {
    throw new Error("crowdin_oauth_token_response_invalid");
  }

  return {
    clientId: client.clientId,
    clientSecret: client.clientSecret,
    accessToken: parsed.data.access_token,
    refreshToken: parsed.data.refresh_token,
    tokenType: parsed.data.token_type,
    expiresAt: new Date(Date.now() + parsed.data.expires_in * 1000).toISOString(),
  };
}

async function normalizeExternalTmsCredentialBaseUrl(input: {
  providerKind: ExternalTmsProviderKind;
  region: string | null;
  baseUrl: string | null;
}) {
  if (!input.baseUrl?.trim()) return null;

  const defaultBaseUrl = getExternalTmsDefaultBaseUrl(input.providerKind, input.region);
  const normalized = normalizeProviderBaseUrl(input.baseUrl, defaultBaseUrl);
  if (!normalized) {
    throw new Error("provider_base_url_invalid");
  }

  await assertProviderUrlResolvable(normalized);
  return normalized;
}

function getExternalTmsDefaultBaseUrl(
  providerKind: ExternalTmsProviderKind,
  region: string | null,
) {
  switch (providerKind) {
    case "crowdin":
      return "https://api.crowdin.com/api/v2";
    case "phrase":
      return resolvePhraseBaseUrl({ region });
    case "lokalise":
      return "https://api.lokalise.com/api2";
    case "smartling":
      return "https://api.smartling.com/auth-api/v2";
  }
}

export async function revealOrganizationExternalTmsProviderCredential(input: {
  organizationId: string;
  role: OrganizationMembershipRole;
  providerKind: ExternalTmsProviderKind;
}) {
  assertExternalTmsCredentialAdmin(input.role);

  const [credential] = await db
    .select()
    .from(schema.organizationExternalTmsProviderCredentials)
    .where(
      and(
        eq(schema.organizationExternalTmsProviderCredentials.organizationId, input.organizationId),
        eq(schema.organizationExternalTmsProviderCredentials.providerKind, input.providerKind),
      ),
    )
    .limit(1);

  if (!credential) return null;
  if (credential.providerKind === "crowdin" && credential.authMode === CROWDIN_OAUTH_AUTH_MODE) {
    throw new Error("crowdin_oauth_secret_unavailable");
  }

  return {
    summary: credential,
    secretMaterial: unwrapProviderCredentialCrypto(
      decryptProviderCredential({
        algorithm: credential.encryptionAlgorithm,
        keyVersion: credential.keyVersion,
        ciphertext: credential.ciphertext,
        iv: credential.iv,
        authTag: credential.authTag,
      }),
    ),
  };
}

function safeJsonParse(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

export async function deleteOrganizationExternalTmsProviderCredential(input: {
  organizationId: string;
  role: OrganizationMembershipRole;
  providerKind: ExternalTmsProviderKind;
}) {
  assertExternalTmsCredentialAdmin(input.role);

  const deleted = await db
    .delete(schema.organizationExternalTmsProviderCredentials)
    .where(
      and(
        eq(schema.organizationExternalTmsProviderCredentials.organizationId, input.organizationId),
        eq(schema.organizationExternalTmsProviderCredentials.providerKind, input.providerKind),
      ),
    )
    .returning({ id: schema.organizationExternalTmsProviderCredentials.id });

  return deleted.length > 0;
}
