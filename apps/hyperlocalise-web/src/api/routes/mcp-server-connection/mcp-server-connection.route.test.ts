/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
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

describe("mcpServerConnectionRoutes", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await fixture.cleanup();
  });

  it("creates lists and deletes an MCP server connection", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const createResponse = await client.api.orgs[":organizationSlug"][
      "mcp-server-connections"
    ].$post(
      {
        param: { organizationSlug },
        json: {
          displayName: "Linear MCP",
          serverUrl: "https://mcp.linear.app/mcp",
          transport: "http",
          authKind: "bearer",
          bearerToken: "lin_api_test_token",
          enabled: true,
        },
      },
      { headers },
    );

    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();
    expect(created).toMatchObject({
      mcpServerConnection: {
        displayName: "Linear MCP",
        authKind: "bearer",
      },
    });
    if (!("mcpServerConnection" in created)) {
      throw new Error("expected mcpServerConnection in create response");
    }
    expect(created.mcpServerConnection).not.toHaveProperty("bearerToken");
    expect(created.mcpServerConnection).not.toHaveProperty("ciphertext");

    const listResponse = await client.api.orgs[":organizationSlug"]["mcp-server-connections"].$get(
      { param: { organizationSlug } },
      { headers },
    );
    expect(listResponse.status).toBe(200);
    const listed = await listResponse.json();
    expect(listed).toMatchObject({
      mcpServerConnections: expect.arrayContaining([
        expect.objectContaining({ id: created.mcpServerConnection.id }),
      ]),
    });

    const deleteResponse = await client.api.orgs[":organizationSlug"]["mcp-server-connections"][
      ":connectionId"
    ].$delete(
      {
        param: {
          organizationSlug,
          connectionId: created.mcpServerConnection.id,
        },
      },
      { headers },
    );
    expect(deleteResponse.status).toBe(204);
  });

  it("rejects invalid MCP connection payloads", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const response = await client.api.orgs[":organizationSlug"]["mcp-server-connections"].$post(
      {
        param: { organizationSlug },
        json: {
          displayName: "",
          serverUrl: "not-a-url",
          transport: "http",
          authKind: "none",
          enabled: true,
        },
      },
      { headers },
    );

    expect(response.status).toBe(400);
  });
});
