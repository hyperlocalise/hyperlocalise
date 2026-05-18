import { and, eq } from "drizzle-orm";

import type { ApiAuthContext } from "@/api/auth/workos";
import { forbiddenResponse, notFoundResponse, validationErrorResponse } from "@/api/errors";
import { schema } from "@/lib/database";

const allowedMutationRoles = new Set<string>(["owner", "admin"]);

export function invalidGlossaryPayloadResponse(c: {
  json: Parameters<typeof validationErrorResponse>[0]["json"];
}) {
  return validationErrorResponse(c, "invalid_glossary_payload", "Invalid glossary payload");
}

export function glossaryNotFoundResponse(c: {
  json: Parameters<typeof notFoundResponse>[0]["json"];
}) {
  return notFoundResponse(c, "glossary_not_found", "Glossary not found");
}

export function glossaryForbiddenResponse(c: {
  json: Parameters<typeof forbiddenResponse>[0]["json"];
}) {
  return forbiddenResponse(c, "forbidden", "Insufficient permissions");
}

export function isGlossaryMutationAllowed(role: ApiAuthContext["membership"]["role"]) {
  return allowedMutationRoles.has(role);
}

export function ownedGlossaryWhere(auth: ApiAuthContext, glossaryId: string) {
  return and(
    eq(schema.glossaries.id, glossaryId),
    eq(schema.glossaries.organizationId, auth.organization.localOrganizationId),
  );
}
