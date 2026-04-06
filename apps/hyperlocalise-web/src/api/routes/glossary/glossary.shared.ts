import { and, eq } from "drizzle-orm";

import type { ApiAuthContext } from "@/api/auth/workos";
import { schema } from "@/lib/database";

const allowedMutationRoles = new Set<string>(["owner", "admin"]);

export function invalidGlossaryPayloadResponse(c: {
  json(body: { error: string }, status: 400): Response;
}) {
  return c.json({ error: "invalid_glossary_payload" }, 400);
}

export function glossaryNotFoundResponse(c: {
  json(body: { error: string }, status: 404): Response;
}) {
  return c.json({ error: "glossary_not_found" }, 404);
}

export function forbiddenResponse(c: { json(body: { error: string }, status: 403): Response }) {
  return c.json({ error: "forbidden" }, 403);
}

export function isGlossaryMutationAllowed(role: ApiAuthContext["membership"]["role"]) {
  return allowedMutationRoles.has(role);
}

export function ownedGlossaryWhere(auth: ApiAuthContext, glossaryId: string) {
  return and(
    eq(schema.translationGlossaries.id, glossaryId),
    eq(schema.translationGlossaries.organizationId, auth.organization.localOrganizationId),
  );
}
