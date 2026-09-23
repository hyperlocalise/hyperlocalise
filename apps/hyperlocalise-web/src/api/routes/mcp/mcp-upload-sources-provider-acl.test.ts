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

import { createHash, randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createMcpTestApp } from "@/api/routes/mcp/mcp.fixture";
import { createAuthorizationCode } from "@/api/auth/mcp";
import { createApp } from "@/api/app";
import type { AppType } from "@/api/typed-app";
import { db, schema } from "@/lib/database/client";
import { uniqueTestProjectIdentifier } from "@/lib/projects/issue-identifier/test-project-identifier";
import { testClient } from "hono/testing";

import { createProjectTestFixture } from "../project/project.fixture";
import { createTeamTestFixture } from "@/lib/teams/team.fixture";
import type { TeamResponse } from "@/lib/teams/team.schema";

const {
  resolveApiAuthContextFromSessionMock,
  getTmsProviderConnectionMock,
  getTmsProviderLiveProjectMock,
} = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(
    (options) =>
      globalThis.__resolveTestApiAuthContextFromSession?.(options) ??
      globalThis.__testApiAuthContext ??
      null,
  ),
  getTmsProviderConnectionMock: vi.fn(),
  getTmsProviderLiveProjectMock: vi.fn(),
}));

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
  };
});

vi.mock("@/lib/providers/jobs/tms-provider-live", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/providers/jobs/tms-provider-live")>();
  return {
    ...actual,
    getTmsProviderConnection: (...args: unknown[]) => getTmsProviderConnectionMock(...args),
    getTmsProviderLiveProject: (...args: unknown[]) => getTmsProviderLiveProjectMock(...args),
  };
});

const apiApp = createApp();
const mcpApp = createMcpTestApp();
const client = testClient<AppType>(apiApp);
const projectFixture = createProjectTestFixture(client);
const teamFixture = createTeamTestFixture();

let trackedMemberLocalUserId: string | null = null;
const PROVIDER_PROJECT_ID = `ext:crowdin:mcp-upload-acl-${randomUUID().slice(0, 8)}`;

function pkceChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

async function mcpAccessTokenForAuth(auth: NonNullable<typeof globalThis.__testApiAuthContext>) {
  const verifier = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~";
  const code = createAuthorizationCode({
    clientId: "test-client",
    redirectUri: "http://localhost:8787/callback",
    codeChallenge: pkceChallenge(verifier),
    codeChallengeMethod: "S256",
    scope: "mcp",
    userId: auth.user.localUserId,
    organizationId: auth.organization.localOrganizationId,
  });

  const response = await mcpApp.request("http://localhost/mcp/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: "test-client",
      redirect_uri: "http://localhost:8787/callback",
      code_verifier: verifier,
    }),
  });

  expect(response.status).toBe(200);
  const body = (await response.json()) as { access_token: string };
  return body.access_token;
}

async function callMcpTool(accessToken: string, name: string, args: Record<string, unknown> = {}) {
  return mcpApp.request("http://localhost/mcp/message", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
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

function parseToolResultText(responseBody: unknown): unknown {
  const result = responseBody as {
    result?: { content?: Array<{ type: string; text?: string }> };
  };
  const text = result.result?.content?.[0]?.text;
  if (!text) {
    return null;
  }

  return JSON.parse(text);
}

beforeAll(async () => {
  await db.$client.query("select 1");
});

beforeEach(() => {
  getTmsProviderConnectionMock.mockResolvedValue({
    providerKind: "crowdin",
    displayName: "Crowdin",
    validationStatus: "valid",
    validationMessage: null,
  });
  getTmsProviderLiveProjectMock.mockResolvedValue(null);
});

afterEach(async () => {
  vi.clearAllMocks();

  if (trackedMemberLocalUserId) {
    await db
      .delete(schema.teamMemberships)
      .where(eq(schema.teamMemberships.userId, trackedMemberLocalUserId));
    await db
      .delete(schema.mcpSessions)
      .where(eq(schema.mcpSessions.userId, trackedMemberLocalUserId));
    trackedMemberLocalUserId = null;
  }

  await db.delete(schema.projects).where(eq(schema.projects.id, PROVIDER_PROJECT_ID));
  await projectFixture.cleanup();
  await db.delete(schema.usedAuthorizationCodes);
});

describe("MCP upload_sources provider team ACL", () => {
  it("denies upload to a materialized ext: project on another team", async () => {
    const admin = projectFixture.createWorkosIdentityWithRole("admin");
    const translator = projectFixture.createWorkosIdentityForOrganization(
      admin.organization,
      "translator",
    );

    await projectFixture.authHeadersFor(admin);
    const adminAuth = globalThis.__testApiAuthContext;
    if (!adminAuth) {
      throw new Error("expected admin auth context");
    }

    await projectFixture.authHeadersFor(translator);
    const translatorAuth = globalThis.__testApiAuthContext;
    if (!translatorAuth) {
      throw new Error("expected translator auth context");
    }

    const teamAlphaResponse = await teamFixture.createTeamViaApi(admin, {
      name: "MCP Upload Alpha",
    });
    const teamAlphaBody = (await teamAlphaResponse.json()) as TeamResponse;
    const teamBetaResponse = await teamFixture.createTeamViaApi(admin, {
      name: "MCP Upload Beta",
    });
    const teamBetaBody = (await teamBetaResponse.json()) as TeamResponse;

    trackedMemberLocalUserId = await projectFixture.getLocalUserId(translator.user.workosUserId);
    await db.insert(schema.teamMemberships).values({
      teamId: teamBetaBody.team.id,
      userId: trackedMemberLocalUserId,
      role: "member",
    });

    await db.insert(schema.projects).values({
      id: PROVIDER_PROJECT_ID,
      identifier: uniqueTestProjectIdentifier(),
      organizationId: adminAuth.organization.localOrganizationId,
      teamId: teamAlphaBody.team.id,
      createdByUserId: adminAuth.user.localUserId,
      name: "Crowdin Private",
      description: "",
      translationContext: "",
      source: "external_tms",
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
    });

    const accessToken = await mcpAccessTokenForAuth(translatorAuth);
    const response = await callMcpTool(accessToken, "upload_sources", {
      projectId: PROVIDER_PROJECT_ID,
      sourcePath: "locales/en.json",
      content: JSON.stringify({ greeting: "Hello" }),
    });

    expect(response.status).toBe(200);
    const responseBody = await response.json();
    expect((responseBody as { result?: { isError?: boolean } }).result?.isError).toBe(true);
    expect(parseToolResultText(responseBody)).toMatchObject({
      error: "project_not_found",
    });

    const [saved] = await db
      .select({ id: schema.storedFiles.id })
      .from(schema.storedFiles)
      .where(eq(schema.storedFiles.projectId, PROVIDER_PROJECT_ID))
      .limit(1);
    expect(saved).toBeUndefined();
  });
});
