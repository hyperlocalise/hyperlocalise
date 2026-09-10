/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { and, eq, sql } from "drizzle-orm";

import { validationErrorResponse } from "@/api/errors";
import {
  apiErrorResponse,
  forbiddenResponse as sharedForbiddenResponse,
  notFoundResponse,
  type JsonContext,
} from "@/api/response.schema";
import { canAccessMemory } from "@/api/auth/team-access";
import type { ApiAuthContext } from "@/api/auth/workos";
import { hasCapability } from "@/api/auth/policy";
import { db, schema } from "@/lib/database/client";
import type { MemoryCapabilityReason } from "@/lib/memory/memory-capabilities";

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

export function memoryEntryReadOnlyResponse(
  c: { json: JsonContext["json"] },
  reason: "external_tms" | "reference_only",
) {
  if (reason === "reference_only") {
    return sharedForbiddenResponse(
      c,
      "memory_entry_read_only",
      "This translation memory is reference-only and cannot be edited",
    );
  }

  return externalTmsMemoryImmutableResponse(c);
}

export function memoryCapabilityDeniedResponse(
  c: { json: JsonContext["json"] },
  action: string,
  reason: MemoryCapabilityReason,
) {
  const messages: Record<MemoryCapabilityReason, string> = {
    unauthorized: "You do not have permission to perform this translation memory action",
    unsupported: "This translation memory does not support this action",
    read_only: "This translation memory is read-only",
    archived: "This translation memory is archived",
    unavailable: "This translation memory is temporarily unavailable",
  };

  return apiErrorResponse(c, 403, `memory_action_${reason}`, messages[reason], { action });
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
