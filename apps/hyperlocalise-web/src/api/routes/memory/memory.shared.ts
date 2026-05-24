import { and, eq, sql } from "drizzle-orm";

import {
  forbiddenResponse as sharedForbiddenResponse,
  notFoundResponse,
  validationErrorResponse,
  type JsonContext,
} from "@/api/errors";
import { canAccessMemory } from "@/api/auth/team-access";
import type { ApiAuthContext } from "@/api/auth/workos";
import { hasCapability } from "@/api/auth/policy";
import { db, schema } from "@/lib/database";

export function invalidMemoryPayloadResponse(c: { json: JsonContext["json"] }) {
  return validationErrorResponse(c, "invalid_memory_payload", "Invalid translation memory payload");
}

export function memoryNotFoundResponse(c: { json: JsonContext["json"] }) {
  return notFoundResponse(c, "memory_not_found", "Translation memory not found");
}

export function forbiddenResponse(c: { json: JsonContext["json"] }) {
  return sharedForbiddenResponse(c, "forbidden", "Insufficient permissions");
}

export function externalTmsMemoryImmutableResponse(c: { json: JsonContext["json"] }) {
  return sharedForbiddenResponse(
    c,
    "external_tms_memory_immutable",
    "This translation memory is managed by an external TMS and cannot be edited directly",
  );
}

export function isMemoryMutationAllowed(role: ApiAuthContext["membership"]["role"]) {
  return hasCapability(role, "memories:write");
}

export async function ownedMemoryWhere(auth: ApiAuthContext, memoryId: string) {
  const memory = await canAccessMemory(auth, memoryId);
  if (!memory) {
    return sql`false`;
  }

  return and(
    eq(schema.memories.id, memoryId),
    eq(schema.memories.organizationId, auth.organization.localOrganizationId),
  );
}

export async function getOwnedMemory(auth: ApiAuthContext, memoryId: string) {
  const [memory] = await db
    .select()
    .from(schema.memories)
    .where(await ownedMemoryWhere(auth, memoryId))
    .limit(1);

  return memory ?? null;
}
