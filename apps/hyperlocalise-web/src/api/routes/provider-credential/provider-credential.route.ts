import { Hono, type Context } from "hono";
import { validator } from "hono/validator";

import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import {
  assertProviderCredentialAdmin,
  deleteOrganizationProviderCredential,
  getOrganizationProviderCredentialSummary,
  revealOrganizationProviderCredential,
  upsertOrganizationProviderCredential,
} from "@/lib/providers/organization-provider-credentials";

import {
  revealProviderCredentialBodySchema,
  updateProviderCredentialBodySchema,
} from "./provider-credential.schema";

function invalidProviderCredentialPayloadResponse(c: Context) {
  return c.json({ error: "invalid_provider_credential_payload" as const }, 400);
}

const validateUpdateProviderCredentialBody = validator("json", (value, c) => {
  const parsed = updateProviderCredentialBodySchema.safeParse(value);
  if (!parsed.success) {
    return invalidProviderCredentialPayloadResponse(c);
  }

  return parsed.data;
});

const validateRevealProviderCredentialBody = validator("json", (value, c) => {
  const parsed = revealProviderCredentialBodySchema.safeParse(value);
  if (!parsed.success) {
    return invalidProviderCredentialPayloadResponse(c);
  }

  return parsed.data;
});

export function createProviderCredentialRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", async (c) => {
      const providerCredential = await getOrganizationProviderCredentialSummary(
        c.var.auth.organization.localOrganizationId,
      );

      return c.json({ providerCredential }, 200);
    })
    .put("/", validateUpdateProviderCredentialBody, async (c) => {
      try {
        assertProviderCredentialAdmin(c.var.auth.membership.role);
      } catch {
        return c.json({ error: "forbidden" as const }, 403);
      }

      const payload = c.req.valid("json");

      try {
        const providerCredential = await upsertOrganizationProviderCredential({
          organizationId: c.var.auth.organization.localOrganizationId,
          userId: c.var.auth.user.localUserId,
          provider: payload.provider,
          apiKey: payload.apiKey,
          defaultModel: payload.defaultModel,
        });

        return c.json({ providerCredential }, 200);
      } catch (error) {
        const message = error instanceof Error ? error.message : "provider_validation_failed";

        if (message === "unsupported_provider_model") {
          return c.json({ error: "invalid_provider_model" as const }, 400);
        }

        return c.json(
          {
            error: "provider_validation_failed" as const,
            message,
          },
          422,
        );
      }
    })
    .post("/reveal", validateRevealProviderCredentialBody, async (c) => {
      try {
        const revealedCredential = await revealOrganizationProviderCredential({
          organizationId: c.var.auth.organization.localOrganizationId,
          role: c.var.auth.membership.role,
        });

        if (!revealedCredential) {
          return c.json({ error: "provider_credential_not_found" as const }, 404);
        }

        return c.json({ providerCredential: revealedCredential }, 200);
      } catch (error) {
        if (error instanceof Error && error.message === "forbidden") {
          return c.json({ error: "forbidden" as const }, 403);
        }

        throw error;
      }
    })
    .delete("/", async (c) => {
      try {
        const deleted = await deleteOrganizationProviderCredential({
          organizationId: c.var.auth.organization.localOrganizationId,
          role: c.var.auth.membership.role,
        });

        if (!deleted) {
          return c.json({ error: "provider_credential_not_found" as const }, 404);
        }

        return c.body(null, 204);
      } catch (error) {
        if (error instanceof Error && error.message === "forbidden") {
          return c.json({ error: "forbidden" as const }, 403);
        }

        throw error;
      }
    });
}

export const providerCredentialRoutes = createProviderCredentialRoutes();
