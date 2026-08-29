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
import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vite-plus/test";

import {
  apiKeyIdParamsSchema,
  apiKeySummarySchema,
  createApiKeyBodySchema,
  createdApiKeySchema,
} from "./api-key.schema";

function summaryFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    name: "CLI",
    keyPrefix: "hl_AbCd",
    permissions: ["jobs:read"],
    lastUsedAt: null,
    revokedAt: null,
    createdAt: "2026-08-29T00:00:00.000Z",
    owner: {
      userId: randomUUID(),
      email: "owner@example.com",
      firstName: null,
      lastName: null,
    },
    ...overrides,
  };
}

describe("createApiKeyBodySchema", () => {
  it("accepts a name with optional permissions", () => {
    const parsed = createApiKeyBodySchema.safeParse({ name: "CLI", permissions: ["jobs:read"] });

    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual({ name: "CLI", permissions: ["jobs:read"] });
  });

  it("rejects an unknown permission", () => {
    const parsed = createApiKeyBodySchema.safeParse({
      name: "CLI",
      permissions: ["api_keys:read"],
    });

    expect(parsed.success).toBe(false);
  });

  it("accepts no owner parameter, so a caller cannot name somebody else as owner", () => {
    const parsed = createApiKeyBodySchema.safeParse({
      name: "CLI",
      owner: { userId: randomUUID() },
      createdByUserId: randomUUID(),
    });

    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual({ name: "CLI" });
  });
});

describe("apiKeyIdParamsSchema", () => {
  it("accepts a token id", () => {
    const apiKeyId = randomUUID();

    expect(apiKeyIdParamsSchema.safeParse({ apiKeyId }).data).toEqual({ apiKeyId });
  });

  it("rejects a malformed token id so probing answers not found", () => {
    expect(apiKeyIdParamsSchema.safeParse({ apiKeyId: "not-a-token-id" }).success).toBe(false);
    expect(apiKeyIdParamsSchema.safeParse({ apiKeyId: "" }).success).toBe(false);
  });
});

describe("apiKeySummarySchema", () => {
  it("requires owner attribution on every token", () => {
    const { owner: _owner, ...withoutOwner } = summaryFixture();

    expect(apiKeySummarySchema.safeParse(withoutOwner).success).toBe(false);
  });

  it("allows a null owner for a legacy token", () => {
    expect(apiKeySummarySchema.safeParse(summaryFixture({ owner: null })).success).toBe(true);
  });

  it("carries neither the secret nor its hash", () => {
    const parsed = apiKeySummarySchema.parse(
      summaryFixture({ key: "hl_secret", keyHash: "hash" }) as never,
    );

    expect(parsed).not.toHaveProperty("key");
    expect(parsed).not.toHaveProperty("keyHash");
  });
});

describe("createdApiKeySchema", () => {
  it("returns the secret once alongside the owner", () => {
    const { lastUsedAt: _lastUsedAt, revokedAt: _revokedAt, ...summary } = summaryFixture();
    const parsed = createdApiKeySchema.parse({ ...summary, key: "hl_secret" });

    expect(parsed.key).toBe("hl_secret");
    expect(parsed.owner).toEqual(summary.owner);
    expect(parsed).not.toHaveProperty("keyHash");
  });

  it("rejects a created token without an owner", () => {
    const { lastUsedAt: _lastUsedAt, revokedAt: _revokedAt, ...summary } = summaryFixture();
    const { owner: _owner, ...withoutOwner } = summary;

    expect(createdApiKeySchema.safeParse({ ...withoutOwner, key: "hl_secret" }).success).toBe(
      false,
    );
  });
});
