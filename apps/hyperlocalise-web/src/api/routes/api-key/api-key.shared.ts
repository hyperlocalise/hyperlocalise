import { and, eq } from "drizzle-orm";
import type { z } from "zod";

import type { ApiAuthContext } from "@/api/auth/workos";
import {
  forbiddenResponse as sharedForbiddenResponse,
  notFoundResponse,
  validationErrorResponse,
  type JsonContext,
} from "@/api/errors";
import { schema } from "@/lib/database";

const allowedAdminActionRoles = new Set<string>(["owner", "admin"]);

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

export function isApiKeyAdminActionAllowed(role: ApiAuthContext["membership"]["role"]) {
  return allowedAdminActionRoles.has(role);
}

export function ownedApiKeyWhere(auth: ApiAuthContext, apiKeyId: string) {
  return and(
    eq(schema.organizationApiKeys.id, apiKeyId),
    eq(schema.organizationApiKeys.organizationId, auth.organization.localOrganizationId),
  );
}
