import { and, eq } from "drizzle-orm";

import {
  forbiddenResponse as sharedForbiddenResponse,
  notFoundResponse,
  validationErrorResponse,
  type JsonContext,
} from "@/api/errors";
import type { ApiAuthContext } from "@/api/auth/workos";
import { hasCapability } from "@/api/auth/policy";
import { schema } from "@/lib/database";

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

export function ownedMemoryWhere(auth: ApiAuthContext, memoryId: string) {
  return and(
    eq(schema.memories.id, memoryId),
    eq(schema.memories.organizationId, auth.organization.localOrganizationId),
  );
}
