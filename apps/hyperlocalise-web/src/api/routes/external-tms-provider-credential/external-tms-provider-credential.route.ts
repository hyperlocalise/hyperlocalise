import { createHash, randomBytes } from "node:crypto";

import { and, eq, gt, isNull } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { validator } from "hono/validator";

import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { hasCapability } from "@/api/auth/policy";
import { badRequestResponse, notFoundResponse } from "@/api/response.schema";
import { isErr } from "@/lib/primitives/result/results";
import { providerSafeFetch } from "@/lib/providers/provider-safe-fetch";
import { db, schema } from "@/lib/database";
import { fetchCrowdinProjects } from "@/lib/providers/adapters/crowdin/crowdin-project-fetcher";
import { fetchLokaliseProjects } from "@/lib/providers/adapters/lokalise/lokalise-project-fetcher";
import { fetchPhraseProjects } from "@/lib/providers/adapters/phrase/phrase-project-fetcher";
import { fetchSmartlingProjects } from "@/lib/providers/adapters/smartling/smartling-project-fetcher";
import {
  syncExternalTmsProjects,
  type ExternalTmsProjectFetcher,
} from "@/lib/providers/sync/external-tms-project-sync";
import {
  assertExternalTmsCredentialAdmin,
  deleteOrganizationExternalTmsProviderCredential,
  getActiveOrganizationExternalTmsProviderCredentialRow,
  getCrowdinOAuthClientFromCredential,
  getActiveOrganizationExternalTmsProviderCredential,
  getOrganizationExternalTmsProviderCredentialSummary,
  listOrganizationExternalTmsProviderCredentialDetails,
  mapCrowdinOAuthTokenResponse,
  revealOrganizationExternalTmsProviderCredential,
  upsertCrowdinOAuthProviderCredential,
  upsertOrganizationExternalTmsProviderCredential,
} from "@/lib/providers/organization-external-tms-provider-credentials";
import { isTmsBackgroundSyncEnabled } from "@/lib/providers/tms-provider-shell-mode";
import {
  checkExternalTmsProviderHealth,
  persistExternalTmsProviderHealth,
} from "@/lib/providers/sync/external-tms-health-check";
import { getCrowdinOAuthScopeString } from "@/lib/providers/adapters/crowdin/crowdin-oauth-scopes";
import { recordProviderSyncRun } from "@/lib/providers/sync/provider-sync-runs";
import {
  ensureProviderWebhookSubscriptionsForCredential,
  listProviderWebhookSubscriptionSummaries,
} from "@/lib/providers/webhooks/provider-webhook-subscription-manager";
import {
  getProviderSyncObservability,
  ProviderSyncIntentNotFoundError,
  ProviderSyncIntentNotRetryableError,
  retryProviderSyncIntent,
} from "@/lib/providers/sync/provider-sync-observability";
import { CrowdinApiClient, CrowdinApiError } from "@/lib/providers/adapters/crowdin/crowdin-api";
import {
  getCrowdinUserConnectionSummary,
  upsertCrowdinUserConnection,
} from "@/lib/providers/adapters/crowdin/crowdin-user-connections";
import { getTmsUserConnectCtaState } from "@/lib/providers/tms-user-connection";

import {
  crowdinOAuthStartBodySchema,
  crowdinUserOAuthStartBodySchema,
  externalTmsProviderKindSchema,
  providerSyncObservabilityQuerySchema,
  revealExternalTmsProviderCredentialBodySchema,
  upsertExternalTmsProviderCredentialBodySchema,
} from "./external-tms-provider-credential.schema";

const CROWDIN_USER_OAUTH_STATE_TTL_MS = 60 * 60 * 1000;

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

type ExternalTmsProviderCredentialRouteContext = Context<{ Variables: AuthVariables }>;

function getCrowdinOAuthRequestOrigin(c: ExternalTmsProviderCredentialRouteContext) {
  const forwardedHost = c.req.header("x-forwarded-host");
  const forwardedProto = c.req.header("x-forwarded-proto") ?? "https";
  if (forwardedHost) {
    const host = forwardedHost.split(",")[0]?.trim();
    if (host) {
      return `${forwardedProto}://${host}`;
    }
  }

  return new URL(c.req.url).origin;
}

function getCrowdinOAuthRedirectUri(
  c: ExternalTmsProviderCredentialRouteContext,
  organizationSlug: string,
) {
  return `${getCrowdinOAuthRequestOrigin(c)}/api/orgs/${encodeURIComponent(organizationSlug)}/external-tms-provider-credential/crowdin/oauth/callback`;
}

function base64Url(input: Buffer) {
  return input.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function createCodeChallenge(codeVerifier: string) {
  return base64Url(createHash("sha256").update(codeVerifier).digest());
}

function normalizeCrowdinUserOAuthReturnTo(
  value: string | null | undefined,
  organizationSlug: string,
) {
  const fallback = `/org/${organizationSlug}`;
  if (!value?.trim()) {
    return fallback;
  }

  try {
    const url = new URL(value, "https://app.hyperlocalise.local");
    const normalized = `${url.pathname}${url.search}`;
    if (normalized === fallback || normalized.startsWith(`${fallback}/`)) {
      return normalized;
    }
  } catch {
    return fallback;
  }

  return fallback;
}

function appendRelativeRedirectParam(path: string, key: string, value: string) {
  const url = new URL(path, "https://app.hyperlocalise.local");
  url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
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
    return c.redirect("/dashboard?error=forbidden");
  }

  let tokenBundle: ReturnType<typeof mapCrowdinOAuthTokenResponse>;
  try {
    const response = await providerSafeFetch("https://accounts.crowdin.com/oauth/token", {
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
      return c.redirect(`/dashboard?error=${input.exchangeFailedError}`);
    }
    tokenBundle = mapCrowdinOAuthTokenResponse(await response.json(), input.client);
  } catch {
    return c.redirect(`/dashboard?error=${input.exchangeFailedError}`);
  }

  let crowdinUser: Awaited<ReturnType<CrowdinApiClient["getAuthenticatedUser"]>>;
  try {
    crowdinUser = await new CrowdinApiClient({
      token: tokenBundle.accessToken,
      baseUrl: input.credential.baseUrl ?? undefined,
    }).getAuthenticatedUser();
  } catch (error) {
    if (error instanceof CrowdinApiError && error.status === 401) {
      return c.redirect("/dashboard?error=crowdin_user_oauth_invalid");
    }
    return c.redirect("/dashboard?error=crowdin_user_lookup_failed");
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
    return c.redirect(
      appendRelativeRedirectParam(
        normalizeCrowdinUserOAuthReturnTo(input.returnTo, input.organizationSlug),
        "error",
        "crowdin_user_already_linked",
      ),
    );
  }

  await input.consumeState();

  return c.redirect(normalizeCrowdinUserOAuthReturnTo(input.returnTo, input.organizationSlug));
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
  if (!credential || credential.authMode !== "oauth") {
    return c.redirect("/dashboard?error=crowdin_integration_not_connected");
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
    .post("/crowdin/oauth/start", validateCrowdinOAuthStartBody, async (c) => {
      try {
        if (!hasCapability(c.var.auth.membership.role, "provider_credentials:write")) {
          return c.json({ error: "forbidden" }, 403);
        }
        const payload = c.req.valid("json");
        const providerCredential = await upsertCrowdinOAuthProviderCredential({
          organizationId: c.var.auth.organization.localOrganizationId,
          userId: c.var.auth.user.localUserId,
          role: c.var.auth.membership.role,
          displayName: payload.displayName,
          oauthClient: {
            clientId: payload.oauthClientId,
            clientSecret: payload.oauthClientSecret,
          },
          baseUrl: payload.baseUrl ?? null,
        });

        return c.json(
          {
            externalTmsProviderCredential: providerCredential,
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
    .get("/crowdin/oauth/callback", async (c) => {
      const stateParam = c.req.query("state");
      if (!stateParam) {
        return c.redirect("/dashboard?error=missing_crowdin_oauth_state");
      }

      const organizationSlug = c.var.auth.organization.slug;
      if (!organizationSlug) {
        return c.redirect("/dashboard?error=organization_slug_missing");
      }

      const now = new Date();
      const userState = await findActiveCrowdinUserOAuthState(c, stateParam, now);

      const errorParam = c.req.query("error");
      if (errorParam) {
        if (userState) {
          return c.redirect(
            appendRelativeRedirectParam(
              normalizeCrowdinUserOAuthReturnTo(userState.returnTo, organizationSlug),
              "error",
              errorParam,
            ),
          );
        }
        return c.redirect(`/dashboard?error=${encodeURIComponent(errorParam)}`);
      }

      const code = c.req.query("code");
      if (!code) {
        if (userState) {
          return c.redirect(
            appendRelativeRedirectParam(
              normalizeCrowdinUserOAuthReturnTo(userState.returnTo, organizationSlug),
              "error",
              "missing_crowdin_user_oauth_code",
            ),
          );
        }
        return c.redirect("/dashboard?error=missing_crowdin_oauth_code");
      }

      if (!userState) {
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
    .get("/user-connect-cta", async (c) => {
      if (!hasCapability(c.var.auth.membership.role, "jobs:read")) {
        return c.json({ error: "forbidden" }, 403);
      }

      const cta = await getTmsUserConnectCtaState({
        organizationId: c.var.auth.organization.localOrganizationId,
        userId: c.var.auth.user.localUserId,
      });

      return c.json(cta, 200);
    })
    .get("/crowdin/user-connection", async (c) => {
      if (!hasCapability(c.var.auth.membership.role, "jobs:read")) {
        return c.json({ error: "forbidden" }, 403);
      }

      const credential = await getActiveOrganizationExternalTmsProviderCredentialRow(
        c.var.auth.organization.localOrganizationId,
      );
      const hasCrowdinIntegration =
        credential?.providerKind === "crowdin" && credential.authMode === "oauth";
      const connection = hasCrowdinIntegration
        ? await getCrowdinUserConnectionSummary({
            organizationId: c.var.auth.organization.localOrganizationId,
            userId: c.var.auth.user.localUserId,
          })
        : null;

      return c.json(
        {
          hasCrowdinIntegration,
          crowdinUserConnection: connection,
          shouldConnectCrowdinUser: hasCrowdinIntegration && !connection,
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
      if (credential?.providerKind !== "crowdin" || credential.authMode !== "oauth") {
        return c.json(
          {
            error: "crowdin_integration_not_connected",
            message: "Crowdin must be connected before users can link their accounts.",
          },
          404,
        );
      }

      const payload = c.req.valid("json");
      const client = getCrowdinOAuthClientFromCredential(credential);
      const nonce = randomBytes(24).toString("hex");
      const codeVerifier = base64Url(randomBytes(48));
      const now = new Date();
      await db.insert(schema.crowdinUserOAuthStates).values({
        nonce,
        codeVerifier,
        organizationId: c.var.auth.organization.localOrganizationId,
        userId: c.var.auth.user.localUserId,
        providerCredentialId: credential.id,
        returnTo: normalizeCrowdinUserOAuthReturnTo(payload.returnTo, organizationSlug),
        expiresAt: new Date(now.getTime() + CROWDIN_USER_OAUTH_STATE_TTL_MS),
      });

      const authorizationUrl = new URL("https://accounts.crowdin.com/oauth/authorize");
      const redirectUri = getCrowdinOAuthRedirectUri(c, organizationSlug);
      authorizationUrl.searchParams.set("client_id", client.clientId);
      authorizationUrl.searchParams.set("redirect_uri", redirectUri);
      authorizationUrl.searchParams.set("response_type", "code");
      authorizationUrl.searchParams.set("scope", getCrowdinOAuthScopeString());
      authorizationUrl.searchParams.set("state", nonce);
      authorizationUrl.searchParams.set("code_challenge", createCodeChallenge(codeVerifier));
      authorizationUrl.searchParams.set("code_challenge_method", "S256");

      return c.json({ authorizationUrl: authorizationUrl.toString(), redirectUri }, 200);
    })
    .put("/", validateUpsertBody, async (c) => {
      try {
        const payload = c.req.valid("json");
        if (payload.providerKind === "crowdin") {
          return c.json(
            {
              error: "crowdin_personal_token_deprecated",
              message: "Crowdin personal-token setup is deprecated. Use OAuth App connection.",
            },
            400,
          );
        }
        const providerCredential = await upsertOrganizationExternalTmsProviderCredential({
          organizationId: c.var.auth.organization.localOrganizationId,
          userId: c.var.auth.user.localUserId,
          role: c.var.auth.membership.role,
          providerKind: payload.providerKind,
          displayName: payload.displayName,
          secretMaterial: payload.secretMaterial,
          region: payload.region,
          baseUrl: payload.baseUrl,
        });

        if (isTmsBackgroundSyncEnabled()) {
          void ensureProviderWebhookSubscriptionsForCredential({
            organizationId: c.var.auth.organization.localOrganizationId,
            providerKind: payload.providerKind,
            providerCredentialId: providerCredential.id,
          }).catch(() => undefined);
        }

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

        const result = await recordProviderSyncRun(
          {
            organizationId: c.var.auth.organization.localOrganizationId,
            providerKind: providerKind.data,
            kind: "health_check",
          },
          async (run) => {
            const { credential, health } = await checkExternalTmsProviderHealth({
              organizationId: c.var.auth.organization.localOrganizationId,
              providerKind: providerKind.data,
            });

            if (!credential || !health) throw new Error("provider_credential_not_found");

            await persistExternalTmsProviderHealth({ credentialId: credential.id, health });

            return {
              result: {
                providerKind: providerKind.data,
                ...health,
                checkedAt: (run.startedAt ?? new Date()).toISOString(),
              },
              providerMetadata: {
                credentialId: credential.id,
                status: health.status,
                availability: health.availability,
                authValidity: health.authValidity,
                errorCode: health.errorCode,
                rateLimit: health.rateLimit,
              },
            };
          },
        );

        if (isTmsBackgroundSyncEnabled()) {
          void ensureProviderWebhookSubscriptionsForCredential({
            organizationId: c.var.auth.organization.localOrganizationId,
            providerKind: providerKind.data,
            providerCredentialId: providerCredentialSummary.id,
          }).catch(() => undefined);
        }

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
    .get("/:providerKind/webhook-subscriptions", async (c) => {
      if (!hasCapability(c.var.auth.membership.role, "provider_credentials:read")) {
        return c.json({ error: "forbidden" }, 403);
      }

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

      const providerWebhookSubscriptions = await listProviderWebhookSubscriptionSummaries({
        organizationId: c.var.auth.organization.localOrganizationId,
        providerCredentialId: providerCredentialSummary.id,
      });

      return c.json({ providerWebhookSubscriptions }, 200);
    })
    .get("/:providerKind/sync-observability", async (c) => {
      if (!hasCapability(c.var.auth.membership.role, "provider_credentials:read")) {
        return c.json({ error: "forbidden" }, 403);
      }

      const providerKind = externalTmsProviderKindSchema.safeParse(c.req.param("providerKind"));
      if (!providerKind.success) {
        return c.json({ error: "invalid_external_tms_provider_kind" }, 400);
      }

      const query = providerSyncObservabilityQuerySchema.safeParse({
        projectId: c.req.query("projectId") || undefined,
      });
      if (!query.success) {
        return badRequestResponse(c, "invalid_sync_observability_query");
      }

      const providerCredentialSummary = await getOrganizationExternalTmsProviderCredentialSummary(
        c.var.auth.organization.localOrganizationId,
        providerKind.data,
      );
      if (!providerCredentialSummary) {
        return c.json({ error: "provider_credential_not_found" }, 404);
      }

      const providerSyncObservability = await getProviderSyncObservability({
        organizationId: c.var.auth.organization.localOrganizationId,
        providerKind: providerKind.data,
        providerCredentialId: providerCredentialSummary.id,
        projectId: query.data.projectId,
      });

      return c.json({ providerSyncObservability }, 200);
    })
    .post("/:providerKind/sync-intents/:intentId/retry", async (c) => {
      try {
        assertExternalTmsCredentialAdmin(c.var.auth.membership.role);

        const providerKind = externalTmsProviderKindSchema.safeParse(c.req.param("providerKind"));
        if (!providerKind.success) {
          return c.json({ error: "invalid_external_tms_provider_kind" }, 400);
        }

        const intentId = c.req.param("intentId");
        if (!intentId) {
          return badRequestResponse(c, "invalid_provider_sync_intent_id");
        }

        const providerCredentialSummary = await getOrganizationExternalTmsProviderCredentialSummary(
          c.var.auth.organization.localOrganizationId,
          providerKind.data,
        );
        if (!providerCredentialSummary) {
          return c.json({ error: "provider_credential_not_found" }, 404);
        }

        const result = await retryProviderSyncIntent({
          organizationId: c.var.auth.organization.localOrganizationId,
          providerKind: providerKind.data,
          intentId,
        });

        return c.json(result, 200);
      } catch (error) {
        if (error instanceof Error && error.message === "forbidden") {
          return c.json({ error: "forbidden" }, 403);
        }
        if (error instanceof ProviderSyncIntentNotFoundError) {
          return notFoundResponse(c, "provider_sync_intent_not_found");
        }
        if (error instanceof ProviderSyncIntentNotRetryableError) {
          return badRequestResponse(c, "provider_sync_intent_not_retryable");
        }
        throw error;
      }
    })
    .post("/:providerKind/webhook-subscriptions/retry", async (c) => {
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

        await ensureProviderWebhookSubscriptionsForCredential({
          organizationId: c.var.auth.organization.localOrganizationId,
          providerKind: providerKind.data,
          providerCredentialId: providerCredentialSummary.id,
        });

        const providerWebhookSubscriptions = await listProviderWebhookSubscriptionSummaries({
          organizationId: c.var.auth.organization.localOrganizationId,
          providerCredentialId: providerCredentialSummary.id,
        });

        return c.json({ providerWebhookSubscriptions }, 200);
      } catch (error) {
        if (error instanceof Error && error.message === "forbidden") {
          return c.json({ error: "forbidden" }, 403);
        }
        throw error;
      }
    })
    .post("/:providerKind/sync-projects", async (c) => {
      try {
        assertExternalTmsCredentialAdmin(c.var.auth.membership.role);

        const providerKind = externalTmsProviderKindSchema.safeParse(c.req.param("providerKind"));
        if (!providerKind.success) {
          return c.json({ error: "invalid_external_tms_provider_kind" }, 400);
        }

        const fetchProjectsByProvider: Partial<
          Record<(typeof providerKind)["data"], ExternalTmsProjectFetcher>
        > = {
          crowdin: fetchCrowdinProjects,
          lokalise: fetchLokaliseProjects,
          phrase: fetchPhraseProjects,
          smartling: fetchSmartlingProjects,
        };

        const fetchProjects = fetchProjectsByProvider[providerKind.data];
        if (!fetchProjects) {
          return c.json({ error: "provider_sync_not_implemented" }, 501);
        }

        const result = await syncExternalTmsProjects({
          organizationId: c.var.auth.organization.localOrganizationId,
          providerKind: providerKind.data,
          fetchProjects,
          actorUserId: c.var.auth.user.localUserId,
        });

        return c.json({ externalTmsProjectSync: result }, 200);
      } catch (error) {
        if (error instanceof Error && error.message === "forbidden") {
          return c.json({ error: "forbidden" }, 403);
        }
        if (error instanceof Error && error.message === "provider_credential_not_found") {
          return notFoundResponse(c, "provider_credential_not_found");
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
