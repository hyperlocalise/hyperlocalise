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

import { createHash } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";
import { createMcpTestApp } from "@/api/routes/mcp/mcp.fixture";
import { createAuthorizationCode } from "@/api/auth/mcp";
import { createApp } from "@/api/app";
import type { AppType } from "@/api/typed-app";
import { db, schema } from "@/lib/database/client";
import { ensureRepositorySourceFileVersionForStoredFile } from "@/lib/file-storage/records";
import { testClient } from "hono/testing";

import { insertStoredSourceFile } from "../public-jobs/public-jobs.fixture";
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

const apiApp = createApp();
const mcpApp = createMcpTestApp();
const client = testClient<AppType>(apiApp);
const projectFixture = createProjectTestFixture(client);
const teamFixture = createTeamTestFixture(client);

let trackedMemberLocalUserId: string | null = null;

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
  const response = await mcpApp.request("http://localhost/mcp/message", {
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

  if (trackedMemberLocalUserId) {
    await db
      .delete(schema.teamMemberships)
      .where(eq(schema.teamMemberships.userId, trackedMemberLocalUserId));
    await db
      .delete(schema.mcpSessions)
      .where(eq(schema.mcpSessions.userId, trackedMemberLocalUserId));
    trackedMemberLocalUserId = null;
  }

  await projectFixture.cleanup();
  await db.delete(schema.usedAuthorizationCodes);
});

describe("MCP team-scoped access", () => {
  it("scopes projects and issues to the member's teams", async () => {
    const admin = projectFixture.createWorkosIdentityWithRole("admin");
    const member = projectFixture.createWorkosIdentityForOrganization(admin.organization, "member");

    await projectFixture.authHeadersFor(admin);

    const adminAuth = globalThis.__testApiAuthContext;
    if (!adminAuth) {
      throw new Error("expected admin auth context");
    }

    await projectFixture.authHeadersFor(member);
    const memberAuth = globalThis.__testApiAuthContext;
    if (!memberAuth) {
      throw new Error("expected member auth context");
    }

    const teamAlphaResponse = await teamFixture.createTeamViaApi(admin, { name: "MCP Alpha" });
    const teamAlphaBody = (await teamAlphaResponse.json()) as TeamResponse;
    const teamBetaResponse = await teamFixture.createTeamViaApi(admin, { name: "MCP Beta" });
    const teamBetaBody = (await teamBetaResponse.json()) as TeamResponse;

    trackedMemberLocalUserId = await projectFixture.getLocalUserId(member.user.workosUserId);
    await db.insert(schema.teamMemberships).values({
      teamId: teamAlphaBody.team.id,
      userId: trackedMemberLocalUserId,
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

    const [alphaIssue, betaIssue] = await db
      .insert(schema.issueSheetIssues)
      .values([
        {
          organizationId: memberAuth.organization.localOrganizationId,
          projectId: alphaProjectBody.project.id,
          number: 1,
          identifier: "ALPHA-1",
          title: "Accessible team issue",
          issueType: "qa_failure",
          status: "open",
        },
        {
          organizationId: memberAuth.organization.localOrganizationId,
          projectId: betaProjectBody.project.id,
          number: 1,
          identifier: "BETA-1",
          title: "Inaccessible team issue",
          issueType: "qa_failure",
          status: "open",
        },
      ])
      .returning({
        id: schema.issueSheetIssues.id,
      });

    if (!alphaIssue || !betaIssue) {
      throw new Error("expected issue fixtures");
    }

    const { organization: externalOrganization, project: externalProject } =
      await projectFixture.createStoredProjectFixture();

    const [externalIssue] = await db
      .insert(schema.issueSheetIssues)
      .values({
        organizationId: externalOrganization.id,
        projectId: externalProject.id,
        number: 1,
        identifier: "EXTERNAL-1",
        title: "External organization issue",
        issueType: "qa_failure",
        status: "open",
      })
      .returning({
        id: schema.issueSheetIssues.id,
      });

    if (!externalIssue) {
      throw new Error("expected external issue fixture");
    }

    const seedProjectFile = async (input: {
      organizationId: string;
      projectId: string;
      sourcePath: string;
    }) => {
      const storedFile = await insertStoredSourceFile({
        organizationId: input.organizationId,
        projectId: input.projectId,
        filename: input.sourcePath.split("/").at(-1),
        contentType: "application/json",
        sourceKind: "repository_file",
        metadata: { sourcePath: input.sourcePath, sourceHash: `hash-${input.sourcePath}` },
      });
      const version = await ensureRepositorySourceFileVersionForStoredFile({
        db,
        fileId: storedFile.id,
        organizationId: input.organizationId,
        projectId: input.projectId,
      });
      if (!version) {
        throw new Error(`expected repository source file version for ${input.sourcePath}`);
      }
      return storedFile;
    };

    const alphaFile = await seedProjectFile({
      organizationId: memberAuth.organization.localOrganizationId,
      projectId: alphaProjectBody.project.id,
      sourcePath: "locales/alpha.json",
    });
    await seedProjectFile({
      organizationId: memberAuth.organization.localOrganizationId,
      projectId: betaProjectBody.project.id,
      sourcePath: "locales/beta.json",
    });
    await seedProjectFile({
      organizationId: externalOrganization.id,
      projectId: externalProject.id,
      sourcePath: "locales/external.json",
    });

    const accessToken = await mcpAccessTokenForAuth(memberAuth);

    const adminAccessToken = await mcpAccessTokenForAuth(adminAuth);

    const adminIssuesResponse = await callMcpTool(adminAccessToken, "list_issues", {
      status: "open",
      limit: 50,
      offset: 0,
    });

    expect(adminIssuesResponse.status).toBe(200);

    const adminIssuesBody = parseToolResultText(await adminIssuesResponse.json()) as {
      total: number;
      issues: Array<{
        id: string;
      }>;
    };

    expect(adminIssuesBody.issues.map((issue) => issue.id)).not.toContain(externalIssue.id);
    expect(adminIssuesBody.total).toBe(2);
    expect(adminIssuesBody.issues.map((issue) => issue.id).sort()).toEqual(
      [alphaIssue.id, betaIssue.id].sort(),
    );

    const listResponse = await callMcpTool(accessToken, "list_projects", { limit: 50 });
    expect(listResponse.status).toBe(200);
    const listBody = parseToolResultText(await listResponse.json()) as {
      projects: Array<{ id: string }>;
    };
    expect(listBody.projects.map((project) => project.id)).toEqual([alphaProjectBody.project.id]);

    const getDeniedResponse = await callMcpTool(accessToken, "get_project", {
      projectId: betaProjectBody.project.id,
    });

    const issuesResponse = await callMcpTool(accessToken, "list_issues", {
      status: "open",
      limit: 50,
      offset: 0,
    });

    expect(issuesResponse.status).toBe(200);

    const issuesBody = parseToolResultText(await issuesResponse.json()) as {
      total: number;
      issues: Array<{
        id: string;
        projectId: string;
        title: string;
      }>;
    };

    expect(issuesBody.issues.map((issue) => issue.id)).not.toContain(externalIssue.id);
    expect(issuesBody.total).toBe(1);
    expect(issuesBody.issues).toEqual([
      expect.objectContaining({
        id: alphaIssue.id,
        projectId: alphaProjectBody.project.id,
        title: "Accessible team issue",
      }),
    ]);
    expect(issuesBody.issues.map((issue) => issue.id)).not.toContain(betaIssue.id);

    const accessibleIssueResponse = await callMcpTool(accessToken, "get_issue", {
      projectId: alphaProjectBody.project.id,
      issueId: alphaIssue.id,
    });

    expect(accessibleIssueResponse.status).toBe(200);

    const accessibleIssueResponseBody = await accessibleIssueResponse.json();

    expect(parseToolResultText(accessibleIssueResponseBody)).toMatchObject({
      issue: {
        id: alphaIssue.id,
        title: "Accessible team issue",
      },
    });

    const inaccessibleLookups = [
      {
        label: "missing issue",
        projectId: alphaProjectBody.project.id,
        issueId: "00000000-0000-4000-8000-000000000999",
      },
      {
        label: "wrong project",
        projectId: alphaProjectBody.project.id,
        issueId: betaIssue.id,
      },
      {
        label: "wrong team",
        projectId: betaProjectBody.project.id,
        issueId: betaIssue.id,
      },
      {
        label: "wrong organization",
        projectId: externalProject.id,
        issueId: externalIssue.id,
      },
    ];

    for (const lookup of inaccessibleLookups) {
      const response = await callMcpTool(accessToken, "get_issue", {
        projectId: lookup.projectId,
        issueId: lookup.issueId,
      });

      expect(response.status, lookup.label).toBe(200);

      const responseBody = await response.json();

      expect(
        (responseBody as { result?: { isError?: boolean } }).result?.isError,
        lookup.label,
      ).toBe(true);

      expect(parseToolResultText(responseBody), lookup.label).toMatchObject({
        error: "issue_not_found",
      });
    }

    expect(getDeniedResponse.status).toBe(200);
    const getDeniedBody = parseToolResultText(await getDeniedResponse.json()) as {
      project: { id: string } | null;
    };
    expect(getDeniedBody.project).toBeNull();

    const accessibleFilesResponse = await callMcpTool(accessToken, "list_files", {
      projectId: alphaProjectBody.project.id,
    });
    expect(accessibleFilesResponse.status).toBe(200);
    expect(parseToolResultText(await accessibleFilesResponse.json())).toMatchObject({
      total: 1,
      files: [
        expect.objectContaining({
          id: alphaFile.id,
          sourcePath: "locales/alpha.json",
          filename: "alpha.json",
        }),
      ],
    });

    const inaccessibleFileLookups = [
      {
        label: "wrong team",
        projectId: betaProjectBody.project.id,
      },
      {
        label: "wrong organization",
        projectId: externalProject.id,
      },
    ];

    for (const lookup of inaccessibleFileLookups) {
      const response = await callMcpTool(accessToken, "list_files", {
        projectId: lookup.projectId,
      });

      expect(response.status, lookup.label).toBe(200);

      const responseBody = await response.json();

      expect(
        (responseBody as { result?: { isError?: boolean } }).result?.isError,
        lookup.label,
      ).toBe(true);

      expect(parseToolResultText(responseBody), lookup.label).toMatchObject({
        error: "project_not_found",
      });
    }

    const createDeniedResponse = await callMcpTool(accessToken, "create_issue", {
      projectId: alphaProjectBody.project.id,
      title: "Member must not create this issue",
      idempotencyKey: "member-denied",
    });

    expect(createDeniedResponse.status).toBe(200);

    const createDeniedBody = parseToolResultText(await createDeniedResponse.json()) as {
      error: string;
    };

    expect(createDeniedBody).toMatchObject({
      error: "forbidden",
    });

    const updateDeniedResponse = await callMcpTool(accessToken, "update_issue", {
      projectId: alphaProjectBody.project.id,
      issueId: alphaIssue.id,
      title: "Member must not update this issue",
    });

    expect(updateDeniedResponse.status).toBe(200);

    const updateDeniedBody = await updateDeniedResponse.json();

    expect((updateDeniedBody as { result?: { isError?: boolean } }).result?.isError).toBe(true);

    expect(parseToolResultText(updateDeniedBody)).toMatchObject({
      error: "forbidden",
    });

    const deniedIssues = await db
      .select({ id: schema.issueSheetIssues.id })
      .from(schema.issueSheetIssues)
      .where(
        and(
          eq(schema.issueSheetIssues.projectId, alphaProjectBody.project.id),
          eq(schema.issueSheetIssues.externalRef, "mcp:member-denied"),
        ),
      );

    expect(deniedIssues).toHaveLength(0);

    await db
      .update(schema.organizationMemberships)
      .set({ role: "translator" })
      .where(
        and(
          eq(
            schema.organizationMemberships.organizationId,
            memberAuth.organization.localOrganizationId,
          ),
          eq(schema.organizationMemberships.userId, memberAuth.user.localUserId),
        ),
      );

    const updateAllowedResponse = await callMcpTool(accessToken, "update_issue", {
      projectId: alphaProjectBody.project.id,
      issueId: alphaIssue.id,
      title: "Updated by Team Alpha translator",
    });

    expect(updateAllowedResponse.status).toBe(200);

    expect(parseToolResultText(await updateAllowedResponse.json())).toMatchObject({
      outcome: "updated",
      issue: {
        id: alphaIssue.id,
        title: "Updated by Team Alpha translator",
      },
    });

    const inaccessibleUpdates = [
      {
        label: "wrong team",
        projectId: betaProjectBody.project.id,
        issueId: betaIssue.id,
      },
      {
        label: "wrong organization",
        projectId: externalProject.id,
        issueId: externalIssue.id,
      },
    ];

    for (const update of inaccessibleUpdates) {
      const response = await callMcpTool(accessToken, "update_issue", {
        projectId: update.projectId,
        issueId: update.issueId,
        title: "Must not be updated",
      });

      expect(response.status, update.label).toBe(200);

      const responseBody = await response.json();

      expect(
        (responseBody as { result?: { isError?: boolean } }).result?.isError,
        update.label,
      ).toBe(true);

      expect(parseToolResultText(responseBody), update.label).toMatchObject({
        error: "issue_not_found",
      });
    }

    const createAllowedResponse = await callMcpTool(accessToken, "create_issue", {
      projectId: alphaProjectBody.project.id,
      title: "Translator can create in Team Alpha",
      idempotencyKey: "translator-alpha",
    });

    expect(createAllowedResponse.status).toBe(200);

    const createAllowedBody = parseToolResultText(await createAllowedResponse.json()) as {
      id: string;
      projectId: string;
    };

    expect(createAllowedBody).toMatchObject({
      projectId: alphaProjectBody.project.id,
    });

    const crossTeamResponse = await callMcpTool(accessToken, "create_issue", {
      projectId: betaProjectBody.project.id,
      title: "Must not create in Team Beta",
      idempotencyKey: "translator-beta",
    });

    expect(crossTeamResponse.status).toBe(200);

    expect(parseToolResultText(await crossTeamResponse.json())).toMatchObject({
      error: "project_not_found",
    });

    const crossOrganizationResponse = await callMcpTool(accessToken, "create_issue", {
      projectId: externalProject.id,
      title: "Must not create in another organization",
      idempotencyKey: "translator-external",
    });

    expect(crossOrganizationResponse.status).toBe(200);

    expect(parseToolResultText(await crossOrganizationResponse.json())).toMatchObject({
      error: "project_not_found",
    });

    const createdMcpIssues = await db
      .select({
        projectId: schema.issueSheetIssues.projectId,
        externalRef: schema.issueSheetIssues.externalRef,
      })
      .from(schema.issueSheetIssues)
      .where(
        and(
          eq(schema.issueSheetIssues.organizationId, memberAuth.organization.localOrganizationId),
          inArray(schema.issueSheetIssues.externalRef, [
            "mcp:translator-alpha",
            "mcp:translator-beta",
            "mcp:translator-external",
          ]),
        ),
      );

    expect(createdMcpIssues).toEqual([
      {
        projectId: alphaProjectBody.project.id,
        externalRef: "mcp:translator-alpha",
      },
    ]);
  });
});
