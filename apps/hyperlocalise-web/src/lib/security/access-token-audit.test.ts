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
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { mockAudit } from "evlog";

import { isErr, isOk } from "@/lib/primitives/result/results";

import {
  ACCESS_TOKEN_AUDIT_ACTIONS,
  ACCESS_TOKEN_REVOKE_REASONS,
  assertSafeAccessTokenAuditPayload,
  emitPatCreated,
  emitPatRevoked,
  sessionAccessTokenActor,
  systemAccessTokenActor,
} from "./access-token-audit";

const createdInput = {
  actor: sessionAccessTokenActor("user_actor"),
  ownerUserId: "user_owner",
  organizationId: "org_123",
  tokenId: "token_123",
  keyPrefix: "hl_AbCd",
  permissions: ["jobs:read", "files:read"],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("access-token audit payloads", () => {
  it("records creation with actor, owner, token id, and safe prefix", () => {
    const captured = mockAudit();

    const result = emitPatCreated(undefined, createdInput);

    expect(isOk(result)).toBe(true);
    const event = captured.assertAudit({
      action: ACCESS_TOKEN_AUDIT_ACTIONS.created,
      actor: { type: "user", id: "user_actor" },
      target: { id: "token_123" },
    });
    expect(event.target).toEqual({
      type: "personal_access_token",
      id: "token_123",
      organizationId: "org_123",
      ownerUserId: "user_owner",
      keyPrefix: "hl_AbCd",
      permissions: ["jobs:read", "files:read"],
    });
    expect(JSON.stringify(event)).not.toContain("hl_secret");
    expect(JSON.stringify(event)).not.toContain("@example.com");
    captured.restore();
  });

  it("records revocation with a reason and does not require an email", () => {
    const captured = mockAudit();

    const result = emitPatRevoked(undefined, {
      actor: systemAccessTokenActor("workos_webhook"),
      ownerUserId: "user_owner",
      organizationId: "org_123",
      tokenId: "token_123",
      keyPrefix: "hl_AbCd",
      reason: ACCESS_TOKEN_REVOKE_REASONS.membershipRemoved,
    });

    expect(isOk(result)).toBe(true);
    const event = captured.assertAudit({
      action: ACCESS_TOKEN_AUDIT_ACTIONS.revoked,
      actor: { type: "system", id: "workos_webhook" },
    });
    expect(event.reason).toBe(ACCESS_TOKEN_REVOKE_REASONS.membershipRemoved);
    expect(event.target).toMatchObject({
      id: "token_123",
      keyPrefix: "hl_AbCd",
      ownerUserId: "user_owner",
      organizationId: "org_123",
    });
    expect(event).not.toHaveProperty("email");
    captured.restore();
  });

  it("rejects payloads that carry secrets, emails, or request bodies", () => {
    expect(() =>
      assertSafeAccessTokenAuditPayload({
        action: ACCESS_TOKEN_AUDIT_ACTIONS.created,
        actor: { type: "user", id: "user_actor", email: "owner@example.com" },
        target: { type: "personal_access_token", id: "token_123" },
      }),
    ).toThrow("access_token_audit_payload_contains_forbidden_fields");

    expect(() =>
      assertSafeAccessTokenAuditPayload({
        action: ACCESS_TOKEN_AUDIT_ACTIONS.created,
        actor: { type: "user", id: "user_actor" },
        target: {
          type: "personal_access_token",
          id: "token_123",
          keyHash: "sha256-of-secret",
        },
      }),
    ).toThrow("access_token_audit_payload_contains_forbidden_fields");
  });

  it("returns a typed failure when the audit sink throws and does not rethrow the secret", () => {
    const result = emitPatCreated(
      {
        audit: () => {
          throw new Error("hl_this_must_not_escape");
        },
      },
      createdInput,
    );

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toEqual({ code: "audit_emit_failed" });
      expect(JSON.stringify(result.error)).not.toContain("hl_this_must_not_escape");
    }
  });
});
