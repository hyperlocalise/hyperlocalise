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

describe("figmaConnectionRoutes", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await apiKeyFixture.cleanup();
    await projectFixture.cleanup();
  });

  it("creates a Figma connection with a one-time connection token", async () => {
    const identity = apiKeyFixture.createWorkosIdentityWithRole("admin");
    const headers = await apiKeyFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const { apiKey } = await apiKeyFixture.createOwnedApiKey(identity, {
      name: "Figma Connection Key",
    });

    const projectResponse = await projectFixture.createProjectViaApi(identity);
    const projectBody = (await projectResponse.json()) as { project: { id: string } };

    const response = await client.api.orgs[":organizationSlug"]["figma-connections"].$post(
      {
        param: { organizationSlug },
        json: {
          displayName: "Marketing Figma",
          apiKeyId: apiKey.id,
        },
      },
      { headers },
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      figmaConnection: {
        displayName: string;
        connectionTokenPrefix: string;
      };
      connectionToken: string;
    };
    expect(body.figmaConnection.displayName).toBe("Marketing Figma");
    expect(body.connectionToken).toMatch(/^hl_figma_/);
    expect(body.figmaConnection.connectionTokenPrefix).toBe(body.connectionToken.slice(0, 12));
    expect(projectBody.project.id).toBeTruthy();
  });

  it("creates a Figma connection without optional fields", async () => {
    const identity = apiKeyFixture.createWorkosIdentityWithRole("admin");
    const headers = await apiKeyFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const { apiKey } = await apiKeyFixture.createOwnedApiKey(identity, {
      name: "Figma Unbound Key",
    });

    const response = await client.api.orgs[":organizationSlug"]["figma-connections"].$post(
      {
        param: { organizationSlug },
        json: {
          displayName: "Unbound Figma",
          apiKeyId: apiKey.id,
        },
      },
      { headers },
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      figmaConnection: { displayName: string };
    };
    expect(body.figmaConnection.displayName).toBe("Unbound Figma");
  });

  it("records a credential rotation when the connection token is regenerated", async () => {
    const identity = apiKeyFixture.createWorkosIdentityWithRole("admin");
    const headers = await apiKeyFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const { apiKey } = await apiKeyFixture.createOwnedApiKey(identity, {
      name: "Figma Rotation Key",
    });
    const createResponse = await client.api.orgs[":organizationSlug"]["figma-connections"].$post(
      {
        param: { organizationSlug },
        json: {
          displayName: "Rotating Figma",
          apiKeyId: apiKey.id,
        },
      },
      { headers },
    );
    const created = (await createResponse.json()) as { figmaConnection: { id: string } };
    mocks.enqueueActivityLogEventMock.mockClear();

    const response = await client.api.orgs[":organizationSlug"]["figma-connections"][
      ":connectionId"
    ]["regenerate-token"].$post(
      { param: { organizationSlug, connectionId: created.figmaConnection.id } },
      { headers },
    );

    expect(response.status).toBe(200);
    expect(mocks.enqueueActivityLogEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "integration_credential_rotated",
        payload: { connectionId: created.figmaConnection.id, integrationKind: "figma" },
        targetId: created.figmaConnection.id,
        targetKind: "integration",
      }),
    );
  });

  it("rejects Figma connection creation for members without write access", async () => {
    const identity = apiKeyFixture.createWorkosIdentityWithRole("member");
    const headers = await apiKeyFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const response = await client.api.orgs[":organizationSlug"]["figma-connections"].$post(
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
