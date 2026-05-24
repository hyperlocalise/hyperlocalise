import { and, eq } from "drizzle-orm";
import type { z } from "zod";

import type { ApiAuthContext } from "@/api/auth/workos";
import { hasCapability } from "@/api/auth/policy";
import {
  forbiddenResponse as sharedForbiddenResponse,
  notFoundResponse,
  validationErrorResponse,
  type JsonContext,
} from "@/api/errors";
import { schema } from "@/lib/database";

export function invalidApiKeyPayloadResponse(
  c: { json: JsonContext["json"] },
  issues?: z.ZodIssue[],
) {
  return validationErrorResponse(c, "invalid_api_key_payload", "Invalid API key payload", issues);
}

export function apiKeyNotFoundResponse(c: { json: JsonContext["json"] }) {
  return notFoundResponse(c, "api_key_not_found", "API key not found");
}

export function forbiddenResponse(c: { json: JsonContext["json"] }) {
  return sharedForbiddenResponse(c, "forbidden", "Insufficient permissions");
}

export function isApiKeyReadAllowed(role: ApiAuthContext["membership"]["role"]) {
  return hasCapability(role, "api_keys:read");
}

export function isApiKeyWriteAllowed(role: ApiAuthContext["membership"]["role"]) {
  return hasCapability(role, "api_keys:write");
}

export function ownedApiKeyWhere(auth: ApiAuthContext, apiKeyId: string) {
  return and(
    eq(schema.organizationApiKeys.id, apiKeyId),
    eq(schema.organizationApiKeys.organizationId, auth.organization.localOrganizationId),
  );
}
