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
  getBrazePipesConnectionStatus: vi.fn(),
  saveBrazePipesApiKey: vi.fn(),
}));

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: mocks.resolveApiAuthContextFromSessionMock,
  };
});

vi.mock("@/lib/braze/pipes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/braze/pipes")>();
  return {
    ...actual,
    getBrazePipesConnectionStatus: (...args: unknown[]) =>
      mocks.getBrazePipesConnectionStatus(...args),
    saveBrazePipesApiKey: (...args: unknown[]) => mocks.saveBrazePipesApiKey(...args),
  };
});

import { createApp } from "@/api/app";
import type { AppType } from "@/api/typed-app";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db } from "@/lib/database/client";
import { ok } from "@/lib/primitives/result/results";

const client = testClient<AppType>(createApp());
const fixture = createAuthTestFixture();

describe("brazeRoutes", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  beforeEach(() => {
    mocks.getBrazePipesConnectionStatus.mockReset();
    mocks.saveBrazePipesApiKey.mockReset();
    mocks.getBrazePipesConnectionStatus.mockResolvedValue(
      ok({
        connected: true,
        needsReauthorization: false,
        apiKeyLast4: "abcd",
      }),
    );
    mocks.saveBrazePipesApiKey.mockResolvedValue(
      ok({
        connected: true,
        needsReauthorization: false,
        apiKeyLast4: "cdef",
      }),
    );
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it("saves a cluster after Pipes is connected and returns it on GET", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "";

    const putResponse = await client.api.orgs[":organizationSlug"].braze.$put(
      {
        param: { organizationSlug },
        json: { restEndpoint: "iad-03" },
      },
      { headers },
    );

    expect(putResponse.status).toBe(200);
    expect(await putResponse.json()).toEqual({
      braze: { restEndpoint: "iad-03" },
    });

    const getResponse = await client.api.orgs[":organizationSlug"].braze.$get(
      { param: { organizationSlug } },
      { headers },
    );

    expect(getResponse.status).toBe(200);
    expect(await getResponse.json()).toEqual({
      braze: { restEndpoint: "iad-03" },
    });
    expect(mocks.saveBrazePipesApiKey).not.toHaveBeenCalled();
  });

  it("saves a Pipes API key with the cluster when disconnected", async () => {
    mocks.getBrazePipesConnectionStatus.mockResolvedValue(
      ok({
        connected: false,
        needsReauthorization: false,
        apiKeyLast4: null,
      }),
    );
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "";

    const putResponse = await client.api.orgs[":organizationSlug"].braze.$put(
      {
        param: { organizationSlug },
        json: { restEndpoint: "iad-03", apiKey: "braze-rest-key" },
      },
      { headers },
    );

    expect(putResponse.status).toBe(200);
    expect(await putResponse.json()).toEqual({
      braze: { restEndpoint: "iad-03" },
    });
    expect(mocks.saveBrazePipesApiKey).toHaveBeenCalledWith({
      localOrganizationId: globalThis.__testApiAuthContext!.organization.localOrganizationId,
      workosUserId: identity.user.workosUserId,
      apiKey: "braze-rest-key",
    });
  });

  it("rejects an unknown cluster key", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);

    const response = await client.api.orgs[":organizationSlug"].braze.$put(
      {
        param: { organizationSlug: identity.organization.slug ?? "" },
        json: { restEndpoint: "iad-99" as "iad-03" },
      },
      { headers },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_braze_endpoint" });
  });

  it("rejects a cluster save without a Pipes key when disconnected", async () => {
    mocks.getBrazePipesConnectionStatus.mockResolvedValue(
      ok({
        connected: false,
        needsReauthorization: false,
        apiKeyLast4: null,
      }),
    );
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);

    const response = await client.api.orgs[":organizationSlug"].braze.$put(
      {
        param: { organizationSlug: identity.organization.slug ?? "" },
        json: { restEndpoint: "iad-03" },
      },
      { headers },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "braze_api_key_required" });
    expect(mocks.saveBrazePipesApiKey).not.toHaveBeenCalled();
  });

  it("clears a stale cluster when Pipes is disconnected", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "";

    const putResponse = await client.api.orgs[":organizationSlug"].braze.$put(
      {
        param: { organizationSlug },
        json: { restEndpoint: "fra-01" },
      },
      { headers },
    );
    expect(putResponse.status).toBe(200);

    mocks.getBrazePipesConnectionStatus.mockResolvedValue(
      ok({
        connected: false,
        needsReauthorization: false,
        apiKeyLast4: null,
      }),
    );

    const getResponse = await client.api.orgs[":organizationSlug"].braze.$get(
      { param: { organizationSlug } },
      { headers },
    );

    expect(getResponse.status).toBe(200);
    expect(await getResponse.json()).toEqual({ braze: null });
  });

  it("deletes the stored cluster", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "";

    await client.api.orgs[":organizationSlug"].braze.$put(
      {
        param: { organizationSlug },
        json: { restEndpoint: "au-01" },
      },
      { headers },
    );

    const deleteResponse = await client.api.orgs[":organizationSlug"].braze.$delete(
      { param: { organizationSlug } },
      { headers },
    );
    expect(deleteResponse.status).toBe(204);

    const getResponse = await client.api.orgs[":organizationSlug"].braze.$get(
      { param: { organizationSlug } },
      { headers },
    );
    expect(await getResponse.json()).toEqual({ braze: null });
  });

  it("forbids writes for a developer", async () => {
    const identity = fixture.createWorkosIdentityWithRole("developer");
    const headers = await fixture.authHeadersFor(identity);

    const response = await client.api.orgs[":organizationSlug"].braze.$put(
      {
        param: { organizationSlug: identity.organization.slug ?? "" },
        json: { restEndpoint: "iad-03" },
      },
      { headers },
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "forbidden" });
  });
});
