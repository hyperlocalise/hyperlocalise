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
import { audit, defineAuditAction, type AuditActor, type AuditInput } from "evlog";

import { err, ok, type Result } from "@/lib/primitives/result/results";

export const ACCESS_TOKEN_AUDIT_ACTIONS = {
  created: "pat.created",
  revoked: "pat.revoked",
} as const;

export const ACCESS_TOKEN_REVOKE_REASONS = {
  manual: "manual",
  membershipRemoved: "membership_removed",
} as const;

export type AccessTokenRevokeReason =
  (typeof ACCESS_TOKEN_REVOKE_REASONS)[keyof typeof ACCESS_TOKEN_REVOKE_REASONS];

export type AccessTokenAuditError = { code: "audit_emit_failed" };

export type AccessTokenAuditLogger = {
  audit: (input: AuditInput) => void;
};

type AccessTokenAuditActorInput = {
  type: AuditActor["type"];
  id: string;
};

type AccessTokenCreatedAuditInput = {
  actor: AccessTokenAuditActorInput;
  ownerUserId: string;
  organizationId: string;
  tokenId: string;
  keyPrefix: string;
  permissions: readonly string[];
};

type AccessTokenRevokedAuditInput = {
  actor: AccessTokenAuditActorInput;
  ownerUserId: string | null;
  organizationId: string;
  tokenId: string;
  keyPrefix: string;
  reason: AccessTokenRevokeReason;
};

export const patCreated = defineAuditAction(ACCESS_TOKEN_AUDIT_ACTIONS.created, {
  target: "personal_access_token",
  severity: "high",
  description: "A personal access token or organization API key was created",
});

export const patRevoked = defineAuditAction(ACCESS_TOKEN_AUDIT_ACTIONS.revoked, {
  target: "personal_access_token",
  severity: "high",
  requiresReason: true,
  description: "A personal access token or organization API key was revoked",
});

const SAFE_TARGET_KEYS = new Set([
  "type",
  "id",
  "organizationId",
  "ownerUserId",
  "keyPrefix",
  "permissions",
]);

function toSafeActor(actor: AccessTokenAuditActorInput): AuditActor {
  return {
    type: actor.type,
    id: actor.id,
  };
}

function toSafeCreatedTarget(input: AccessTokenCreatedAuditInput) {
  return {
    type: "personal_access_token" as const,
    id: input.tokenId,
    organizationId: input.organizationId,
    ownerUserId: input.ownerUserId,
    keyPrefix: input.keyPrefix,
    permissions: [...input.permissions],
  };
}

function toSafeRevokedTarget(input: AccessTokenRevokedAuditInput) {
  return {
    type: "personal_access_token" as const,
    id: input.tokenId,
    organizationId: input.organizationId,
    ownerUserId: input.ownerUserId,
    keyPrefix: input.keyPrefix,
  };
}

export function assertSafeAccessTokenAuditPayload(payload: AuditInput) {
  const serialized = JSON.stringify(payload);
  if (
    serialized.includes("keyHash") ||
    serialized.includes("key_hash") ||
    serialized.includes("x-api-key") ||
    serialized.includes("authorization") ||
    /"email"\s*:/.test(serialized) ||
    /"body"\s*:/.test(serialized) ||
    /"requestBody"\s*:/.test(serialized)
  ) {
    throw new Error("access_token_audit_payload_contains_forbidden_fields");
  }

  if (payload.target) {
    for (const key of Object.keys(payload.target)) {
      if (!SAFE_TARGET_KEYS.has(key)) {
        throw new Error("access_token_audit_payload_contains_forbidden_fields");
      }
    }
  }
}

function emitAudit(
  log: AccessTokenAuditLogger | undefined,
  payload: AuditInput,
): Result<void, AccessTokenAuditError> {
  try {
    assertSafeAccessTokenAuditPayload(payload);
    if (log && typeof log.audit === "function") {
      log.audit(payload);
    } else {
      audit(payload);
    }
    return ok(undefined);
  } catch {
    return err({ code: "audit_emit_failed" });
  }
}

export function emitPatCreated(
  log: AccessTokenAuditLogger | undefined,
  input: AccessTokenCreatedAuditInput,
): Result<void, AccessTokenAuditError> {
  return emitAudit(
    log,
    patCreated({
      actor: toSafeActor(input.actor),
      target: toSafeCreatedTarget(input),
      outcome: "success",
    }),
  );
}

export function emitPatRevoked(
  log: AccessTokenAuditLogger | undefined,
  input: AccessTokenRevokedAuditInput,
): Result<void, AccessTokenAuditError> {
  return emitAudit(
    log,
    patRevoked({
      actor: toSafeActor(input.actor),
      target: toSafeRevokedTarget(input),
      outcome: "success",
      reason: input.reason,
    }),
  );
}

export function sessionAccessTokenActor(userId: string): AccessTokenAuditActorInput {
  return { type: "user", id: userId };
}

export function systemAccessTokenActor(id: string): AccessTokenAuditActorInput {
  return { type: "system", id };
}
