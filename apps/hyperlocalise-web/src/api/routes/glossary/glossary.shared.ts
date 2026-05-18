import { and, eq } from "drizzle-orm";

import {
  forbiddenResponse as sharedForbiddenResponse,
  notFoundResponse,
  validationErrorResponse,
  type JsonContext,
} from "@/api/errors";
import type { ApiAuthContext } from "@/api/auth/workos";
import { db, schema } from "@/lib/database";

const allowedMutationRoles = new Set<string>(["owner", "admin"]);

export function invalidGlossaryPayloadResponse(c: { json: JsonContext["json"] }) {
  return validationErrorResponse(c, "invalid_glossary_payload", "Invalid glossary payload");
}

export function glossaryNotFoundResponse(c: { json: JsonContext["json"] }) {
  return notFoundResponse(c, "glossary_not_found", "Glossary not found");
}

export function forbiddenResponse(c: { json: JsonContext["json"] }) {
  return sharedForbiddenResponse(c, "forbidden", "Insufficient permissions");
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

export async function getOwnedGlossary(auth: ApiAuthContext, glossaryId: string) {
  const [glossary] = await db
    .select({ id: schema.glossaries.id })
    .from(schema.glossaries)
    .where(ownedGlossaryWhere(auth, glossaryId))
    .limit(1);

  return glossary ?? null;
}
