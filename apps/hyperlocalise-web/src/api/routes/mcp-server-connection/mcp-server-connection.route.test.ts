import "dotenv/config";

import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

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
        },
      },
      { headers },
    );

    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();
    expect(created.mcpServerConnection.displayName).toBe("Linear MCP");
    expect(created.mcpServerConnection.authKind).toBe("bearer");
    expect(created.mcpServerConnection).not.toHaveProperty("bearerToken");
    expect(created.mcpServerConnection).not.toHaveProperty("ciphertext");

    const listResponse = await client.api.orgs[":organizationSlug"][
      "mcp-server-connections"
    ].$get({ param: { organizationSlug } }, { headers });
    expect(listResponse.status).toBe(200);
    const listed = await listResponse.json();
    expect(listed.mcpServerConnections.some((entry) => entry.id === created.mcpServerConnection.id)).toBe(
      true,
    );

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
        },
      },
      { headers },
    );

    expect(response.status).toBe(400);
  });
});
