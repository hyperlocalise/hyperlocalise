/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import "dotenv/config";

import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db } from "@/lib/database";
import { isErr, isOk } from "@/lib/primitives/result/results";

import {
  buildMcpServerAuthHeaders,
  createMcpServerConnection,
  deleteMcpServerConnection,
  loadMcpServerConnectionWithSecret,
} from "./connections";

const fixture = createAuthTestFixture();

describe("mcp server connections", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it("encrypts bearer credentials and rebuilds auth headers", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    await fixture.authHeadersFor(identity);
    const organizationId = globalThis.__testApiAuthContext!.organization.localOrganizationId;
    const userId = globalThis.__testApiAuthContext!.user.localUserId;

    const created = await createMcpServerConnection({
      organizationId,
      userId,
      displayName: "Docs MCP",
      serverUrl: "https://mcp.example.com/v1",
      transport: "http",
      authKind: "bearer",
      bearerToken: "secret-token-xyz9",
    });

    expect(isOk(created)).toBe(true);
    if (!isOk(created)) {
      return;
    }

    expect(created.value.serverUrl).toBe("https://mcp.example.com/v1");
    expect(created.value.maskedTokenSuffix).toContain("xyz9");

    const loaded = await loadMcpServerConnectionWithSecret({
      organizationId,
      connectionId: created.value.id,
    });
    expect(isOk(loaded)).toBe(true);
    if (!isOk(loaded)) {
      return;
    }

    expect(loaded.value.secret.bearerToken).toBe("secret-token-xyz9");
    expect(
      buildMcpServerAuthHeaders({
        authKind: "bearer",
        secret: loaded.value.secret,
      }),
    ).toEqual({
      Authorization: "Bearer secret-token-xyz9",
    });

    await expect(
      deleteMcpServerConnection({
        organizationId,
        connectionId: created.value.id,
      }),
    ).resolves.toBe(true);
  });

  it("rejects private host MCP server URLs", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    await fixture.authHeadersFor(identity);
    const organizationId = globalThis.__testApiAuthContext!.organization.localOrganizationId;
    const userId = globalThis.__testApiAuthContext!.user.localUserId;

    const created = await createMcpServerConnection({
      organizationId,
      userId,
      displayName: "Local MCP",
      serverUrl: "http://localhost:3000/mcp",
      transport: "http",
      authKind: "none",
    });

    expect(isErr(created)).toBe(true);
    if (!isErr(created)) {
      return;
    }
    expect(created.error.code).toBe("mcp_server_url_invalid");
  });
});
