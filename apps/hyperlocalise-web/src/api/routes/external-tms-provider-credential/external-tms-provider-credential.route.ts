import { Hono } from "hono";
import { validator } from "hono/validator";

import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import {
  deleteOrganizationExternalTmsProviderCredential,
  revealOrganizationExternalTmsProviderCredential,
  upsertOrganizationExternalTmsProviderCredential,
} from "@/lib/providers/organization-external-tms-provider-credentials";

import {
  revealExternalTmsProviderCredentialBodySchema,
  upsertExternalTmsProviderCredentialBodySchema,
} from "./external-tms-provider-credential.schema";

const validateUpsertBody = validator("json", (value, c) => {
  const parsed = upsertExternalTmsProviderCredentialBodySchema.safeParse(value);
  if (!parsed.success) return c.json({ error: "invalid_external_tms_provider_credential_payload" }, 400);
  return parsed.data;
});

const validateRevealBody = validator("json", (value, c) => {
  const parsed = revealExternalTmsProviderCredentialBodySchema.safeParse(value);
  if (!parsed.success) return c.json({ error: "invalid_external_tms_provider_credential_payload" }, 400);
  return parsed.data;
});

export function createExternalTmsProviderCredentialRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .put("/", validateUpsertBody, async (c) => {
      if (!["owner", "admin"].includes(c.var.auth.membership.role)) {
        return c.json({ error: "forbidden" }, 403);
      }

      const payload = c.req.valid("json");
      const providerCredential = await upsertOrganizationExternalTmsProviderCredential({
        organizationId: c.var.auth.organization.localOrganizationId,
        userId: c.var.auth.user.localUserId,
        providerKind: payload.providerKind,
        displayName: payload.displayName,
        secretMaterial: payload.secretMaterial,
        region: payload.region,
        baseUrl: payload.baseUrl,
      });

      return c.json({ externalTmsProviderCredential: providerCredential }, 200);
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
    .delete("/:providerKind", async (c) => {
      try {
        const deleted = await deleteOrganizationExternalTmsProviderCredential({
          organizationId: c.var.auth.organization.localOrganizationId,
          role: c.var.auth.membership.role,
          providerKind: c.req.param("providerKind") as "crowdin" | "smartling" | "phrase" | "lokalise",
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
