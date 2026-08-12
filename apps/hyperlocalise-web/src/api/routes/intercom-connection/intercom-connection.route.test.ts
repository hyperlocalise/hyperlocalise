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
}));

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: mocks.resolveApiAuthContextFromSessionMock,
  };
});

import { createApp } from "@/api/app";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db } from "@/lib/database";

const client = testClient(createApp());
const fixture = createAuthTestFixture();

describe("intercomConnectionRoutes", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await fixture.cleanup();
  });

  it("creates lists and deletes an Intercom connection", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const createResponse = await client.api.orgs[":organizationSlug"][
      "intercom-connections"
    ].$post(
      {
        param: { organizationSlug },
        json: {
          displayName: "Intercom Prod",
          accessToken: "intercom_test_access_token_1234",
          restEndpoint: "au",
          enabled: true,
          validate: false,
        },
      },
      { headers },
    );

    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();
    expect(created).toMatchObject({
      intercomConnection: {
        displayName: "Intercom Prod",
        restEndpoint: "au",
        enabled: true,
      },
    });
    if (!("intercomConnection" in created)) {
      throw new Error("expected intercomConnection in create response");
    }
    expect(created.intercomConnection).not.toHaveProperty("accessToken");
    expect(created.intercomConnection).not.toHaveProperty("ciphertext");
    expect(created.intercomConnection.maskedAccessTokenSuffix).toContain("1234");

    const listResponse = await client.api.orgs[":organizationSlug"][
      "intercom-connections"
    ].$get({ param: { organizationSlug } }, { headers });
    expect(listResponse.status).toBe(200);
    const listed = await listResponse.json();
    expect(listed).toMatchObject({
      intercomConnections: expect.arrayContaining([
        expect.objectContaining({ id: created.intercomConnection.id }),
      ]),
    });

    const deleteResponse = await client.api.orgs[":organizationSlug"][
      "intercom-connections"
    ][":connectionId"].$delete(
      {
        param: {
          organizationSlug,
          connectionId: created.intercomConnection.id,
        },
      },
      { headers },
    );
    expect(deleteResponse.status).toBe(204);
  });

  it("rejects invalid Intercom connection payloads", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const response = await client.api.orgs[":organizationSlug"]["intercom-connections"].$post(
      {
        param: { organizationSlug },
        json: {
          displayName: "",
          accessToken: "",
          restEndpoint: "https://api.intercom.io",
          enabled: true,
        },
      },
      { headers },
    );

    expect(response.status).toBe(400);
  });
});
