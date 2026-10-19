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
  enqueueActivityLogEventMock: vi.fn().mockResolvedValue({
    ok: true,
    value: { createdAt: new Date(), id: "activity-event-1" },
  }),
  enqueueActivityLogEventsMock: vi.fn().mockResolvedValue([]),
  resolveApiAuthContextFromSessionMock: vi.fn(
    (options) =>
      globalThis.__resolveTestApiAuthContextFromSession?.(options) ??
      globalThis.__testApiAuthContext ??
      null,
  ),
}));

vi.mock("@/lib/activity-log/activity-log-writer", () => ({
  enqueueActivityLogEvent: mocks.enqueueActivityLogEventMock,
  enqueueActivityLogEvents: mocks.enqueueActivityLogEventsMock,
}));

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: mocks.resolveApiAuthContextFromSessionMock,
  };
});

import { createApp } from "@/api/app";
import type { AppType } from "@/api/typed-app";
import { db } from "@/lib/database/client";
import { createApiKeyTestFixture } from "@/api/routes/api-key/api-key.fixture";
import { createProjectTestFixture } from "@/api/routes/project/project.fixture";

const client = testClient<AppType>(createApp());
const apiKeyFixture = createApiKeyTestFixture();
const projectFixture = createProjectTestFixture(client);

describe("sanityConnectionRoutes", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await apiKeyFixture.cleanup();
    await projectFixture.cleanup();
  });

  it("creates a Sanity connection without returning a secret", async () => {
    const identity = apiKeyFixture.createWorkosIdentityWithRole("admin");
    const headers = await apiKeyFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const { apiKey } = await apiKeyFixture.createOwnedApiKey(identity, {
      name: "Sanity Connection Key",
    });

    const projectResponse = await projectFixture.createProjectViaApi(identity);
    const projectBody = (await projectResponse.json()) as { project: { id: string } };

    const response = await client.api.orgs[":organizationSlug"]["sanity-connections"].$post(
      {
        param: { organizationSlug },
        json: {
          displayName: "Marketing Sanity",
          apiKeyId: apiKey.id,
        },
      },
      { headers },
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      sanityConnection: {
        displayName: string;
      };
      connectionToken?: string;
    };
    expect(body.sanityConnection.displayName).toBe("Marketing Sanity");
    expect(body.connectionToken).toBeUndefined();
    expect(projectBody.project.id).toBeTruthy();
    expect(mocks.enqueueActivityLogEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "integration_connected",
        payload: expect.objectContaining({ integrationKind: "sanity-plugin" }),
      }),
    );
  });

  it("creates a Sanity connection without optional fields", async () => {
    const identity = apiKeyFixture.createWorkosIdentityWithRole("admin");
    const headers = await apiKeyFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const { apiKey } = await apiKeyFixture.createOwnedApiKey(identity, {
      name: "Sanity Unbound Key",
    });

    const response = await client.api.orgs[":organizationSlug"]["sanity-connections"].$post(
      {
        param: { organizationSlug },
        json: {
          displayName: "Unbound Sanity",
          apiKeyId: apiKey.id,
        },
      },
      { headers },
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      sanityConnection: { displayName: string };
    };
    expect(body.sanityConnection.displayName).toBe("Unbound Sanity");
  });

  it("rejects Sanity connection creation when the API key is missing write scopes", async () => {
    const identity = apiKeyFixture.createWorkosIdentityWithRole("admin");
    const headers = await apiKeyFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const { apiKey } = await apiKeyFixture.createOwnedApiKey(identity, {
      name: "Sanity read-only key",
      permissions: ["files:read", "jobs:read"],
    });

    const response = await client.api.orgs[":organizationSlug"]["sanity-connections"].$post(
      {
        param: { organizationSlug },
        json: {
          displayName: "Read-only Sanity",
          apiKeyId: apiKey.id,
        },
      },
      { headers },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "sanity_api_key_missing_permissions",
    });
  });

  it("rejects Sanity connection creation for members without write access", async () => {
    const identity = apiKeyFixture.createWorkosIdentityWithRole("member");
    const headers = await apiKeyFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const response = await client.api.orgs[":organizationSlug"]["sanity-connections"].$post(
      {
        param: { organizationSlug },
        json: {
          displayName: "Blocked",
          apiKeyId: "00000000-0000-4000-8000-000000000001",
        },
      },
      { headers },
    );

    expect(response.status).toBe(403);
  });
});
