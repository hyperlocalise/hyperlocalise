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
import { describe, expect, it } from "vite-plus/test";

import {
  ACTIVITY_ACTOR_KINDS,
  ACTIVITY_TARGET_KINDS,
  assertSafeActivityLogPayload,
  isV1ActivityEventType,
  LATER_ACTIVITY_EVENT_TYPES,
  RESERVED_ACTIVITY_EVENT_TYPES,
  V1_ACTIVITY_EVENT_TYPES,
} from "./activity-log-contract";

describe("activity log contract", () => {
  it("defines the four supported actor kinds", () => {
    expect(ACTIVITY_ACTOR_KINDS).toEqual(["user", "system", "agent", "api_key"]);
  });

  it("defines organization and resource targets", () => {
    expect(ACTIVITY_TARGET_KINDS).toEqual([
      "organization",
      "invitation",
      "membership",
      "personal_access_token",
      "organization_api_key",
      "integration",
      "project",
      "glossary",
      "translation_memory",
    ]);
  });

  it("keeps the v1 catalog separate from reserved and later events", () => {
    expect(V1_ACTIVITY_EVENT_TYPES).toContain("personal_access_token_created");
    expect(V1_ACTIVITY_EVENT_TYPES).toContain("glossary_project_attached");
    expect(V1_ACTIVITY_EVENT_TYPES).not.toContain("glossary_ownership_changed");
    expect(V1_ACTIVITY_EVENT_TYPES).not.toContain("organization_api_key_created");
    expect(RESERVED_ACTIVITY_EVENT_TYPES).toEqual([
      "organization_api_key_created",
      "organization_api_key_revoked",
    ]);
    expect(LATER_ACTIVITY_EVENT_TYPES).toEqual([
      "job_created",
      "job_cancelled",
      "job_failed",
      "automation_run_started",
      "automation_enabled",
      "automation_disabled",
    ]);
  });

  it("recognizes only v1 event types for current writers", () => {
    expect(isV1ActivityEventType("member_invited")).toBe(true);
    expect(isV1ActivityEventType("organization_api_key_created")).toBe(false);
    expect(isV1ActivityEventType("job_created")).toBe(false);
  });

  it("rejects forbidden fields at any payload depth", () => {
    expect(() =>
      assertSafeActivityLogPayload({
        safe: { nested: [{ keyHash: "secret" }] },
      }),
    ).toThrow("activity_log_payload_contains_forbidden_field");

    expect(() =>
      assertSafeActivityLogPayload({
        email: "owner@example.com",
      }),
    ).toThrow("activity_log_payload_contains_forbidden_field");
  });

  it("allows approved opaque and safe metadata", () => {
    expect(() =>
      assertSafeActivityLogPayload({
        batchId: "batch_123",
        changedFields: ["name"],
        keyPrefix: "hl_AbCd",
        name: "Native TM",
        resourceId: "resource_123",
      }),
    ).not.toThrow();
  });
});
