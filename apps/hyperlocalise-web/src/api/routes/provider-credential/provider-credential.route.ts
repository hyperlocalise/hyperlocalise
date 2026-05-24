import { Hono } from "hono";
import { validator } from "hono/validator";

import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import {
  deleteOrganizationProviderCredential,
  getOrganizationProviderCredentialSummary,
  revealOrganizationProviderCredential,
  upsertOrganizationProviderCredential,
} from "@/lib/providers/organization-provider-credentials";

import {
  revealProviderCredentialBodySchema,
  updateProviderCredentialBodySchema,
} from "./provider-credential.schema";
import {
  forbiddenResponse,
  invalidProviderCredentialPayloadResponse,
  invalidProviderModelResponse,
  isProviderCredentialMutationAllowed,
  isProviderCredentialReadAllowed,
  providerCredentialNotFoundResponse,
  providerValidationFailedResponse,
} from "./provider-credential.shared";

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
      if (!isProviderCredentialReadAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const providerCredential = await getOrganizationProviderCredentialSummary(
        c.var.auth.organization.localOrganizationId,
      );

      return c.json({ providerCredential }, 200);
    })
    .put("/", validateUpdateProviderCredentialBody, async (c) => {
      if (!isProviderCredentialMutationAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
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
          return invalidProviderModelResponse(c);
        }

        return providerValidationFailedResponse(c, message);
      }
    })
    .post("/reveal", validateRevealProviderCredentialBody, async (c) => {
      try {
        const revealedCredential = await revealOrganizationProviderCredential({
          organizationId: c.var.auth.organization.localOrganizationId,
          role: c.var.auth.membership.role,
        });

        if (!revealedCredential) {
          return providerCredentialNotFoundResponse(c);
        }

        return c.json({ providerCredential: revealedCredential }, 200);
      } catch (error) {
        if (error instanceof Error && error.message === "forbidden") {
          return forbiddenResponse(c);
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
          return providerCredentialNotFoundResponse(c);
        }

        return c.body(null, 204);
      } catch (error) {
        if (error instanceof Error && error.message === "forbidden") {
          return forbiddenResponse(c);
        }

        throw error;
      }
    });
}

export const providerCredentialRoutes = createProviderCredentialRoutes();
