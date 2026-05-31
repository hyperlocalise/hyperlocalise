import "dotenv/config";

import { createHash } from "node:crypto";

import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { createAuthorizationCode } from "@/api/auth/mcp";
import { createApp } from "@/api/app";
import { db, schema } from "@/lib/database";
import { testClient } from "hono/testing";

import { createProjectTestFixture } from "../project/project.fixture";
import type { ProjectResponse } from "../project/project.schema";
import { createTeamTestFixture } from "../team/team.fixture";
import type { TeamResponse } from "../team/team.schema";

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

const app = createApp();
const client = testClient(app);
const projectFixture = createProjectTestFixture(client);
const teamFixture = createTeamTestFixture(client);

function pkceChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

async function mcpAccessTokenForMember(
  memberAuth: NonNullable<typeof globalThis.__testApiAuthContext>,
) {
  const verifier = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~";
  const code = createAuthorizationCode({
    clientId: "test-client",
    redirectUri: "http://localhost:8787/callback",
    codeChallenge: pkceChallenge(verifier),
    codeChallengeMethod: "S256",
    scope: "mcp",
    userId: memberAuth.user.localUserId,
    organizationId: memberAuth.organization.localOrganizationId,
  });

  const response = await app.request("http://localhost/api/mcp/token", {
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
  const response = await app.request("http://localhost/api/mcp/message", {
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

  return response;
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

afterEach(async () => {
  vi.clearAllMocks();
  await projectFixture.cleanup();
  await db.delete(schema.usedAuthorizationCodes);
});

describe("MCP team-scoped access", () => {
  it("scopes list_projects and get_project to the member's teams", async () => {
    const admin = projectFixture.createWorkosIdentityWithRole("admin");
    const member = projectFixture.createWorkosIdentityForOrganization(admin.organization, "member");

    await projectFixture.authHeadersFor(admin);
    await projectFixture.authHeadersFor(member);
    const memberAuth = globalThis.__testApiAuthContext;
    if (!memberAuth) {
      throw new Error("expected member auth context");
    }

    const teamAlphaResponse = await teamFixture.createTeamViaApi(admin, { name: "MCP Alpha" });
    const teamAlphaBody = (await teamAlphaResponse.json()) as TeamResponse;
    const teamBetaResponse = await teamFixture.createTeamViaApi(admin, { name: "MCP Beta" });
    const teamBetaBody = (await teamBetaResponse.json()) as TeamResponse;

    await db.insert(schema.teamMemberships).values({
      teamId: teamAlphaBody.team.id,
      userId: await projectFixture.getLocalUserId(member.user.workosUserId),
      role: "member",
    });

    const alphaProjectResponse = await client.api.orgs[":organizationSlug"].projects.$post(
      {
        param: { organizationSlug: admin.organization.slug ?? "missing-slug" },
        json: {
          name: "MCP Alpha Project",
          teamId: teamAlphaBody.team.id,
          sourceLocale: "en-US",
          targetLocales: ["fr-FR"],
        },
      },
      { headers: await projectFixture.authHeadersFor(admin) },
    );
    expect(alphaProjectResponse.status).toBe(201);
    const alphaProjectBody = (await alphaProjectResponse.json()) as ProjectResponse;

    const betaProjectResponse = await client.api.orgs[":organizationSlug"].projects.$post(
      {
        param: { organizationSlug: admin.organization.slug ?? "missing-slug" },
        json: {
          name: "MCP Beta Project",
          teamId: teamBetaBody.team.id,
          sourceLocale: "en-US",
          targetLocales: ["de-DE"],
        },
      },
      { headers: await projectFixture.authHeadersFor(admin) },
    );
    expect(betaProjectResponse.status).toBe(201);
    const betaProjectBody = (await betaProjectResponse.json()) as ProjectResponse;

    const accessToken = await mcpAccessTokenForMember(memberAuth);

    const listResponse = await callMcpTool(accessToken, "list_projects", { limit: 50 });
    expect(listResponse.status).toBe(200);
    const listBody = parseToolResultText(await listResponse.json()) as {
      projects: Array<{ id: string }>;
    };
    expect(listBody.projects.map((project) => project.id)).toEqual([alphaProjectBody.project.id]);

    const getDeniedResponse = await callMcpTool(accessToken, "get_project", {
      projectId: betaProjectBody.project.id,
    });
    expect(getDeniedResponse.status).toBe(200);
    const getDeniedBody = parseToolResultText(await getDeniedResponse.json()) as {
      project: { id: string } | null;
    };
    expect(getDeniedBody.project).toBeNull();
  });
});
