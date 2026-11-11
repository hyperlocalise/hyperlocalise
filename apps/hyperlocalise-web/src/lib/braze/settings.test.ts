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
import "dotenv/config";

import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db } from "@/lib/database/client";
import { isErr, isOk } from "@/lib/primitives/result/results";

import {
  deleteBrazeConnectionSettings,
  getBrazeConnectionSettings,
  loadBrazeRestEndpoint,
  upsertBrazeConnectionSettings,
} from "./settings";

const fixture = createAuthTestFixture();

describe("braze connection settings", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it("upserts, loads, and deletes an allowlisted cluster", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    await fixture.authHeadersFor(identity);
    const localOrganizationId = globalThis.__testApiAuthContext!.organization.localOrganizationId;
    const workosUserId = identity.user.workosUserId;

    const created = await upsertBrazeConnectionSettings({
      localOrganizationId,
      workosUserId,
      restEndpoint: "iad-03",
    });
    expect(isOk(created)).toBe(true);

    const loaded = await loadBrazeRestEndpoint({ localOrganizationId, workosUserId });
    expect(isOk(loaded)).toBe(true);
    if (isOk(loaded)) {
      expect(loaded.value).toBe("iad-03");
    }

    const updated = await upsertBrazeConnectionSettings({
      localOrganizationId,
      workosUserId,
      restEndpoint: "fra-02",
    });
    expect(isOk(updated)).toBe(true);
    expect(await getBrazeConnectionSettings({ localOrganizationId, workosUserId })).toEqual({
      restEndpoint: "fra-02",
    });

    await deleteBrazeConnectionSettings({ localOrganizationId, workosUserId });
    expect(await getBrazeConnectionSettings({ localOrganizationId, workosUserId })).toBeNull();
  });

  it("rejects an unknown cluster key", async () => {
    const result = await upsertBrazeConnectionSettings({
      localOrganizationId: "00000000-0000-0000-0000-000000000000",
      workosUserId: "user_unused",
      restEndpoint: "iad-99",
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("braze_endpoint_invalid");
    }
  });

  it("reports a missing cluster", async () => {
    const result = await loadBrazeRestEndpoint({
      localOrganizationId: "00000000-0000-0000-0000-000000000000",
      workosUserId: "user_unused",
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("braze_endpoint_missing");
    }
  });
});
