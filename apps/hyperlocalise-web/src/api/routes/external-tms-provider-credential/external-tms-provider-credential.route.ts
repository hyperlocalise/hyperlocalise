import { Hono } from "hono";
import { validator } from "hono/validator";

import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { hasCapability } from "@/api/auth/policy";
import { badRequestResponse, notFoundResponse } from "@/api/response.schema";
import { fetchCrowdinProjects } from "@/lib/providers/crowdin/crowdin-project-fetcher";
import { fetchLokaliseProjects } from "@/lib/providers/lokalise/lokalise-project-fetcher";
import { fetchPhraseProjects } from "@/lib/providers/phrase/phrase-project-fetcher";
import { fetchSmartlingProjects } from "@/lib/providers/smartling/smartling-project-fetcher";
import {
  syncExternalTmsProjects,
  type ExternalTmsProjectFetcher,
} from "@/lib/providers/external-tms-project-sync";
import {
  assertExternalTmsCredentialAdmin,
  deleteOrganizationExternalTmsProviderCredential,
  getOrganizationExternalTmsProviderCredentialSummary,
  listOrganizationExternalTmsProviderCredentialDetails,
  revealOrganizationExternalTmsProviderCredential,
  upsertOrganizationExternalTmsProviderCredential,
} from "@/lib/providers/organization-external-tms-provider-credentials";
import {
  checkExternalTmsProviderHealth,
  persistExternalTmsProviderHealth,
} from "@/lib/providers/external-tms-health-check";
import { recordProviderSyncRun } from "@/lib/providers/provider-sync-runs";
import {
  ensureProviderWebhookSubscriptionsForCredential,
  listProviderWebhookSubscriptionSummaries,
} from "@/lib/providers/provider-webhook-subscription-manager";
import {
  getProviderSyncObservability,
  ProviderSyncIntentNotFoundError,
  ProviderSyncIntentNotRetryableError,
  retryProviderSyncIntent,
} from "@/lib/providers/provider-sync-observability";

import {
  externalTmsProviderKindSchema,
  providerSyncObservabilityQuerySchema,
  revealExternalTmsProviderCredentialBodySchema,
  upsertExternalTmsProviderCredentialBodySchema,
} from "./external-tms-provider-credential.schema";

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

export function createExternalTmsProviderCredentialRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", async (c) => {
      if (!hasCapability(c.var.auth.membership.role, "provider_credentials:read")) {
        return c.json({ error: "forbidden" }, 403);
      }

      const providerCredentials = await listOrganizationExternalTmsProviderCredentialDetails(
        c.var.auth.organization.localOrganizationId,
      );

      return c.json({ externalTmsProviderCredentials: providerCredentials }, 200);
    })
    .put("/", validateUpsertBody, async (c) => {
      try {
        const payload = c.req.valid("json");
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

        void ensureProviderWebhookSubscriptionsForCredential({
          organizationId: c.var.auth.organization.localOrganizationId,
          providerKind: payload.providerKind,
          providerCredentialId: providerCredential.id,
        }).catch(() => undefined);

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

        void ensureProviderWebhookSubscriptionsForCredential({
          organizationId: c.var.auth.organization.localOrganizationId,
          providerKind: providerKind.data,
          providerCredentialId: providerCredentialSummary.id,
        }).catch(() => undefined);

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
