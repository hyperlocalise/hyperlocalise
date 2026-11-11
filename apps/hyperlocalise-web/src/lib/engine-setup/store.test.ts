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
import { db, schema } from "@/lib/database/client";
import { isErr, isOk } from "@/lib/primitives/result/results";

import { createEngineSetupRun, ENGINE_SETUP_DAILY_RUN_LIMIT } from "./store";

const fixture = createAuthTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await fixture.cleanup();
});

async function organizationId() {
  const identity = fixture.createWorkosIdentity();
  await fixture.authHeadersFor(identity);
  return globalThis.__testApiAuthContext?.organization.localOrganizationId ?? "";
}

describe("createEngineSetupRun", () => {
  it("refuses a sixth run in the same day after earlier runs finished", async () => {
    const orgId = await organizationId();
    const now = new Date("2026-11-06T12:00:00.000Z");
    await db.insert(schema.engineSetupRuns).values(
      Array.from({ length: ENGINE_SETUP_DAILY_RUN_LIMIT }, (_, index) => ({
        organizationId: orgId,
        sourceUrl: `https://example.test/${index}`,
        status: "failed" as const,
        createdAt: now,
      })),
    );

    const created = await createEngineSetupRun({
      organizationId: orgId,
      createdByUserId: null,
      sourceUrl: "https://example.test/next",
      sourceLocale: null,
      now,
    });

    expect(isErr(created) && created.error).toEqual({ code: "engine_setup_daily_limit_reached" });
  });

  it("allows a new run once yesterday's finished runs fall outside the daily window", async () => {
    const orgId = await organizationId();
    const now = new Date("2026-11-06T12:00:00.000Z");
    await db.insert(schema.engineSetupRuns).values(
      Array.from({ length: ENGINE_SETUP_DAILY_RUN_LIMIT }, (_, index) => ({
        organizationId: orgId,
        sourceUrl: `https://example.test/${index}`,
        status: "applied" as const,
        createdAt: new Date(now.getTime() - 25 * 60 * 60 * 1000),
      })),
    );

    const created = await createEngineSetupRun({
      organizationId: orgId,
      createdByUserId: null,
      sourceUrl: "https://example.test/next",
      sourceLocale: "en",
      now,
    });

    expect(isOk(created) && created.value.status).toBe("queued");
  });
});
