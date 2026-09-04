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

import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(
    (options) =>
      globalThis.__resolveTestApiAuthContextFromSession?.(options) ??
      globalThis.__testApiAuthContext ??
      null,
  ),
  getWorkspaceOverviewSnapshot: vi.fn(),
}));

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: mocks.resolveApiAuthContextFromSessionMock,
  };
});

vi.mock("@/lib/workspace/overview-snapshot", () => ({
  getWorkspaceOverviewSnapshot: mocks.getWorkspaceOverviewSnapshot,
}));

import { createApp } from "@/api/app";
import type { AppType } from "@/api/typed-app";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db } from "@/lib/database/client";
import type { WorkspaceOverviewSnapshot } from "@/lib/workspace/overview-snapshot-model";

const client = testClient<AppType>(createApp());
const authFixture = createAuthTestFixture();

const overviewFixture: WorkspaceOverviewSnapshot = {
  metrics: {
    jobs: { count: 4, series: [0, 0, 1, 0, 1, 0, 2] },
    translations: { count: 12, series: [1, 1, 2, 2, 2, 2, 2] },
    automations: { total: 3, paused: 1 },
    issues: { open: 5, p1: 2 },
  },
  activity: [],
  projects: [],
  board: [],
  automations: [],
};

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.clearAllMocks();
  await authFixture.cleanup();
});

describe("overview routes", () => {
  it("returns the workspace overview snapshot", async () => {
    const identity = authFixture.createWorkosIdentityWithRole("member");
    mocks.getWorkspaceOverviewSnapshot.mockResolvedValue(overviewFixture);

    const response = await client.api.orgs[":organizationSlug"].overview.$get(
      { param: { organizationSlug: identity.organization.slug ?? "missing" } },
      { headers: await authFixture.authHeadersFor(identity) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ overview: overviewFixture });
    expect(mocks.getWorkspaceOverviewSnapshot).toHaveBeenCalledOnce();
  });

  it("requires a session", async () => {
    const response = await client.api.orgs[":organizationSlug"].overview.$get({
      param: { organizationSlug: "acme" },
    });

    expect(response.status).toBe(401);
    expect(mocks.getWorkspaceOverviewSnapshot).not.toHaveBeenCalled();
  });
});
