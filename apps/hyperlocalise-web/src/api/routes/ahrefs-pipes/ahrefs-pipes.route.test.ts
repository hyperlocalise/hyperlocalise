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
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(
    (options) =>
      globalThis.__resolveTestApiAuthContextFromSession?.(options) ??
      globalThis.__testApiAuthContext ??
      null,
  ),
  getAhrefsPipesConnectionStatus: vi.fn(),
}));

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: mocks.resolveApiAuthContextFromSessionMock,
  };
});

vi.mock("@/lib/ahrefs/pipes", () => ({
  getAhrefsPipesConnectionStatus: (...args: unknown[]) =>
    mocks.getAhrefsPipesConnectionStatus(...args),
}));

import { createApp } from "@/api/app";
import type { AppType } from "@/api/typed-app";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db } from "@/lib/database/client";
import { ok } from "@/lib/primitives/result/results";

const client = testClient<AppType>(createApp());
const fixture = createAuthTestFixture();

describe("ahrefsPipesRoutes", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  beforeEach(() => {
    mocks.getAhrefsPipesConnectionStatus.mockResolvedValue(
      ok({
        connected: true,
        needsReauthorization: false,
        apiKeyLast4: "wxyz",
      }),
    );
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it("returns the current user's Ahrefs Pipes connection status", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);

    const response = await client.api.orgs[":organizationSlug"].pipes.ahrefs.$get(
      {
        param: { organizationSlug: identity.organization.slug ?? "" },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ahrefsPipe: {
        connected: true,
        needsReauthorization: false,
        apiKeyLast4: "wxyz",
      },
    });
    expect(mocks.getAhrefsPipesConnectionStatus).toHaveBeenCalledWith({
      localOrganizationId: globalThis.__testApiAuthContext!.organization.localOrganizationId,
      workosUserId: identity.user.workosUserId,
    });
  });
});
