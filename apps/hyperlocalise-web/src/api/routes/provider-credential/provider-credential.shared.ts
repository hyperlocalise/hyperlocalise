import type { ApiAuthContext } from "@/api/auth/workos";
import { hasCapability } from "@/api/auth/policy";
import type { JsonContext } from "@/api/errors";

export function invalidProviderCredentialPayloadResponse(c: { json: JsonContext["json"] }) {
  return c.json({ error: "invalid_provider_credential_payload" }, 400);
}

export function forbiddenResponse(c: { json: JsonContext["json"] }) {
  return c.json({ error: "forbidden" }, 403);
}

export function providerCredentialNotFoundResponse(c: { json: JsonContext["json"] }) {
  return c.json({ error: "provider_credential_not_found" }, 404);
}

export function invalidProviderModelResponse(c: { json: JsonContext["json"] }) {
  return c.json({ error: "invalid_provider_model" }, 400);
}

export function providerValidationFailedResponse(
  c: { json: JsonContext["json"] },
  message: string,
) {
  return c.json(
    {
      error: "provider_validation_failed",
      message,
    },
    422,
  );
}

export function isProviderCredentialMutationAllowed(role: ApiAuthContext["membership"]["role"]) {
  return hasCapability(role, "provider_credentials:write");
}
