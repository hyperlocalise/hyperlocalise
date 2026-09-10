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

import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { generateMcpToken, hashMcpToken } from "@/api/auth/mcp";
import { createMcpTestApp } from "@/api/routes/mcp/mcp.fixture";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db, schema } from "@/lib/database/client";
import { createZernioConnection } from "@/lib/zernio/connections";
import { isOk } from "@/lib/primitives/result/results";

const { resolveApiAuthContextFromSessionMock } = vi.hoisted(() => ({
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
    resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
  };
});

const mcpApp = createMcpTestApp();
const fixture = createAuthTestFixture();
const fetchMock = vi.fn();

function jsonFetchResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as Response;
}

async function authenticatedMcpHeaders(identity = fixture.createWorkosIdentityWithRole("admin")) {
  const headers = await fixture.authHeadersFor(identity);

  const accessToken = generateMcpToken();
  const refreshToken = generateMcpToken();

  const auth = globalThis.__testApiAuthContext;
  if (!auth) {
    throw new Error("expected test auth context");
  }

  await db.insert(schema.mcpSessions).values({
    userId: auth.user.localUserId,
    organizationId: auth.organization.localOrganizationId,
    scope: "mcp",
    accessTokenHash: hashMcpToken(accessToken),
    refreshTokenHash: hashMcpToken(refreshToken),
    expiresAt: new Date(Date.now() + 60_000),
    refreshExpiresAt: new Date(Date.now() + 120_000),
  });

  return {
    ...headers,
    authorization: `Bearer ${accessToken}`,
  };
}

async function callMcpTool(
  headers: Record<string, string>,
  name: string,
  args: Record<string, unknown> = {},
) {
  return mcpApp.request("http://localhost/mcp", {
    method: "POST",
    headers: {
      ...headers,
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name,
        arguments: args,
      },
    }),
  });
}

async function readToolResult(response: Response) {
  expect(response.status).toBe(200);

  const body = (await response.json()) as {
    result?: {
      isError?: boolean;
      content?: Array<{ type: string; text?: string }>;
    };
  };

  const text = body.result?.content?.[0]?.text;
  expect(text).toBeDefined();

  return {
    isError: body.result?.isError === true,
    output: JSON.parse(text!) as Record<string, unknown>,
  };
}

async function seedValidConnection(apiKey = "zernio_mcp_key_1234") {
  const auth = globalThis.__testApiAuthContext;
  if (!auth) {
    throw new Error("expected test auth context");
  }

  const created = await createZernioConnection({
    organizationId: auth.organization.localOrganizationId,
    userId: auth.user.localUserId,
    displayName: "MCP Zernio",
    apiKey,
    enabled: true,
    validate: false,
  });
  if (!isOk(created)) {
    throw new Error(`expected connection, got ${created.error.code}`);
  }

  await db
    .update(schema.zernioConnections)
    .set({ validationStatus: "valid", validationMessage: "Connected (1 accounts)." })
    .where(eq(schema.zernioConnections.id, created.value.id));

  return created.value;
}

describe("MCP Zernio tools", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    await fixture.cleanup();
  });

  it("advertises zernio ads tools", async () => {
    const headers = await authenticatedMcpHeaders();

    const response = await mcpApp.request("http://localhost/mcp", {
      method: "POST",
      headers: {
        ...headers,
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      result?: { tools?: Array<{ name: string }> };
    };
    const names = (body.result?.tools ?? []).map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "zernio_list_connections",
        "zernio_list_accounts",
        "zernio_list_ads",
        "zernio_get_ad",
        "zernio_create_ad",
        "zernio_create_campaign",
      ]),
    );
  });

  it("lists connections without exposing secrets", async () => {
    const headers = await authenticatedMcpHeaders();
    const connection = await seedValidConnection("zernio_secret_key_abcd");

    const result = await readToolResult(await callMcpTool(headers, "zernio_list_connections"));

    expect(result.isError).toBe(false);
    expect(result.output).toMatchObject({
      zernioConnections: [
        expect.objectContaining({
          id: connection.id,
          displayName: "MCP Zernio",
          enabled: true,
          validationStatus: "valid",
        }),
      ],
    });
    expect(JSON.stringify(result.output)).not.toContain("zernio_secret_key_abcd");
  });

  it("lists accounts through the connected Zernio key", async () => {
    const headers = await authenticatedMcpHeaders();
    await seedValidConnection();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(
      jsonFetchResponse({
        accounts: [{ _id: "acct_1", name: "Acme Meta" }],
      }),
    );

    const result = await readToolResult(await callMcpTool(headers, "zernio_list_accounts"));

    expect(result.isError).toBe(false);
    expect(result.output).toEqual({
      accounts: [{ _id: "acct_1", name: "Acme Meta" }],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("creates an ad through Zernio", async () => {
    const headers = await authenticatedMcpHeaders();
    await seedValidConnection();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(
      jsonFetchResponse({
        ad: { _id: "ad_1", status: "PAUSED" },
      }),
    );

    const result = await readToolResult(
      await callMcpTool(headers, "zernio_create_ad", {
        accountId: "acct_1",
        adAccountId: "act_1",
        name: "Localized launch",
        status: "PAUSED",
        idempotencyKey: "mcp-create-ad-1",
      }),
    );

    expect(result.isError).toBe(false);
    expect(result.output).toEqual({
      ad: { _id: "ad_1", status: "PAUSED" },
    });
    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("mcp-create-ad-1");
    expect(JSON.parse(typeof init.body === "string" ? init.body : "")).toMatchObject({
      status: "PAUSED",
    });
  });

  it("defaults omitted ad status to PAUSED and still sends an idempotency key", async () => {
    const headers = await authenticatedMcpHeaders();
    await seedValidConnection();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(
      jsonFetchResponse({
        ad: { _id: "ad_1", status: "PAUSED" },
      }),
    );

    const result = await readToolResult(
      await callMcpTool(headers, "zernio_create_ad", {
        accountId: "acct_1",
        adAccountId: "act_1",
        name: "Localized launch",
      }),
    );

    expect(result.isError).toBe(false);
    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(JSON.parse(typeof init.body === "string" ? init.body : "")).toMatchObject({
      accountId: "acct_1",
      adAccountId: "act_1",
      name: "Localized launch",
      status: "PAUSED",
    });
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toMatch(
      /^zernio:[a-f0-9]{64}$/,
    );
  });

  it("returns forbidden when a read-only member creates an ad", async () => {
    const adminIdentity = fixture.createWorkosIdentityWithRole("admin");
    await authenticatedMcpHeaders(adminIdentity);
    await seedValidConnection();

    const memberIdentity = fixture.createWorkosIdentityForOrganization(
      adminIdentity.organization,
      "member",
    );
    const headers = await authenticatedMcpHeaders(memberIdentity);
    vi.stubGlobal("fetch", fetchMock);

    const result = await readToolResult(
      await callMcpTool(headers, "zernio_create_ad", {
        accountId: "acct_1",
        adAccountId: "act_1",
        name: "Localized launch",
      }),
    );

    expect(result.isError).toBe(true);
    expect(result.output.error).toBe("forbidden");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns not connected when no Zernio key is saved", async () => {
    const headers = await authenticatedMcpHeaders();

    const result = await readToolResult(await callMcpTool(headers, "zernio_list_accounts"));

    expect(result.isError).toBe(true);
    expect(result.output.error).toBe("zernio_connection_not_found");
  });
});
