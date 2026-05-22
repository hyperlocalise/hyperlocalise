import { Hono } from "hono";
import { validator } from "hono/validator";

import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import {
  assertExternalTmsCredentialAdmin,
  deleteOrganizationExternalTmsProviderCredential,
  getOrganizationExternalTmsProviderCredentialSummary,
  listOrganizationExternalTmsProviderCredentialSummaries,
  revealOrganizationExternalTmsProviderCredential,
  upsertOrganizationExternalTmsProviderCredential,
} from "@/lib/providers/organization-external-tms-provider-credentials";
import {
  checkExternalTmsProviderHealth,
  persistExternalTmsProviderHealth,
} from "@/lib/providers/external-tms-health-check";
import { recordProviderSyncRun } from "@/lib/providers/provider-sync-runs";

import {
  externalTmsProviderKindSchema,
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
      try {
        assertExternalTmsCredentialAdmin(c.var.auth.membership.role);
        const providerCredentials = await listOrganizationExternalTmsProviderCredentialSummaries(
          c.var.auth.organization.localOrganizationId,
        );

        return c.json({ externalTmsProviderCredentials: providerCredentials }, 200);
      } catch (error) {
        if (error instanceof Error && error.message === "forbidden") {
          return c.json({ error: "forbidden" }, 403);
        }
        throw error;
      }
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

        return c.json({ externalTmsProviderCredential: providerCredential }, 200);
      } catch (error) {
        if (error instanceof Error && error.message === "forbidden") {
          return c.json({ error: "forbidden" }, 403);
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

        return c.json({ externalTmsProviderHealth: result }, 200);
      } catch (error) {
        if (error instanceof Error && error.message === "forbidden") {
          return c.json({ error: "forbidden" }, 403);
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
