import { createHash, randomBytes } from "node:crypto";

import { and, eq, gt, isNull } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { validator } from "hono/validator";

import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { hasCapability } from "@/api/auth/policy";
import { env } from "@/lib/env";
import { isErr, ok, type Result } from "@/lib/primitives/result/results";
import { db, schema, type DatabaseClient } from "@/lib/database";
import {
  withWorkspaceResourceLimit,
  workspaceResourceFeatureIds,
  workspaceResourceLimitErrorDetails,
  workspaceResourceLimitMessage,
  type WorkspaceResourceLimitError,
} from "@/lib/billing/workspace-resource-limits";
import {
  crowdinUsesPerUserAuth,
  API_TOKEN_AUTH_MODE,
  OAUTH_AUTH_MODE,
  PAT_AUTH_MODE,
  assertExternalTmsCredentialAdmin,
  deleteOrganizationExternalTmsProviderCredential,
  getActiveOrganizationExternalTmsProviderCredentialRow,
  getCrowdinOAuthClientFromCredential,
  getLokaliseOAuthClientFromCredential,
  getPhraseOAuthClientFromCredential,
  getActiveOrganizationExternalTmsProviderCredential,
  getOrganizationExternalTmsProviderCredentialSummary,
  listOrganizationExternalTmsProviderCredentialDetails,
  mapCrowdinOAuthTokenResponse,
  mapLokaliseOAuthTokenResponse,
  mapPhraseOAuthTokenResponse,
  revealOrganizationExternalTmsProviderCredential,
  upsertCrowdinOAuthProviderCredential,
  upsertCrowdinPatProviderCredential,
  upsertLokaliseOAuthProviderCredential,
  upsertOrganizationExternalTmsProviderCredential,
  upsertPhraseOAuthProviderCredential,
} from "@/lib/providers/organization-external-tms-provider-credentials";
import {
  checkExternalTmsProviderHealth,
  persistExternalTmsProviderHealth,
} from "@/lib/providers/external-tms-health-check";
import { isCrowdinEnterpriseApiBaseUrl, resolveCrowdinApiBaseUrl } from "@/lib/providers/adapters/crowdin/crowdin-base-url";
import { getCrowdinOAuthScopeString } from "@/lib/providers/adapters/crowdin/crowdin-oauth-scopes";
import { CrowdinApiClient, CrowdinApiError } from "@/lib/providers/adapters/crowdin/crowdin-api";
import {
  getCrowdinUserConnectionSummary,
  upsertCrowdinUserConnection,
  upsertCrowdinUserPatConnection,
} from "@/lib/providers/adapters/crowdin/crowdin-user-connections";
import {
  PhraseTmsApiClient,
  PhraseTmsApiError,
} from "@/lib/providers/adapters/phrase/phrase-tms-api";
import { getPhraseOAuthScopeString } from "@/lib/providers/adapters/phrase/phrase-oauth-scopes";
import { resolvePhraseTmsBaseUrl } from "@/lib/providers/adapters/phrase/phrase-tms-base-url";
import {
  getPhraseUserConnectionSummary,
  upsertPhraseUserConnection,
} from "@/lib/providers/adapters/phrase/phrase-user-connections";
import { getLokaliseOAuthScopeString } from "@/lib/providers/adapters/lokalise/lokalise-oauth-scopes";
import {
  LokaliseApiClient,
  LokaliseApiError,
  LokaliseOAuthUserResolutionError,
} from "@/lib/providers/adapters/lokalise/lokalise-api";
import {
  getLokaliseUserConnectionSummary,
  upsertLokaliseUserConnection,
} from "@/lib/providers/adapters/lokalise/lokalise-user-connections";
import { getTmsUserConnectCtaState } from "@/lib/providers/tms-user-connection";
import { createLogger } from "@/lib/log";

import {
  crowdinOAuthStartBodySchema,
  crowdinPatSetupBodySchema,
  crowdinUserOAuthStartBodySchema,
  crowdinUserPatBodySchema,
  externalTmsProviderKindSchema,
  lokaliseOAuthStartBodySchema,
  lokaliseUserOAuthStartBodySchema,
  phraseOAuthStartBodySchema,
  phraseUserOAuthStartBodySchema,
  revealExternalTmsProviderCredentialBodySchema,
  upsertExternalTmsProviderCredentialBodySchema,
} from "./external-tms-provider-credential.schema";
import { normalizeUserOAuthReturnTo } from "./normalize-user-oauth-return-to";
import {
  buildTmsUserOAuthProfileLookupLogContext,
  buildTmsUserOAuthTokenExchangeErroredLogContext,
  buildTmsUserOAuthTokenExchangeFailedLogContext,
  buildTmsUserPatLinkLogContext,
  readOAuthTokenErrorResponseBody,
} from "./tms-user-oauth-log-context";

const CROWDIN_USER_OAUTH_STATE_TTL_MS = 60 * 60 * 1000;
const PHRASE_USER_OAUTH_STATE_TTL_MS = 60 * 60 * 1000;
const LOKALISE_USER_OAUTH_STATE_TTL_MS = 60 * 60 * 1000;
const logger = createLogger("tms-user-oauth");

async function withNewIntegrationLimit<T>(
  input: {
    organizationId: string;
    providerKind: typeof schema.organizationExternalTmsProviderCredentials.$inferSelect.providerKind;
  },
  run: (database: DatabaseClient) => Promise<T>,
): Promise<Result<T, WorkspaceResourceLimitError>> {
  const [existing] = await db
    .select({ id: schema.organizationExternalTmsProviderCredentials.id })
    .from(schema.organizationExternalTmsProviderCredentials)
    .where(
      and(
        eq(schema.organizationExternalTmsProviderCredentials.organizationId, input.organizationId),
        eq(schema.organizationExternalTmsProviderCredentials.providerKind, input.providerKind),
      ),
    )
    .limit(1);

  if (existing) return ok(await db.transaction(run));

  return withWorkspaceResourceLimit(
    {
      organizationId: input.organizationId,
      featureId: workspaceResourceFeatureIds.integrations,
    },
    run,
  );
}

function integrationLimitErrorResponse(limitError: WorkspaceResourceLimitError): {
  body: Record<string, unknown>;
  status: 409 | 503;
} {
  return {
    body: {
      error: limitError.code,
      message:
        limitError.code === "workspace_resource_limit_check_failed"
          ? "Unable to verify integration limits. Try again later."
          : workspaceResourceLimitMessage(limitError.featureId),
      details: workspaceResourceLimitErrorDetails(limitError),
    },
    status: limitError.code === "workspace_resource_limit_check_failed" ? 503 : 409,
  };
}

const validateUpsertBody = validator("json", (value, c) => {
  const parsed = upsertExternalTmsProviderCredentialBodySchema.safeParse(value);
  if (!parsed.success)
    return c.json({ error: "invalid_external_tms_provider_credential_payload" }, 400);
  return parsed.data;
});

const validateRevealBody = validator("json", (value, c) => {
  const parsed = revealExternalTmsProviderCredentialBodySchema.safeParse(value);
  if (!parsed.success)
    return c.json({ error: "invalid_external_tms_provider_credential_payload" }, 400);
  return parsed.data;
});

const validateCrowdinOAuthStartBody = validator("json", (value, c) => {
  const parsed = crowdinOAuthStartBodySchema.safeParse(value);
  if (!parsed.success) return c.json({ error: "invalid_crowdin_oauth_start_payload" }, 400);
  return parsed.data;
});

const validateCrowdinUserOAuthStartBody = validator("json", (value, c) => {
  const parsed = crowdinUserOAuthStartBodySchema.safeParse(value);
  if (!parsed.success) return c.json({ error: "invalid_crowdin_user_oauth_start_payload" }, 400);
  return parsed.data;
});

const validateCrowdinPatSetupBody = validator("json", (value, c) => {
  const parsed = crowdinPatSetupBodySchema.safeParse(value);
  if (!parsed.success) return c.json({ error: "invalid_crowdin_pat_setup_payload" }, 400);
  return parsed.data;
});

const validateCrowdinUserPatBody = validator("json", (value, c) => {
  const parsed = crowdinUserPatBodySchema.safeParse(value);
  if (!parsed.success) return c.json({ error: "invalid_crowdin_user_pat_payload" }, 400);
  return parsed.data;
});

const validatePhraseOAuthStartBody = validator("json", (value, c) => {
  const parsed = phraseOAuthStartBodySchema.safeParse(value);
  if (!parsed.success) return c.json({ error: "invalid_phrase_oauth_start_payload" }, 400);
  return parsed.data;
});

const validateLokaliseOAuthStartBody = validator("json", (value, c) => {
  const parsed = lokaliseOAuthStartBodySchema.safeParse(value);
  if (!parsed.success) return c.json({ error: "invalid_lokalise_oauth_start_payload" }, 400);
  return parsed.data;
});

const validatePhraseUserOAuthStartBody = validator("json", (value, c) => {
  const parsed = phraseUserOAuthStartBodySchema.safeParse(value);
  if (!parsed.success) return c.json({ error: "invalid_phrase_user_oauth_start_payload" }, 400);
  return parsed.data;
});

const validateLokaliseUserOAuthStartBody = validator("json", (value, c) => {
  const parsed = lokaliseUserOAuthStartBodySchema.safeParse(value);
  if (!parsed.success) return c.json({ error: "invalid_lokalise_user_oauth_start_payload" }, 400);
  return parsed.data;
});

type ExternalTmsProviderCredentialRouteContext = Context<{ Variables: AuthVariables }>;

function getCrowdinOAuthRequestOrigin(c: ExternalTmsProviderCredentialRouteContext) {
  if (env.HYPERLOCALISE_PUBLIC_APP_URL) {
    return new URL(env.HYPERLOCALISE_PUBLIC_APP_URL).origin;
  }

  return new URL(c.req.url).origin;
}

function getCrowdinOAuthRedirectUri(
  c: ExternalTmsProviderCredentialRouteContext,
  organizationSlug: string,
) {
  return `${getCrowdinOAuthRequestOrigin(c)}/api/orgs/${encodeURIComponent(organizationSlug)}/external-tms-provider-credential/crowdin/oauth/callback`;
}

function getPhraseOAuthRedirectUri(
  c: ExternalTmsProviderCredentialRouteContext,
  organizationSlug: string,
) {
  return `${getCrowdinOAuthRequestOrigin(c)}/api/orgs/${encodeURIComponent(organizationSlug)}/external-tms-provider-credential/phrase/oauth/callback`;
}

function getLokaliseOAuthRedirectUri(
  c: ExternalTmsProviderCredentialRouteContext,
  organizationSlug: string,
) {
  return `${getCrowdinOAuthRequestOrigin(c)}/api/orgs/${encodeURIComponent(organizationSlug)}/external-tms-provider-credential/lokalise/oauth/callback`;
}

function getOAuthClientFromPayload(payload: {
  oauthClientId?: string;
  oauthClientSecret?: string;
}) {
  if (!payload.oauthClientId || !payload.oauthClientSecret) {
    return undefined;
  }

  return {
    clientId: payload.oauthClientId,
    clientSecret: payload.oauthClientSecret,
  };
}

function oauthClientRequiredErrorResponse(providerKind: "crowdin" | "phrase" | "lokalise") {
  return {
    error: `${providerKind}_oauth_client_required`,
    message: "OAuth client ID and client secret are required when connecting for the first time.",
  };
}

function base64Url(input: Buffer) {
  return input.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function createCodeChallenge(codeVerifier: string) {
  return base64Url(createHash("sha256").update(codeVerifier).digest());
}

function appendRelativeRedirectParam(path: string, key: string, value: string) {
  const url = new URL(path, "https://app.hyperlocalise.local");
  url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
}

function redirectToUserOAuthReturnTo(
  c: ExternalTmsProviderCredentialRouteContext,
  input: {
    returnTo: string | null | undefined;
    organizationSlug: string;
    error: string;
  },
) {
  return c.redirect(
    appendRelativeRedirectParam(
      normalizeUserOAuthReturnTo(input.returnTo, input.organizationSlug),
      "error",
      input.error,
    ),
  );
}

async function findActiveCrowdinUserOAuthState(
  c: ExternalTmsProviderCredentialRouteContext,
  stateParam: string,
  now: Date,
) {
  const [state] = await db
    .select()
    .from(schema.crowdinUserOAuthStates)
    .where(
      and(
        eq(schema.crowdinUserOAuthStates.nonce, stateParam),
        eq(
          schema.crowdinUserOAuthStates.organizationId,
          c.var.auth.organization.localOrganizationId,
        ),
        eq(schema.crowdinUserOAuthStates.userId, c.var.auth.user.localUserId),
        gt(schema.crowdinUserOAuthStates.expiresAt, now),
        isNull(schema.crowdinUserOAuthStates.consumedAt),
      ),
    )
    .limit(1);

  logger.info(
    {
      found: Boolean(state),
      organizationId: c.var.auth.organization.localOrganizationId,
      userId: c.var.auth.user.localUserId,
    },
    "crowdin user oauth state lookup completed",
  );

  return state ?? null;
}

async function findActivePhraseUserOAuthState(
  c: ExternalTmsProviderCredentialRouteContext,
  stateParam: string,
  now: Date,
) {
  const [state] = await db
    .select()
    .from(schema.phraseUserOAuthStates)
    .where(
      and(
        eq(schema.phraseUserOAuthStates.nonce, stateParam),
        eq(
          schema.phraseUserOAuthStates.organizationId,
          c.var.auth.organization.localOrganizationId,
        ),
        eq(schema.phraseUserOAuthStates.userId, c.var.auth.user.localUserId),
        gt(schema.phraseUserOAuthStates.expiresAt, now),
        isNull(schema.phraseUserOAuthStates.consumedAt),
      ),
    )
    .limit(1);

  logger.info(
    {
      found: Boolean(state),
      organizationId: c.var.auth.organization.localOrganizationId,
      userId: c.var.auth.user.localUserId,
    },
    "phrase user oauth state lookup completed",
  );

  return state ?? null;
}

async function findActiveLokaliseUserOAuthState(
  c: ExternalTmsProviderCredentialRouteContext,
  stateParam: string,
  now: Date,
) {
  const [state] = await db
    .select()
    .from(schema.lokaliseUserOAuthStates)
    .where(
      and(
        eq(schema.lokaliseUserOAuthStates.nonce, stateParam),
        eq(
          schema.lokaliseUserOAuthStates.organizationId,
          c.var.auth.organization.localOrganizationId,
        ),
        eq(schema.lokaliseUserOAuthStates.userId, c.var.auth.user.localUserId),
        gt(schema.lokaliseUserOAuthStates.expiresAt, now),
        isNull(schema.lokaliseUserOAuthStates.consumedAt),
      ),
    )
    .limit(1);

  logger.info(
    {
      found: Boolean(state),
      organizationId: c.var.auth.organization.localOrganizationId,
      userId: c.var.auth.user.localUserId,
    },
    "lokalise user oauth state lookup completed",
  );

  return state ?? null;
}

async function completeCrowdinUserOAuthLink(
  c: ExternalTmsProviderCredentialRouteContext,
  input: {
    code: string;
    codeVerifier: string;
    client: { clientId: string; clientSecret: string };
    credential: typeof schema.organizationExternalTmsProviderCredentials.$inferSelect;
    redirectUri: string;
    organizationSlug: string;
    returnTo: string | null | undefined;
    exchangeFailedError: string;
    consumeState: () => Promise<void>;
  },
) {
  if (!hasCapability(c.var.auth.membership.role, "jobs:read")) {
    logger.warn(
      {
        organizationId: c.var.auth.organization.localOrganizationId,
        userId: c.var.auth.user.localUserId,
        role: c.var.auth.membership.role,
      },
      "crowdin user oauth callback rejected: missing jobs read capability",
    );
    return redirectToUserOAuthReturnTo(c, {
      returnTo: input.returnTo,
      organizationSlug: input.organizationSlug,
      error: "forbidden",
    });
  }

  let tokenBundle: ReturnType<typeof mapCrowdinOAuthTokenResponse>;
  try {
    const response = await fetch("https://accounts.crowdin.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: input.client.clientId,
        client_secret: input.client.clientSecret,
        redirect_uri: input.redirectUri,
        code: input.code,
        code_verifier: input.codeVerifier,
      }),
    });
    if (!response.ok) {
      logger.warn(
        {
          organizationId: c.var.auth.organization.localOrganizationId,
          userId: c.var.auth.user.localUserId,
          providerCredentialId: input.credential.id,
          ...buildTmsUserOAuthTokenExchangeFailedLogContext({
            provider: "crowdin",
            credentialBaseUrl: input.credential.baseUrl,
            status: response.status,
            redirectUri: input.redirectUri,
            responseBody: await readOAuthTokenErrorResponseBody(response),
          }),
        },
        "crowdin user oauth token exchange failed",
      );
      return redirectToUserOAuthReturnTo(c, {
        returnTo: input.returnTo,
        organizationSlug: input.organizationSlug,
        error: input.exchangeFailedError,
      });
    }
    tokenBundle = mapCrowdinOAuthTokenResponse(await response.json(), input.client);
  } catch (error) {
    logger.warn(
      {
        organizationId: c.var.auth.organization.localOrganizationId,
        userId: c.var.auth.user.localUserId,
        providerCredentialId: input.credential.id,
        ...buildTmsUserOAuthTokenExchangeErroredLogContext({
          provider: "crowdin",
          credentialBaseUrl: input.credential.baseUrl,
          redirectUri: input.redirectUri,
          error,
        }),
      },
      "crowdin user oauth token exchange errored",
    );
    return redirectToUserOAuthReturnTo(c, {
      returnTo: input.returnTo,
      organizationSlug: input.organizationSlug,
      error: input.exchangeFailedError,
    });
  }

  let crowdinUser: Awaited<ReturnType<CrowdinApiClient["getAuthenticatedUser"]>>;
  try {
    crowdinUser = await new CrowdinApiClient({
      token: tokenBundle.accessToken,
      baseUrl: input.credential.baseUrl ?? undefined,
    }).getAuthenticatedUser();
  } catch (error) {
    logger.warn(
      {
        organizationId: c.var.auth.organization.localOrganizationId,
        userId: c.var.auth.user.localUserId,
        providerCredentialId: input.credential.id,
        ...buildTmsUserOAuthProfileLookupLogContext({
          provider: "crowdin",
          credentialBaseUrl: input.credential.baseUrl,
          error,
        }),
      },
      "crowdin user oauth profile lookup failed",
    );
    if (error instanceof CrowdinApiError && error.status === 401) {
      return redirectToUserOAuthReturnTo(c, {
        returnTo: input.returnTo,
        organizationSlug: input.organizationSlug,
        error: isCrowdinEnterpriseApiBaseUrl(input.credential.baseUrl)
          ? "crowdin_user_oauth_enterprise_mismatch"
          : "crowdin_user_oauth_invalid",
      });
    }
    return redirectToUserOAuthReturnTo(c, {
      returnTo: input.returnTo,
      organizationSlug: input.organizationSlug,
      error: "crowdin_user_lookup_failed",
    });
  }

  const upsertResult = await upsertCrowdinUserConnection({
    organizationId: c.var.auth.organization.localOrganizationId,
    userId: c.var.auth.user.localUserId,
    providerCredentialId: input.credential.id,
    tokenBundle,
    crowdinUser: {
      id: crowdinUser.id,
      username: crowdinUser.username,
      email: crowdinUser.email,
      fullName: crowdinUser.fullName,
    },
  });
  if (isErr(upsertResult)) {
    logger.warn(
      {
        organizationId: c.var.auth.organization.localOrganizationId,
        userId: c.var.auth.user.localUserId,
        providerCredentialId: input.credential.id,
        crowdinUserId: crowdinUser.id,
        code: upsertResult.error.code,
      },
      "crowdin user oauth connection upsert rejected",
    );
    return c.redirect(
      appendRelativeRedirectParam(
        normalizeUserOAuthReturnTo(input.returnTo, input.organizationSlug),
        "error",
        "crowdin_user_already_linked",
      ),
    );
  }

  await input.consumeState();

  logger.info(
    {
      organizationId: c.var.auth.organization.localOrganizationId,
      userId: c.var.auth.user.localUserId,
      providerCredentialId: input.credential.id,
      crowdinUserId: crowdinUser.id,
      connectionId: upsertResult.value.id,
    },
    "crowdin user oauth connection linked",
  );

  return c.redirect(normalizeUserOAuthReturnTo(input.returnTo, input.organizationSlug));
}

async function completeCrowdinUserPatLink(
  c: ExternalTmsProviderCredentialRouteContext,
  input: {
    personalAccessToken: string;
    credential: typeof schema.organizationExternalTmsProviderCredentials.$inferSelect;
  },
) {
  const personalAccessToken = input.personalAccessToken.trim();
  const patLinkContext = buildTmsUserPatLinkLogContext({
    credentialAuthMode: input.credential.authMode,
    credentialBaseUrl: input.credential.baseUrl,
    personalAccessTokenLength: personalAccessToken.length,
  });
  const resolvedBaseUrl = resolveCrowdinApiBaseUrl(input.credential.baseUrl);

  logger.info(
    {
      organizationId: c.var.auth.organization.localOrganizationId,
      userId: c.var.auth.user.localUserId,
      providerCredentialId: input.credential.id,
      ...patLinkContext,
    },
    "crowdin user pat profile lookup starting",
  );

  let crowdinUser: CrowdinAuthenticatedUser;
  try {
    crowdinUser = await new CrowdinApiClient({
      token: personalAccessToken,
      baseUrl: resolvedBaseUrl,
    }).getAuthenticatedUser();
  } catch (error) {
    const profileLookupContext = buildTmsUserOAuthProfileLookupLogContext({
      provider: "crowdin",
      credentialBaseUrl: input.credential.baseUrl,
      error,
    });

    logger.warn(
      {
        organizationId: c.var.auth.organization.localOrganizationId,
        userId: c.var.auth.user.localUserId,
        providerCredentialId: input.credential.id,
        ...patLinkContext,
        ...profileLookupContext,
      },
      "crowdin user pat profile lookup failed",
    );

    const status = error instanceof CrowdinApiError ? error.status : null;
    if (status === 401 && patLinkContext.usingDefaultBaseUrl) {
      return c.json(
        {
          error: "crowdin_pat_base_url_required",
          message:
            "Crowdin rejected this token against the default api.crowdin.com endpoint. If you use Crowdin Enterprise, set the API base URL (for example https://yourorg.api.crowdin.com/api/v2) in Integrations before connecting.",
        },
        400,
      );
    }

    return c.json(
      {
        error:
          status === 401 && isCrowdinEnterpriseApiBaseUrl(input.credential.baseUrl)
            ? "crowdin_user_pat_enterprise_mismatch"
            : "crowdin_user_pat_invalid",
        message:
          status === 401
            ? "Crowdin rejected this personal access token. Check that the token was created in the same Crowdin workspace as the configured base URL."
            : "Unable to verify this Crowdin personal access token.",
      },
      400,
    );
  }

  logger.info(
    {
      organizationId: c.var.auth.organization.localOrganizationId,
      userId: c.var.auth.user.localUserId,
      providerCredentialId: input.credential.id,
      crowdinUserId: crowdinUser.id,
      ...patLinkContext,
    },
    "crowdin user pat profile lookup succeeded",
  );

  const upsertResult = await upsertCrowdinUserPatConnection({
    organizationId: c.var.auth.organization.localOrganizationId,
    userId: c.var.auth.user.localUserId,
    providerCredentialId: input.credential.id,
    personalAccessToken,
    crowdinUser: {
      id: crowdinUser.id,
      username: crowdinUser.username,
      email: crowdinUser.email,
      fullName: crowdinUser.fullName,
    },
  });
  if (isErr(upsertResult)) {
    logger.warn(
      {
        organizationId: c.var.auth.organization.localOrganizationId,
        userId: c.var.auth.user.localUserId,
        providerCredentialId: input.credential.id,
        crowdinUserId: crowdinUser.id,
        code: upsertResult.error.code,
        ...patLinkContext,
      },
      "crowdin user pat connection upsert rejected",
    );
    return c.json(
      {
        error: "crowdin_user_already_linked",
        message: "This Crowdin account is already linked to another Hyperlocalise user.",
      },
      409,
    );
  }

  logger.info(
    {
      organizationId: c.var.auth.organization.localOrganizationId,
      userId: c.var.auth.user.localUserId,
      providerCredentialId: input.credential.id,
      crowdinUserId: crowdinUser.id,
      connectionId: upsertResult.value.id,
      ...patLinkContext,
    },
    "crowdin user pat connection linked",
  );

  return c.json({ crowdinUserConnection: upsertResult.value }, 200);
}

async function handleCrowdinUserOAuthCallback(
  c: ExternalTmsProviderCredentialRouteContext,
  state: NonNullable<Awaited<ReturnType<typeof findActiveCrowdinUserOAuthState>>>,
  code: string,
  organizationSlug: string,
  redirectUri: string,
) {
  const [credential] = await db
    .select()
    .from(schema.organizationExternalTmsProviderCredentials)
    .where(
      and(
        eq(schema.organizationExternalTmsProviderCredentials.id, state.providerCredentialId),
        eq(
          schema.organizationExternalTmsProviderCredentials.organizationId,
          c.var.auth.organization.localOrganizationId,
        ),
        eq(schema.organizationExternalTmsProviderCredentials.providerKind, "crowdin"),
      ),
    )
    .limit(1);
  if (!credential || credential.authMode !== OAUTH_AUTH_MODE) {
    logger.warn(
      {
        organizationId: c.var.auth.organization.localOrganizationId,
        userId: c.var.auth.user.localUserId,
        stateId: state.id,
        providerCredentialId: state.providerCredentialId,
        credentialFound: Boolean(credential),
        authMode: credential?.authMode ?? null,
      },
      "crowdin user oauth callback rejected: credential unavailable",
    );
    return redirectToUserOAuthReturnTo(c, {
      returnTo: state.returnTo,
      organizationSlug,
      error: "crowdin_integration_not_connected",
    });
  }

  const client = getCrowdinOAuthClientFromCredential(credential);

  return completeCrowdinUserOAuthLink(c, {
    code,
    codeVerifier: state.codeVerifier,
    client,
    credential,
    redirectUri,
    organizationSlug,
    returnTo: state.returnTo,
    exchangeFailedError: "crowdin_user_oauth_exchange_failed",
    consumeState: async () => {
      await db
        .update(schema.crowdinUserOAuthStates)
        .set({ consumedAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.crowdinUserOAuthStates.id, state.id));
    },
  });
}

async function completePhraseUserOAuthLink(
  c: ExternalTmsProviderCredentialRouteContext,
  input: {
    code: string;
    codeVerifier: string;
    client: { clientId: string; clientSecret: string };
    credential: typeof schema.organizationExternalTmsProviderCredentials.$inferSelect;
    redirectUri: string;
    organizationSlug: string;
    returnTo: string | null | undefined;
    consumeState: () => Promise<void>;
  },
) {
  if (!hasCapability(c.var.auth.membership.role, "jobs:read")) {
    logger.warn(
      {
        organizationId: c.var.auth.organization.localOrganizationId,
        userId: c.var.auth.user.localUserId,
        role: c.var.auth.membership.role,
      },
      "phrase user oauth callback rejected: missing jobs read capability",
    );
    return redirectToUserOAuthReturnTo(c, {
      returnTo: input.returnTo,
      organizationSlug: input.organizationSlug,
      error: "forbidden",
    });
  }

  let tokenBundle: ReturnType<typeof mapPhraseOAuthTokenResponse>;
  try {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: input.client.clientId,
      client_secret: input.client.clientSecret,
      redirect_uri: input.redirectUri,
      code: input.code,
      code_verifier: input.codeVerifier,
    });
    const response = await fetch(
      `${resolvePhraseTmsBaseUrl({ baseUrl: input.credential.baseUrl })}/oauth/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        redirect: "error",
      },
    );
    if (!response.ok) {
      logger.warn(
        {
          organizationId: c.var.auth.organization.localOrganizationId,
          userId: c.var.auth.user.localUserId,
          providerCredentialId: input.credential.id,
          ...buildTmsUserOAuthTokenExchangeFailedLogContext({
            provider: "phrase",
            credentialBaseUrl: input.credential.baseUrl,
            status: response.status,
            redirectUri: input.redirectUri,
            responseBody: await readOAuthTokenErrorResponseBody(response),
          }),
        },
        "phrase user oauth token exchange failed",
      );
      return redirectToUserOAuthReturnTo(c, {
        returnTo: input.returnTo,
        organizationSlug: input.organizationSlug,
        error: "phrase_user_oauth_exchange_failed",
      });
    }
    tokenBundle = mapPhraseOAuthTokenResponse(await response.json(), input.client);
  } catch (error) {
    logger.warn(
      {
        organizationId: c.var.auth.organization.localOrganizationId,
        userId: c.var.auth.user.localUserId,
        providerCredentialId: input.credential.id,
        ...buildTmsUserOAuthTokenExchangeErroredLogContext({
          provider: "phrase",
          credentialBaseUrl: input.credential.baseUrl,
          redirectUri: input.redirectUri,
          error,
        }),
      },
      "phrase user oauth token exchange errored",
    );
    return redirectToUserOAuthReturnTo(c, {
      returnTo: input.returnTo,
      organizationSlug: input.organizationSlug,
      error: "phrase_user_oauth_exchange_failed",
    });
  }

  let phraseUser: Awaited<ReturnType<PhraseTmsApiClient["getAuthenticatedUser"]>>;
  try {
    phraseUser = await new PhraseTmsApiClient({
      token: `${tokenBundle.tokenType} ${tokenBundle.accessToken}`,
      baseUrl: input.credential.baseUrl ?? undefined,
    }).getAuthenticatedUser();
  } catch (error) {
    logger.warn(
      {
        organizationId: c.var.auth.organization.localOrganizationId,
        userId: c.var.auth.user.localUserId,
        providerCredentialId: input.credential.id,
        ...buildTmsUserOAuthProfileLookupLogContext({
          provider: "phrase",
          credentialBaseUrl: input.credential.baseUrl,
          error,
        }),
      },
      "phrase user oauth profile lookup failed",
    );
    if (error instanceof PhraseTmsApiError && error.status === 401) {
      return redirectToUserOAuthReturnTo(c, {
        returnTo: input.returnTo,
        organizationSlug: input.organizationSlug,
        error: "phrase_user_oauth_invalid",
      });
    }
    return redirectToUserOAuthReturnTo(c, {
      returnTo: input.returnTo,
      organizationSlug: input.organizationSlug,
      error: "phrase_user_lookup_failed",
    });
  }

  const upsertResult = await upsertPhraseUserConnection({
    organizationId: c.var.auth.organization.localOrganizationId,
    userId: c.var.auth.user.localUserId,
    providerCredentialId: input.credential.id,
    tokenBundle,
    phraseUser,
  });
  if (isErr(upsertResult)) {
    logger.warn(
      {
        organizationId: c.var.auth.organization.localOrganizationId,
        userId: c.var.auth.user.localUserId,
        providerCredentialId: input.credential.id,
        phraseUserUid: phraseUser.uid,
        code: upsertResult.error.code,
      },
      "phrase user oauth connection upsert rejected",
    );
    return c.redirect(
      appendRelativeRedirectParam(
        normalizeUserOAuthReturnTo(input.returnTo, input.organizationSlug),
        "error",
        "phrase_user_already_linked",
      ),
    );
  }

  await input.consumeState();

  logger.info(
    {
      organizationId: c.var.auth.organization.localOrganizationId,
      userId: c.var.auth.user.localUserId,
      providerCredentialId: input.credential.id,
      phraseUserUid: phraseUser.uid,
      connectionId: upsertResult.value.id,
    },
    "phrase user oauth connection linked",
  );

  return c.redirect(normalizeUserOAuthReturnTo(input.returnTo, input.organizationSlug));
}

async function handlePhraseUserOAuthCallback(
  c: ExternalTmsProviderCredentialRouteContext,
  state: NonNullable<Awaited<ReturnType<typeof findActivePhraseUserOAuthState>>>,
  code: string,
  organizationSlug: string,
  redirectUri: string,
) {
  const [credential] = await db
    .select()
    .from(schema.organizationExternalTmsProviderCredentials)
    .where(
      and(
        eq(schema.organizationExternalTmsProviderCredentials.id, state.providerCredentialId),
        eq(
          schema.organizationExternalTmsProviderCredentials.organizationId,
          c.var.auth.organization.localOrganizationId,
        ),
        eq(schema.organizationExternalTmsProviderCredentials.providerKind, "phrase"),
      ),
    )
    .limit(1);
  if (!credential || credential.authMode !== OAUTH_AUTH_MODE) {
    logger.warn(
      {
        organizationId: c.var.auth.organization.localOrganizationId,
        userId: c.var.auth.user.localUserId,
        stateId: state.id,
        providerCredentialId: state.providerCredentialId,
        credentialFound: Boolean(credential),
        authMode: credential?.authMode ?? null,
      },
      "phrase user oauth callback rejected: credential unavailable",
    );
    return redirectToUserOAuthReturnTo(c, {
      returnTo: state.returnTo,
      organizationSlug,
      error: "phrase_integration_not_connected",
    });
  }

  const client = getPhraseOAuthClientFromCredential(credential);

  return completePhraseUserOAuthLink(c, {
    code,
    codeVerifier: state.codeVerifier,
    client,
    credential,
    redirectUri,
    organizationSlug,
    returnTo: state.returnTo,
    consumeState: async () => {
      await db
        .update(schema.phraseUserOAuthStates)
        .set({ consumedAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.phraseUserOAuthStates.id, state.id));
    },
  });
}

async function completeLokaliseUserOAuthLink(
  c: ExternalTmsProviderCredentialRouteContext,
  input: {
    code: string;
    client: { clientId: string; clientSecret: string };
    credential: typeof schema.organizationExternalTmsProviderCredentials.$inferSelect;
    redirectUri: string;
    organizationSlug: string;
    returnTo: string | null | undefined;
    consumeState: () => Promise<void>;
  },
) {
  if (!hasCapability(c.var.auth.membership.role, "jobs:read")) {
    logger.warn(
      {
        organizationId: c.var.auth.organization.localOrganizationId,
        userId: c.var.auth.user.localUserId,
        role: c.var.auth.membership.role,
      },
      "lokalise user oauth callback rejected: missing jobs read capability",
    );
    return redirectToUserOAuthReturnTo(c, {
      returnTo: input.returnTo,
      organizationSlug: input.organizationSlug,
      error: "forbidden",
    });
  }

  let tokenBundle: ReturnType<typeof mapLokaliseOAuthTokenResponse>;
  try {
    const response = await fetch("https://app.lokalise.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: input.client.clientId,
        client_secret: input.client.clientSecret,
        redirect_uri: input.redirectUri,
        code: input.code,
      }),
      redirect: "error",
    });
    if (!response.ok) {
      logger.warn(
        {
          organizationId: c.var.auth.organization.localOrganizationId,
          userId: c.var.auth.user.localUserId,
          providerCredentialId: input.credential.id,
          ...buildTmsUserOAuthTokenExchangeFailedLogContext({
            provider: "lokalise",
            credentialBaseUrl: input.credential.baseUrl,
            status: response.status,
            redirectUri: input.redirectUri,
            responseBody: await readOAuthTokenErrorResponseBody(response),
          }),
        },
        "lokalise user oauth token exchange failed",
      );
      return redirectToUserOAuthReturnTo(c, {
        returnTo: input.returnTo,
        organizationSlug: input.organizationSlug,
        error: "lokalise_user_oauth_exchange_failed",
      });
    }
    tokenBundle = mapLokaliseOAuthTokenResponse(await response.json(), input.client);
  } catch (error) {
    logger.warn(
      {
        organizationId: c.var.auth.organization.localOrganizationId,
        userId: c.var.auth.user.localUserId,
        providerCredentialId: input.credential.id,
        ...buildTmsUserOAuthTokenExchangeErroredLogContext({
          provider: "lokalise",
          credentialBaseUrl: input.credential.baseUrl,
          redirectUri: input.redirectUri,
          error,
        }),
      },
      "lokalise user oauth token exchange errored",
    );
    return redirectToUserOAuthReturnTo(c, {
      returnTo: input.returnTo,
      organizationSlug: input.organizationSlug,
      error: "lokalise_user_oauth_exchange_failed",
    });
  }

  let lokaliseUser: Awaited<ReturnType<LokaliseApiClient["resolveOAuthUserIdentity"]>>;
  try {
    lokaliseUser = await new LokaliseApiClient({
      token: `${tokenBundle.tokenType} ${tokenBundle.accessToken}`,
      baseUrl: input.credential.baseUrl ?? undefined,
    }).resolveOAuthUserIdentity();
  } catch (error) {
    logger.warn(
      {
        organizationId: c.var.auth.organization.localOrganizationId,
        userId: c.var.auth.user.localUserId,
        providerCredentialId: input.credential.id,
        ...buildTmsUserOAuthProfileLookupLogContext({
          provider: "lokalise",
          credentialBaseUrl: input.credential.baseUrl,
          error,
          resolutionCode: error instanceof LokaliseOAuthUserResolutionError ? error.code : null,
        }),
      },
      "lokalise user oauth profile lookup failed",
    );
    if (error instanceof LokaliseOAuthUserResolutionError && error.code === "no_projects") {
      return redirectToUserOAuthReturnTo(c, {
        returnTo: input.returnTo,
        organizationSlug: input.organizationSlug,
        error: "lokalise_user_no_projects",
      });
    }
    if (error instanceof LokaliseApiError && error.status === 401) {
      return redirectToUserOAuthReturnTo(c, {
        returnTo: input.returnTo,
        organizationSlug: input.organizationSlug,
        error: "lokalise_user_oauth_invalid",
      });
    }
    return redirectToUserOAuthReturnTo(c, {
      returnTo: input.returnTo,
      organizationSlug: input.organizationSlug,
      error: "lokalise_user_lookup_failed",
    });
  }

  const upsertResult = await upsertLokaliseUserConnection({
    organizationId: c.var.auth.organization.localOrganizationId,
    userId: c.var.auth.user.localUserId,
    providerCredentialId: input.credential.id,
    tokenBundle,
    lokaliseUser,
  });
  if (isErr(upsertResult)) {
    logger.warn(
      {
        organizationId: c.var.auth.organization.localOrganizationId,
        userId: c.var.auth.user.localUserId,
        providerCredentialId: input.credential.id,
        lokaliseUserId: lokaliseUser.id,
        code: upsertResult.error.code,
      },
      "lokalise user oauth connection upsert rejected",
    );
    return c.redirect(
      appendRelativeRedirectParam(
        normalizeUserOAuthReturnTo(input.returnTo, input.organizationSlug),
        "error",
        "lokalise_user_already_linked",
      ),
    );
  }

  await input.consumeState();

  logger.info(
    {
      organizationId: c.var.auth.organization.localOrganizationId,
      userId: c.var.auth.user.localUserId,
      providerCredentialId: input.credential.id,
      lokaliseUserId: lokaliseUser.id,
      connectionId: upsertResult.value.id,
    },
    "lokalise user oauth connection linked",
  );

  return c.redirect(normalizeUserOAuthReturnTo(input.returnTo, input.organizationSlug));
}

async function handleLokaliseUserOAuthCallback(
  c: ExternalTmsProviderCredentialRouteContext,
  state: NonNullable<Awaited<ReturnType<typeof findActiveLokaliseUserOAuthState>>>,
  code: string,
  organizationSlug: string,
) {
  const [credential] = await db
    .select()
    .from(schema.organizationExternalTmsProviderCredentials)
    .where(
      and(
        eq(schema.organizationExternalTmsProviderCredentials.id, state.providerCredentialId),
        eq(
          schema.organizationExternalTmsProviderCredentials.organizationId,
          c.var.auth.organization.localOrganizationId,
        ),
        eq(schema.organizationExternalTmsProviderCredentials.providerKind, "lokalise"),
      ),
    )
    .limit(1);
  if (!credential || credential.authMode !== OAUTH_AUTH_MODE) {
    logger.warn(
      {
        organizationId: c.var.auth.organization.localOrganizationId,
        userId: c.var.auth.user.localUserId,
        stateId: state.id,
        providerCredentialId: state.providerCredentialId,
        credentialFound: Boolean(credential),
        authMode: credential?.authMode ?? null,
      },
      "lokalise user oauth callback rejected: credential unavailable",
    );
    return redirectToUserOAuthReturnTo(c, {
      returnTo: state.returnTo,
      organizationSlug,
      error: "lokalise_integration_not_connected",
    });
  }

  const client = getLokaliseOAuthClientFromCredential(credential);

  return completeLokaliseUserOAuthLink(c, {
    code,
    client,
    credential,
    redirectUri: getLokaliseOAuthRedirectUri(c, organizationSlug),
    organizationSlug,
    returnTo: state.returnTo,
    consumeState: async () => {
      await db
        .update(schema.lokaliseUserOAuthStates)
        .set({ consumedAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.lokaliseUserOAuthStates.id, state.id));
    },
  });
}

async function createCrowdinUserOAuthAuthorization(input: {
  c: ExternalTmsProviderCredentialRouteContext;
  credential: typeof schema.organizationExternalTmsProviderCredentials.$inferSelect;
  organizationSlug: string;
  returnTo: string | null | undefined;
}) {
  const client = getCrowdinOAuthClientFromCredential(input.credential);
  const nonce = randomBytes(24).toString("hex");
  const codeVerifier = base64Url(randomBytes(48));
  const now = new Date();
  const returnTo = normalizeUserOAuthReturnTo(input.returnTo, input.organizationSlug);

  await db.insert(schema.crowdinUserOAuthStates).values({
    nonce,
    codeVerifier,
    organizationId: input.c.var.auth.organization.localOrganizationId,
    userId: input.c.var.auth.user.localUserId,
    providerCredentialId: input.credential.id,
    returnTo,
    expiresAt: new Date(now.getTime() + CROWDIN_USER_OAUTH_STATE_TTL_MS),
  });

  const authorizationUrl = new URL("https://accounts.crowdin.com/oauth/authorize");
  const redirectUri = getCrowdinOAuthRedirectUri(input.c, input.organizationSlug);
  authorizationUrl.searchParams.set("client_id", client.clientId);
  authorizationUrl.searchParams.set("redirect_uri", redirectUri);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("scope", getCrowdinOAuthScopeString());
  authorizationUrl.searchParams.set("state", nonce);
  authorizationUrl.searchParams.set("code_challenge", createCodeChallenge(codeVerifier));
  authorizationUrl.searchParams.set("code_challenge_method", "S256");

  return { authorizationUrl: authorizationUrl.toString(), redirectUri };
}

async function createPhraseUserOAuthAuthorization(input: {
  c: ExternalTmsProviderCredentialRouteContext;
  credential: typeof schema.organizationExternalTmsProviderCredentials.$inferSelect;
  organizationSlug: string;
  returnTo: string | null | undefined;
}) {
  const client = getPhraseOAuthClientFromCredential(input.credential);
  const nonce = randomBytes(24).toString("hex");
  const codeVerifier = base64Url(randomBytes(48));
  const now = new Date();
  const returnTo = normalizeUserOAuthReturnTo(input.returnTo, input.organizationSlug);

  await db.insert(schema.phraseUserOAuthStates).values({
    nonce,
    codeVerifier,
    organizationId: input.c.var.auth.organization.localOrganizationId,
    userId: input.c.var.auth.user.localUserId,
    providerCredentialId: input.credential.id,
    returnTo,
    expiresAt: new Date(now.getTime() + PHRASE_USER_OAUTH_STATE_TTL_MS),
  });

  const authorizationUrl = new URL(
    `${resolvePhraseTmsBaseUrl({ baseUrl: input.credential.baseUrl })}/oauth/authorize`,
  );
  const redirectUri = getPhraseOAuthRedirectUri(input.c, input.organizationSlug);
  authorizationUrl.searchParams.set("client_id", client.clientId);
  authorizationUrl.searchParams.set("redirect_uri", redirectUri);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("scope", getPhraseOAuthScopeString());
  authorizationUrl.searchParams.set("state", nonce);
  authorizationUrl.searchParams.set("code_challenge", createCodeChallenge(codeVerifier));
  authorizationUrl.searchParams.set("code_challenge_method", "S256");

  return { authorizationUrl: authorizationUrl.toString(), redirectUri };
}

async function createLokaliseUserOAuthAuthorization(input: {
  c: ExternalTmsProviderCredentialRouteContext;
  credential: typeof schema.organizationExternalTmsProviderCredentials.$inferSelect;
  organizationSlug: string;
  returnTo: string | null | undefined;
}) {
  const client = getLokaliseOAuthClientFromCredential(input.credential);
  const nonce = randomBytes(24).toString("hex");
  const now = new Date();
  const returnTo = normalizeUserOAuthReturnTo(input.returnTo, input.organizationSlug);

  await db.insert(schema.lokaliseUserOAuthStates).values({
    nonce,
    organizationId: input.c.var.auth.organization.localOrganizationId,
    userId: input.c.var.auth.user.localUserId,
    providerCredentialId: input.credential.id,
    returnTo,
    expiresAt: new Date(now.getTime() + LOKALISE_USER_OAUTH_STATE_TTL_MS),
  });

  const authorizationUrl = new URL("https://app.lokalise.com/oauth2/auth");
  const redirectUri = getLokaliseOAuthRedirectUri(input.c, input.organizationSlug);
  authorizationUrl.searchParams.set("client_id", client.clientId);
  authorizationUrl.searchParams.set("redirect_uri", redirectUri);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("scope", getLokaliseOAuthScopeString());
  authorizationUrl.searchParams.set("state", nonce);

  return { authorizationUrl: authorizationUrl.toString(), redirectUri };
}

export function createExternalTmsProviderCredentialRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", async (c) => {
      if (!hasCapability(c.var.auth.membership.role, "provider_credentials:read")) {
        return c.json({ error: "forbidden" }, 403);
      }

      const organizationId = c.var.auth.organization.localOrganizationId;
      const [providerCredentials, activeExternalTmsProviderCredential] = await Promise.all([
        listOrganizationExternalTmsProviderCredentialDetails(organizationId),
        getActiveOrganizationExternalTmsProviderCredential(organizationId),
      ]);

      return c.json(
        {
          externalTmsProviderCredentials: providerCredentials,
          activeExternalTmsProviderCredential,
        },
        200,
      );
    })
    .post("/crowdin/oauth-app", validateCrowdinOAuthStartBody, async (c) => {
      try {
        if (!hasCapability(c.var.auth.membership.role, "provider_credentials:write")) {
          return c.json({ error: "forbidden" }, 403);
        }
        const payload = c.req.valid("json");
        const organizationId = c.var.auth.organization.localOrganizationId;
        const oauthClient = getOAuthClientFromPayload(payload);
        const credentialResult = await withNewIntegrationLimit(
          {
            organizationId,
            providerKind: "crowdin",
          },
          (database) =>
            upsertCrowdinOAuthProviderCredential({
              organizationId,
              userId: c.var.auth.user.localUserId,
              role: c.var.auth.membership.role,
              displayName: payload.displayName,
              oauthClient,
              baseUrl: payload.baseUrl ?? null,
              db: database,
            }),
        );
        if (!credentialResult.ok) {
          const limitResponse = integrationLimitErrorResponse(credentialResult.error);
          return c.json(limitResponse.body, limitResponse.status);
        }

        const providerCredential = credentialResult.value;

        return c.json(
          {
            externalTmsProviderCredential: providerCredential,
            shouldConnectCrowdinUser: Boolean(oauthClient),
          },
          200,
        );
      } catch (error) {
        if (error instanceof Error && error.message === "crowdin_oauth_client_required") {
          return c.json(oauthClientRequiredErrorResponse("crowdin"), 400);
        }
        if (error instanceof Error && error.message === "provider_base_url_invalid") {
          return c.json(
            {
              error: "provider_base_url_invalid",
              message: "Provider base URL is invalid.",
            },
            400,
          );
        }
        throw error;
      }
    })
    .post("/crowdin/pat-setup", validateCrowdinPatSetupBody, async (c) => {
      try {
        if (!hasCapability(c.var.auth.membership.role, "provider_credentials:write")) {
          return c.json({ error: "forbidden" }, 403);
        }
        const payload = c.req.valid("json");
        const organizationId = c.var.auth.organization.localOrganizationId;
        const credentialResult = await withNewIntegrationLimit(
          {
            organizationId,
            providerKind: "crowdin",
          },
          (database) =>
            upsertCrowdinPatProviderCredential({
              organizationId,
              userId: c.var.auth.user.localUserId,
              role: c.var.auth.membership.role,
              displayName: payload.displayName,
              baseUrl: payload.baseUrl ?? null,
              db: database,
            }),
        );
        if (!credentialResult.ok) {
          const limitResponse = integrationLimitErrorResponse(credentialResult.error);
          return c.json(limitResponse.body, limitResponse.status);
        }

        return c.json(
          {
            externalTmsProviderCredential: credentialResult.value,
            shouldConnectCrowdinUser: true,
          },
          200,
        );
      } catch (error) {
        if (error instanceof Error && error.message === "provider_base_url_invalid") {
          return c.json(
            {
              error: "provider_base_url_invalid",
              message: "Provider base URL is invalid.",
            },
            400,
          );
        }
        throw error;
      }
    })
    .post("/phrase/oauth-app", validatePhraseOAuthStartBody, async (c) => {
      try {
        if (!hasCapability(c.var.auth.membership.role, "provider_credentials:write")) {
          return c.json({ error: "forbidden" }, 403);
        }
        const payload = c.req.valid("json");
        const organizationId = c.var.auth.organization.localOrganizationId;
        const oauthClient = getOAuthClientFromPayload(payload);
        const credentialResult = await withNewIntegrationLimit(
          {
            organizationId,
            providerKind: "phrase",
          },
          (database) =>
            upsertPhraseOAuthProviderCredential({
              organizationId,
              userId: c.var.auth.user.localUserId,
              role: c.var.auth.membership.role,
              displayName: payload.displayName,
              oauthClient,
              baseUrl: payload.baseUrl ?? null,
              db: database,
            }),
        );
        if (!credentialResult.ok) {
          const limitResponse = integrationLimitErrorResponse(credentialResult.error);
          return c.json(limitResponse.body, limitResponse.status);
        }

        const providerCredential = credentialResult.value;

        return c.json(
          {
            externalTmsProviderCredential: providerCredential,
            shouldConnectPhraseUser: Boolean(oauthClient),
          },
          200,
        );
      } catch (error) {
        if (error instanceof Error && error.message === "phrase_oauth_client_required") {
          return c.json(oauthClientRequiredErrorResponse("phrase"), 400);
        }
        if (error instanceof Error && error.message === "provider_base_url_invalid") {
          return c.json(
            {
              error: "provider_base_url_invalid",
              message: "Provider base URL is invalid.",
            },
            400,
          );
        }
        throw error;
      }
    })
    .post("/lokalise/oauth-app", validateLokaliseOAuthStartBody, async (c) => {
      try {
        if (!hasCapability(c.var.auth.membership.role, "provider_credentials:write")) {
          return c.json({ error: "forbidden" }, 403);
        }
        const payload = c.req.valid("json");
        const organizationId = c.var.auth.organization.localOrganizationId;
        const oauthClient = getOAuthClientFromPayload(payload);
        const credentialResult = await withNewIntegrationLimit(
          {
            organizationId,
            providerKind: "lokalise",
          },
          (database) =>
            upsertLokaliseOAuthProviderCredential({
              organizationId,
              userId: c.var.auth.user.localUserId,
              role: c.var.auth.membership.role,
              displayName: payload.displayName,
              oauthClient,
              baseUrl: payload.baseUrl ?? null,
              db: database,
            }),
        );
        if (!credentialResult.ok) {
          const limitResponse = integrationLimitErrorResponse(credentialResult.error);
          return c.json(limitResponse.body, limitResponse.status);
        }

        const providerCredential = credentialResult.value;

        return c.json(
          {
            externalTmsProviderCredential: providerCredential,
            shouldConnectLokaliseUser: Boolean(oauthClient),
          },
          200,
        );
      } catch (error) {
        if (error instanceof Error && error.message === "lokalise_oauth_client_required") {
          return c.json(oauthClientRequiredErrorResponse("lokalise"), 400);
        }
        if (error instanceof Error && error.message === "provider_base_url_invalid") {
          return c.json(
            {
              error: "provider_base_url_invalid",
              message: "Provider base URL is invalid.",
            },
            400,
          );
        }
        throw error;
      }
    })
    .get("/crowdin/oauth/callback", async (c) => {
      const stateParam = c.req.query("state");
      if (!stateParam) {
        logger.warn("crowdin user oauth callback missing state");
        return c.redirect("/dashboard?error=missing_crowdin_oauth_state");
      }

      const organizationSlug = c.var.auth.organization.slug;
      if (!organizationSlug) {
        logger.warn(
          {
            organizationId: c.var.auth.organization.localOrganizationId,
            userId: c.var.auth.user.localUserId,
          },
          "crowdin user oauth callback missing organization slug",
        );
        return c.redirect("/dashboard?error=organization_slug_missing");
      }

      logger.info(
        {
          organizationId: c.var.auth.organization.localOrganizationId,
          userId: c.var.auth.user.localUserId,
          organizationSlug,
          hasCode: Boolean(c.req.query("code")),
          hasError: Boolean(c.req.query("error")),
        },
        "crowdin user oauth callback received",
      );

      const now = new Date();
      const userState = await findActiveCrowdinUserOAuthState(c, stateParam, now);

      const errorParam = c.req.query("error");
      if (errorParam) {
        logger.warn(
          {
            organizationId: c.var.auth.organization.localOrganizationId,
            userId: c.var.auth.user.localUserId,
            organizationSlug,
            stateFound: Boolean(userState),
            error: errorParam,
          },
          "crowdin user oauth callback returned provider error",
        );
        if (userState) {
          return c.redirect(
            appendRelativeRedirectParam(
              normalizeUserOAuthReturnTo(userState.returnTo, organizationSlug),
              "error",
              errorParam,
            ),
          );
        }
        return c.redirect(`/dashboard?error=${encodeURIComponent(errorParam)}`);
      }

      const code = c.req.query("code");
      if (!code) {
        logger.warn(
          {
            organizationId: c.var.auth.organization.localOrganizationId,
            userId: c.var.auth.user.localUserId,
            organizationSlug,
            stateFound: Boolean(userState),
          },
          "crowdin user oauth callback missing code",
        );
        if (userState) {
          return c.redirect(
            appendRelativeRedirectParam(
              normalizeUserOAuthReturnTo(userState.returnTo, organizationSlug),
              "error",
              "missing_crowdin_user_oauth_code",
            ),
          );
        }
        return c.redirect("/dashboard?error=missing_crowdin_oauth_code");
      }

      if (!userState) {
        logger.warn(
          {
            organizationId: c.var.auth.organization.localOrganizationId,
            userId: c.var.auth.user.localUserId,
            organizationSlug,
          },
          "crowdin user oauth callback rejected: invalid state",
        );
        return c.redirect("/dashboard?error=invalid_crowdin_oauth_state");
      }

      return handleCrowdinUserOAuthCallback(
        c,
        userState,
        code,
        organizationSlug,
        getCrowdinOAuthRedirectUri(c, organizationSlug),
      );
    })
    .get("/phrase/oauth/callback", async (c) => {
      const stateParam = c.req.query("state");
      if (!stateParam) {
        logger.warn("phrase user oauth callback missing state");
        return c.redirect("/dashboard?error=missing_phrase_oauth_state");
      }

      const organizationSlug = c.var.auth.organization.slug;
      if (!organizationSlug) {
        logger.warn(
          {
            organizationId: c.var.auth.organization.localOrganizationId,
            userId: c.var.auth.user.localUserId,
          },
          "phrase user oauth callback missing organization slug",
        );
        return c.redirect("/dashboard?error=organization_slug_missing");
      }

      logger.info(
        {
          organizationId: c.var.auth.organization.localOrganizationId,
          userId: c.var.auth.user.localUserId,
          organizationSlug,
          hasCode: Boolean(c.req.query("code")),
          hasError: Boolean(c.req.query("error")),
        },
        "phrase user oauth callback received",
      );

      const now = new Date();
      const userState = await findActivePhraseUserOAuthState(c, stateParam, now);

      const errorParam = c.req.query("error");
      if (errorParam) {
        logger.warn(
          {
            organizationId: c.var.auth.organization.localOrganizationId,
            userId: c.var.auth.user.localUserId,
            organizationSlug,
            stateFound: Boolean(userState),
            error: errorParam,
          },
          "phrase user oauth callback returned provider error",
        );
        if (userState) {
          return c.redirect(
            appendRelativeRedirectParam(
              normalizeUserOAuthReturnTo(userState.returnTo, organizationSlug),
              "error",
              errorParam,
            ),
          );
        }
        return c.redirect(`/dashboard?error=${encodeURIComponent(errorParam)}`);
      }

      const code = c.req.query("code");
      if (!code) {
        logger.warn(
          {
            organizationId: c.var.auth.organization.localOrganizationId,
            userId: c.var.auth.user.localUserId,
            organizationSlug,
            stateFound: Boolean(userState),
          },
          "phrase user oauth callback missing code",
        );
        if (userState) {
          return c.redirect(
            appendRelativeRedirectParam(
              normalizeUserOAuthReturnTo(userState.returnTo, organizationSlug),
              "error",
              "missing_phrase_user_oauth_code",
            ),
          );
        }
        return c.redirect("/dashboard?error=missing_phrase_oauth_code");
      }

      if (!userState) {
        logger.warn(
          {
            organizationId: c.var.auth.organization.localOrganizationId,
            userId: c.var.auth.user.localUserId,
            organizationSlug,
          },
          "phrase user oauth callback rejected: invalid state",
        );
        return c.redirect("/dashboard?error=invalid_phrase_oauth_state");
      }

      return handlePhraseUserOAuthCallback(
        c,
        userState,
        code,
        organizationSlug,
        getPhraseOAuthRedirectUri(c, organizationSlug),
      );
    })
    .get("/lokalise/oauth/callback", async (c) => {
      const stateParam = c.req.query("state");
      if (!stateParam) {
        logger.warn("lokalise user oauth callback missing state");
        return c.redirect("/dashboard?error=missing_lokalise_oauth_state");
      }

      const organizationSlug = c.var.auth.organization.slug;
      if (!organizationSlug) {
        logger.warn(
          {
            organizationId: c.var.auth.organization.localOrganizationId,
            userId: c.var.auth.user.localUserId,
          },
          "lokalise user oauth callback missing organization slug",
        );
        return c.redirect("/dashboard?error=organization_slug_missing");
      }

      logger.info(
        {
          organizationId: c.var.auth.organization.localOrganizationId,
          userId: c.var.auth.user.localUserId,
          organizationSlug,
          hasCode: Boolean(c.req.query("code")),
          hasError: Boolean(c.req.query("error")),
        },
        "lokalise user oauth callback received",
      );

      const now = new Date();
      const userState = await findActiveLokaliseUserOAuthState(c, stateParam, now);

      const errorParam = c.req.query("error");
      if (errorParam) {
        logger.warn(
          {
            organizationId: c.var.auth.organization.localOrganizationId,
            userId: c.var.auth.user.localUserId,
            organizationSlug,
            stateFound: Boolean(userState),
            error: errorParam,
          },
          "lokalise user oauth callback returned provider error",
        );
        if (userState) {
          return c.redirect(
            appendRelativeRedirectParam(
              normalizeUserOAuthReturnTo(userState.returnTo, organizationSlug),
              "error",
              errorParam,
            ),
          );
        }
        return c.redirect(`/dashboard?error=${encodeURIComponent(errorParam)}`);
      }

      const code = c.req.query("code");
      if (!code) {
        logger.warn(
          {
            organizationId: c.var.auth.organization.localOrganizationId,
            userId: c.var.auth.user.localUserId,
            organizationSlug,
            stateFound: Boolean(userState),
          },
          "lokalise user oauth callback missing code",
        );
        if (userState) {
          return c.redirect(
            appendRelativeRedirectParam(
              normalizeUserOAuthReturnTo(userState.returnTo, organizationSlug),
              "error",
              "missing_lokalise_user_oauth_code",
            ),
          );
        }
        return c.redirect("/dashboard?error=missing_lokalise_oauth_code");
      }

      if (!userState) {
        logger.warn(
          {
            organizationId: c.var.auth.organization.localOrganizationId,
            userId: c.var.auth.user.localUserId,
            organizationSlug,
          },
          "lokalise user oauth callback rejected: invalid state",
        );
        return c.redirect("/dashboard?error=invalid_lokalise_oauth_state");
      }

      return handleLokaliseUserOAuthCallback(c, userState, code, organizationSlug);
    })
    .get("/user-connect-cta", async (c) => {
      if (!hasCapability(c.var.auth.membership.role, "jobs:read")) {
        return c.json({ error: "forbidden" }, 403);
      }

      const cta = await getTmsUserConnectCtaState({
        organizationId: c.var.auth.organization.localOrganizationId,
        userId: c.var.auth.user.localUserId,
      });

      logger.info(
        {
          organizationId: c.var.auth.organization.localOrganizationId,
          userId: c.var.auth.user.localUserId,
          showConnectCta: cta.showConnectCta,
        },
        "tms user connect cta route resolved",
      );

      return c.json({ connectCta: cta }, 200);
    })
    .get("/crowdin/user-connection", async (c) => {
      if (!hasCapability(c.var.auth.membership.role, "jobs:read")) {
        return c.json({ error: "forbidden" }, 403);
      }

      const credential = await getActiveOrganizationExternalTmsProviderCredentialRow(
        c.var.auth.organization.localOrganizationId,
      );
      const hasCrowdinIntegration =
        credential?.providerKind === "crowdin" && crowdinUsesPerUserAuth(credential.authMode);
      const connection = hasCrowdinIntegration
        ? await getCrowdinUserConnectionSummary({
            organizationId: c.var.auth.organization.localOrganizationId,
            userId: c.var.auth.user.localUserId,
          })
        : null;

      logger.info(
        {
          organizationId: c.var.auth.organization.localOrganizationId,
          userId: c.var.auth.user.localUserId,
          providerCredentialId: credential?.id ?? null,
          hasCrowdinIntegration,
          connectionId: connection?.id ?? null,
          shouldConnectCrowdinUser: hasCrowdinIntegration && !connection,
        },
        "crowdin user connection route resolved",
      );

      return c.json(
        {
          hasCrowdinIntegration,
          crowdinUserConnection: connection,
          shouldConnectCrowdinUser: hasCrowdinIntegration && !connection,
        },
        200,
      );
    })
    .get("/phrase/user-connection", async (c) => {
      if (!hasCapability(c.var.auth.membership.role, "jobs:read")) {
        return c.json({ error: "forbidden" }, 403);
      }

      const credential = await getActiveOrganizationExternalTmsProviderCredentialRow(
        c.var.auth.organization.localOrganizationId,
      );
      const hasPhraseIntegration =
        credential?.providerKind === "phrase" && credential.authMode === OAUTH_AUTH_MODE;
      const connection = hasPhraseIntegration
        ? await getPhraseUserConnectionSummary({
            organizationId: c.var.auth.organization.localOrganizationId,
            userId: c.var.auth.user.localUserId,
          })
        : null;

      logger.info(
        {
          organizationId: c.var.auth.organization.localOrganizationId,
          userId: c.var.auth.user.localUserId,
          providerCredentialId: credential?.id ?? null,
          hasPhraseIntegration,
          connectionId: connection?.id ?? null,
          shouldConnectPhraseUser: hasPhraseIntegration && !connection,
        },
        "phrase user connection route resolved",
      );

      return c.json(
        {
          hasPhraseIntegration,
          phraseUserConnection: connection,
          shouldConnectPhraseUser: hasPhraseIntegration && !connection,
        },
        200,
      );
    })
    .get("/lokalise/user-connection", async (c) => {
      if (!hasCapability(c.var.auth.membership.role, "jobs:read")) {
        return c.json({ error: "forbidden" }, 403);
      }

      const credential = await getActiveOrganizationExternalTmsProviderCredentialRow(
        c.var.auth.organization.localOrganizationId,
      );
      const hasLokaliseIntegration =
        credential?.providerKind === "lokalise" && credential.authMode === OAUTH_AUTH_MODE;
      const connection = hasLokaliseIntegration
        ? await getLokaliseUserConnectionSummary({
            organizationId: c.var.auth.organization.localOrganizationId,
            userId: c.var.auth.user.localUserId,
          })
        : null;

      logger.info(
        {
          organizationId: c.var.auth.organization.localOrganizationId,
          userId: c.var.auth.user.localUserId,
          providerCredentialId: credential?.id ?? null,
          hasLokaliseIntegration,
          connectionId: connection?.id ?? null,
          shouldConnectLokaliseUser: hasLokaliseIntegration && !connection,
        },
        "lokalise user connection route resolved",
      );

      return c.json(
        {
          hasLokaliseIntegration,
          lokaliseUserConnection: connection,
          shouldConnectLokaliseUser: hasLokaliseIntegration && !connection,
        },
        200,
      );
    })
    .post("/crowdin/user/oauth/start", validateCrowdinUserOAuthStartBody, async (c) => {
      if (!hasCapability(c.var.auth.membership.role, "jobs:read")) {
        return c.json({ error: "forbidden" }, 403);
      }

      const organizationSlug = c.var.auth.organization.slug;
      if (!organizationSlug) {
        return c.json({ error: "organization_slug_missing" }, 400);
      }

      const credential = await getActiveOrganizationExternalTmsProviderCredentialRow(
        c.var.auth.organization.localOrganizationId,
      );
      if (credential?.providerKind !== "crowdin" || credential.authMode !== OAUTH_AUTH_MODE) {
        return c.json(
          {
            error: "crowdin_integration_not_connected",
            message: "Crowdin must be connected before users can link their accounts.",
          },
          404,
        );
      }

      const payload = c.req.valid("json");
      logger.info(
        {
          organizationId: c.var.auth.organization.localOrganizationId,
          userId: c.var.auth.user.localUserId,
          providerCredentialId: credential.id,
          organizationSlug,
        },
        "crowdin user oauth start requested",
      );
      return c.json(
        await createCrowdinUserOAuthAuthorization({
          c,
          credential,
          organizationSlug,
          returnTo: payload.returnTo,
        }),
        200,
      );
    })
    .post("/crowdin/user/pat", validateCrowdinUserPatBody, async (c) => {
      if (!hasCapability(c.var.auth.membership.role, "jobs:read")) {
        return c.json({ error: "forbidden" }, 403);
      }

      const credential = await getActiveOrganizationExternalTmsProviderCredentialRow(
        c.var.auth.organization.localOrganizationId,
      );
      if (!credential || credential.providerKind !== "crowdin") {
        logger.warn(
          {
            organizationId: c.var.auth.organization.localOrganizationId,
            userId: c.var.auth.user.localUserId,
            providerKind: credential?.providerKind ?? null,
            credentialAuthMode: credential?.authMode ?? null,
            credentialFound: Boolean(credential),
          },
          "crowdin user pat link rejected: integration unavailable",
        );
        return c.json(
          {
            error: "crowdin_integration_not_connected",
            message: "Crowdin personal access token mode is not enabled for this workspace.",
          },
          404,
        );
      }

      if (credential.authMode === API_TOKEN_AUTH_MODE) {
        logger.warn(
          {
            organizationId: c.var.auth.organization.localOrganizationId,
            userId: c.var.auth.user.localUserId,
            providerCredentialId: credential.id,
            credentialAuthMode: credential.authMode,
          },
          "crowdin user pat link rejected: legacy api_token mode",
        );
        return c.json(
          {
            error: "crowdin_legacy_api_token_mode",
            message:
              "This workspace still uses legacy shared Crowdin API token mode. Re-save Crowdin in Integrations using Personal access token mode, then connect again.",
          },
          409,
        );
      }

      if (credential.authMode !== PAT_AUTH_MODE) {
        logger.warn(
          {
            organizationId: c.var.auth.organization.localOrganizationId,
            userId: c.var.auth.user.localUserId,
            providerCredentialId: credential.id,
            credentialAuthMode: credential.authMode,
          },
          "crowdin user pat link rejected: oauth mode active",
        );
        return c.json(
          {
            error: "crowdin_oauth_mode_active",
            message:
              "This workspace uses Crowdin OAuth. Connect your account with the OAuth flow instead of a personal access token.",
          },
          409,
        );
      }

      const payload = c.req.valid("json");
      const personalAccessToken = payload.personalAccessToken.trim();
      if (!personalAccessToken) {
        return c.json({ error: "invalid_crowdin_user_pat_payload" }, 400);
      }

      logger.info(
        {
          organizationId: c.var.auth.organization.localOrganizationId,
          userId: c.var.auth.user.localUserId,
          providerCredentialId: credential.id,
          ...buildTmsUserPatLinkLogContext({
            credentialAuthMode: credential.authMode,
            credentialBaseUrl: credential.baseUrl,
            personalAccessTokenLength: personalAccessToken.length,
          }),
        },
        "crowdin user pat link requested",
      );

      return completeCrowdinUserPatLink(c, {
        personalAccessToken,
        credential,
      });
    })
    .post("/phrase/user/oauth/start", validatePhraseUserOAuthStartBody, async (c) => {
      if (!hasCapability(c.var.auth.membership.role, "jobs:read")) {
        return c.json({ error: "forbidden" }, 403);
      }

      const organizationSlug = c.var.auth.organization.slug;
      if (!organizationSlug) {
        return c.json({ error: "organization_slug_missing" }, 400);
      }

      const credential = await getActiveOrganizationExternalTmsProviderCredentialRow(
        c.var.auth.organization.localOrganizationId,
      );
      if (credential?.providerKind !== "phrase" || credential.authMode !== OAUTH_AUTH_MODE) {
        return c.json(
          {
            error: "phrase_integration_not_connected",
            message: "Phrase must be connected before users can link their accounts.",
          },
          404,
        );
      }

      const payload = c.req.valid("json");
      logger.info(
        {
          organizationId: c.var.auth.organization.localOrganizationId,
          userId: c.var.auth.user.localUserId,
          providerCredentialId: credential.id,
          organizationSlug,
        },
        "phrase user oauth start requested",
      );
      return c.json(
        await createPhraseUserOAuthAuthorization({
          c,
          credential,
          organizationSlug,
          returnTo: payload.returnTo,
        }),
        200,
      );
    })
    .post("/lokalise/user/oauth/start", validateLokaliseUserOAuthStartBody, async (c) => {
      if (!hasCapability(c.var.auth.membership.role, "jobs:read")) {
        return c.json({ error: "forbidden" }, 403);
      }

      const organizationSlug = c.var.auth.organization.slug;
      if (!organizationSlug) {
        return c.json({ error: "organization_slug_missing" }, 400);
      }

      const credential = await getActiveOrganizationExternalTmsProviderCredentialRow(
        c.var.auth.organization.localOrganizationId,
      );
      if (credential?.providerKind !== "lokalise" || credential.authMode !== OAUTH_AUTH_MODE) {
        return c.json(
          {
            error: "lokalise_integration_not_connected",
            message: "Lokalise must be connected before users can link their accounts.",
          },
          404,
        );
      }

      const payload = c.req.valid("json");
      logger.info(
        {
          organizationId: c.var.auth.organization.localOrganizationId,
          userId: c.var.auth.user.localUserId,
          providerCredentialId: credential.id,
          organizationSlug,
        },
        "lokalise user oauth start requested",
      );
      return c.json(
        await createLokaliseUserOAuthAuthorization({
          c,
          credential,
          organizationSlug,
          returnTo: payload.returnTo,
        }),
        200,
      );
    })
    .put("/", validateUpsertBody, async (c) => {
      try {
        const payload = c.req.valid("json");
        if (payload.providerKind === "crowdin") {
          return c.json(
            {
              error: "crowdin_pat_setup_required",
              message:
                "Crowdin must be connected from Integrations using OAuth or personal access token mode.",
            },
            400,
          );
        }
        if (payload.providerKind === "phrase") {
          return c.json(
            {
              error: "phrase_api_token_unsupported",
              message: "Phrase API-token setup is disabled. Use OAuth App connection.",
            },
            400,
          );
        }
        if (payload.providerKind === "lokalise") {
          return c.json(
            {
              error: "lokalise_api_token_unsupported",
              message: "Lokalise API-token setup is disabled. Use OAuth App connection.",
            },
            400,
          );
        }
        const organizationId = c.var.auth.organization.localOrganizationId;
        const credentialResult = await withNewIntegrationLimit(
          {
            organizationId,
            providerKind: payload.providerKind,
          },
          (database) =>
            upsertOrganizationExternalTmsProviderCredential({
              organizationId,
              userId: c.var.auth.user.localUserId,
              role: c.var.auth.membership.role,
              providerKind: payload.providerKind,
              displayName: payload.displayName,
              secretMaterial: payload.secretMaterial,
              region: payload.region,
              baseUrl: payload.baseUrl,
              db: database,
            }),
        );
        if (!credentialResult.ok) {
          const limitResponse = integrationLimitErrorResponse(credentialResult.error);
          return c.json(limitResponse.body, limitResponse.status);
        }

        const providerCredential = credentialResult.value;

        return c.json({ externalTmsProviderCredential: providerCredential }, 200);
      } catch (error) {
        if (error instanceof Error && error.message === "forbidden") {
          return c.json({ error: "forbidden" }, 403);
        }
        if (error instanceof Error && error.message === "provider_base_url_invalid") {
          return c.json(
            {
              error: "provider_base_url_invalid",
              message: "Provider base URL is invalid.",
            },
            400,
          );
        }
        throw error;
      }
    })
    .post("/reveal", validateRevealBody, async (c) => {
      try {
        const payload = c.req.valid("json");
        const providerCredential = await revealOrganizationExternalTmsProviderCredential({
          organizationId: c.var.auth.organization.localOrganizationId,
          role: c.var.auth.membership.role,
          providerKind: payload.providerKind,
        });

        if (!providerCredential) return c.json({ error: "provider_credential_not_found" }, 404);
        return c.json({ externalTmsProviderCredential: providerCredential }, 200);
      } catch (error) {
        if (error instanceof Error && error.message === "forbidden") {
          return c.json({ error: "forbidden" }, 403);
        }
        if (error instanceof Error && error.message === "crowdin_oauth_secret_unavailable") {
          return c.json(
            {
              error: "crowdin_oauth_secret_unavailable",
              message: "Crowdin OAuth secrets cannot be revealed.",
            },
            400,
          );
        }
        if (error instanceof Error && error.message === "phrase_oauth_secret_unavailable") {
          return c.json(
            {
              error: "phrase_oauth_secret_unavailable",
              message: "Phrase OAuth secrets cannot be revealed.",
            },
            400,
          );
        }
        if (error instanceof Error && error.message === "lokalise_oauth_secret_unavailable") {
          return c.json(
            {
              error: "lokalise_oauth_secret_unavailable",
              message: "Lokalise OAuth secrets cannot be revealed.",
            },
            400,
          );
        }
        throw error;
      }
    })
    .post("/:providerKind/health-check", async (c) => {
      try {
        assertExternalTmsCredentialAdmin(c.var.auth.membership.role);

        const providerKind = externalTmsProviderKindSchema.safeParse(c.req.param("providerKind"));
        if (!providerKind.success) {
          return c.json({ error: "invalid_external_tms_provider_kind" }, 400);
        }

        const providerCredentialSummary = await getOrganizationExternalTmsProviderCredentialSummary(
          c.var.auth.organization.localOrganizationId,
          providerKind.data,
        );
        if (!providerCredentialSummary) {
          return c.json({ error: "provider_credential_not_found" }, 404);
        }

        const { credential, health } = await checkExternalTmsProviderHealth({
          organizationId: c.var.auth.organization.localOrganizationId,
          providerKind: providerKind.data,
        });

        if (!credential || !health) throw new Error("provider_credential_not_found");

        await persistExternalTmsProviderHealth({ credentialId: credential.id, health });

        const result = {
          providerKind: providerKind.data,
          ...health,
          checkedAt: new Date().toISOString(),
        };

        return c.json({ externalTmsProviderHealth: result }, 200);
      } catch (error) {
        if (error instanceof Error && error.message === "forbidden") {
          return c.json({ error: "forbidden" }, 403);
        }
        if (error instanceof Error && error.message === "provider_credential_not_found") {
          return c.json({ error: "provider_credential_not_found" }, 404);
        }
        throw error;
      }
    })
    .delete("/:providerKind", async (c) => {
      try {
        const providerKind = externalTmsProviderKindSchema.safeParse(c.req.param("providerKind"));
        if (!providerKind.success) {
          return c.json({ error: "invalid_external_tms_provider_kind" }, 400);
        }

        const deleted = await deleteOrganizationExternalTmsProviderCredential({
          organizationId: c.var.auth.organization.localOrganizationId,
          role: c.var.auth.membership.role,
          providerKind: providerKind.data,
        });

        if (!deleted) return c.json({ error: "provider_credential_not_found" }, 404);
        return c.body(null, 204);
      } catch (error) {
        if (error instanceof Error && error.message === "forbidden") {
          return c.json({ error: "forbidden" }, 403);
        }
        throw error;
      }
    });
}
