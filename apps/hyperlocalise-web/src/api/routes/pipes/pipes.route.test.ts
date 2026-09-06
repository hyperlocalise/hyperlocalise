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
  getPipesConnectionStatus: vi.fn(),
}));

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: mocks.resolveApiAuthContextFromSessionMock,
  };
});

vi.mock("@/lib/pipes/status", () => ({
  getPipesConnectionStatus: (...args: unknown[]) => mocks.getPipesConnectionStatus(...args),
}));

import { createApp } from "@/api/app";
import type { AppType } from "@/api/typed-app";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db } from "@/lib/database/client";
import { ok } from "@/lib/primitives/result/results";

const client = testClient<AppType>(createApp());
const fixture = createAuthTestFixture();

describe("pipesRoutes", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  beforeEach(() => {
    mocks.getPipesConnectionStatus.mockClear();
    mocks.getPipesConnectionStatus.mockResolvedValue(
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

  it("returns the current user's Pipes connection status for a known provider", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);

    const response = await client.api.orgs[":organizationSlug"].pipes[":provider"].$get(
      {
        param: { organizationSlug: identity.organization.slug ?? "", provider: "ahrefs" },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      pipe: {
        provider: "ahrefs",
        connected: true,
        needsReauthorization: false,
        apiKeyLast4: "wxyz",
      },
    });
    expect(mocks.getPipesConnectionStatus).toHaveBeenCalledWith({
      provider: "ahrefs",
      localOrganizationId: globalThis.__testApiAuthContext!.organization.localOrganizationId,
      workosUserId: identity.user.workosUserId,
    });
  });

  it("returns the current user's Pipes connection status for catalog API-key providers", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);

    const response = await client.api.orgs[":organizationSlug"].pipes[":provider"].$get(
      {
        param: { organizationSlug: identity.organization.slug ?? "", provider: "notion" },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      pipe: {
        provider: "notion",
        connected: true,
        needsReauthorization: false,
        apiKeyLast4: "wxyz",
      },
    });
    expect(mocks.getPipesConnectionStatus).toHaveBeenCalledWith({
      provider: "notion",
      localOrganizationId: globalThis.__testApiAuthContext!.organization.localOrganizationId,
      workosUserId: identity.user.workosUserId,
    });
  });

  it("returns not found for an unknown Pipes provider", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);

    const response = await client.api.orgs[":organizationSlug"].pipes[":provider"].$get(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "",
          provider: "unknown-provider" as "ahrefs",
        },
      },
      { headers },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "unknown_pipes_provider" });
    expect(mocks.getPipesConnectionStatus).not.toHaveBeenCalled();
  });
});
