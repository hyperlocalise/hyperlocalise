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

import { randomUUID } from "node:crypto";

import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { generateMcpToken, hashMcpToken } from "@/api/auth/mcp";
import { createMcpTestApp } from "@/api/routes/mcp/mcp.fixture";
import { COMPACT_JOB_LAST_ERROR_MAX_LENGTH } from "@/api/routes/public-jobs/public-jobs.read";
import {
  insertCompletedPublicFileJob,
  insertPublicTranslationJob,
  insertRepositoryPublicFileJob,
} from "@/api/routes/public-jobs/public-jobs.fixture";
import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { db, schema } from "@/lib/database/client";
import { uniqueTestProjectIdentifier } from "@/lib/projects/issue-identifier/test-project-identifier";

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
const fixture = createProjectTestFixture();

type CompactMcpJob = {
  id: string;
  projectId: string | null;
  type: string | null;
  status: string;
  createdAt: string;
  completedAt: string | null;
  lastError: string | null;
};

type McpListJobsOutput = {
  error?: string;
  total?: number;
  pagination?: {
    limit: number;
    offset: number;
    hasMore: boolean;
    nextOffset: number | null;
  };
  jobs?: CompactMcpJob[];
};

async function authenticatedMcpHeaders(identity = fixture.createWorkosIdentity()) {
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

async function callMcpTool(headers: Record<string, string>, args: Record<string, unknown> = {}) {
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
        name: "list_jobs",
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
    output: JSON.parse(text!) as McpListJobsOutput,
  };
}

async function insertSecondProject(input: {
  organizationId: string;
  createdByUserId: string;
  teamId: string | null;
}) {
  const [project] = await db
    .insert(schema.projects)
    .values({
      id: `project_${randomUUID()}`,
      identifier: uniqueTestProjectIdentifier(),
      organizationId: input.organizationId,
      teamId: input.teamId,
      createdByUserId: input.createdByUserId,
      name: "Second project",
      description: "",
      translationContext: "",
      sourceLocale: "en-US",
      targetLocales: ["de-DE"],
    })
    .returning();

  if (!project) {
    throw new Error("expected second project");
  }

  return project;
}

describe("MCP list_jobs", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it("advertises list_jobs with bounded filters and pagination", async () => {
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
      result?: {
        tools?: Array<{
          name: string;
          description?: string;
          inputSchema?: {
            required?: string[];
            properties?: Record<string, unknown>;
          };
        }>;
      };
    };

    const tool = body.result?.tools?.find(({ name }) => name === "list_jobs");

    expect(tool).toBeDefined();
    expect(tool?.description).toContain("translation jobs");
    expect(tool?.inputSchema?.required).toBeUndefined();
    expect(tool?.inputSchema?.properties).toMatchObject({
      projectId: {
        type: "string",
        minLength: 1,
        maxLength: 128,
      },
      sourcePath: {
        type: "string",
        minLength: 1,
        maxLength: 2048,
      },
      status: {
        type: "string",
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 50,
        default: 20,
      },
      offset: {
        type: "integer",
        minimum: 0,
        default: 0,
      },
    });
  });

  it("lists accessible translation jobs without a projectId and hides other organizations", async () => {
    const stored = await fixture.createStoredProjectFixture();
    const secondProject = await insertSecondProject({
      organizationId: stored.organization.id,
      createdByUserId: stored.user.id,
      teamId: stored.project.teamId,
    });
    const external = await fixture.createStoredProjectFixture();
    const headers = await authenticatedMcpHeaders(stored.identity);

    const [visibleJob, otherProjectJob, hiddenJob] = await Promise.all([
      insertPublicTranslationJob({
        organizationId: stored.organization.id,
        projectId: stored.project.id,
        status: "queued",
      }),
      insertPublicTranslationJob({
        organizationId: stored.organization.id,
        projectId: secondProject.id,
        status: "running",
      }),
      insertPublicTranslationJob({
        organizationId: external.organization.id,
        projectId: external.project.id,
        status: "succeeded",
      }),
    ]);

    await db.insert(schema.jobs).values({
      id: `job_${randomUUID()}`,
      organizationId: stored.organization.id,
      projectId: stored.project.id,
      kind: "research",
      status: "succeeded",
      inputPayload: { query: "ignored" },
    });

    const result = await readToolResult(await callMcpTool(headers));

    expect(result.isError).toBe(false);
    expect(result.output.total).toBe(2);
    expect(result.output.jobs?.map((job) => job.id).sort()).toEqual(
      [visibleJob.id, otherProjectJob.id].sort(),
    );
    expect(result.output.jobs?.map((job) => job.id)).not.toContain(hiddenJob.id);
    expect(result.output.jobs?.every((job) => job.type === "string")).toBe(true);
    expect(result.output.jobs?.[0]).not.toHaveProperty("outputFiles");
    expect(result.output.jobs?.[0]).not.toHaveProperty("outcomePayload");
    expect(result.output.jobs?.[0]).not.toHaveProperty("inputPayload");
  });

  it("filters by projectId, status, and pagination", async () => {
    const stored = await fixture.createStoredProjectFixture();
    const secondProject = await insertSecondProject({
      organizationId: stored.organization.id,
      createdByUserId: stored.user.id,
      teamId: stored.project.teamId,
    });
    const headers = await authenticatedMcpHeaders(stored.identity);

    const queued = await insertPublicTranslationJob({
      organizationId: stored.organization.id,
      projectId: stored.project.id,
      status: "queued",
    });
    const succeeded = await insertPublicTranslationJob({
      organizationId: stored.organization.id,
      projectId: stored.project.id,
      status: "succeeded",
      completedAt: new Date("2026-03-01T12:00:00.000Z"),
    });
    await insertPublicTranslationJob({
      organizationId: stored.organization.id,
      projectId: secondProject.id,
      status: "failed",
      lastError: "other project",
    });

    const byProject = await readToolResult(
      await callMcpTool(headers, { projectId: stored.project.id }),
    );
    const byStatus = await readToolResult(
      await callMcpTool(headers, { projectId: stored.project.id, status: "queued" }),
    );
    const firstPage = await readToolResult(
      await callMcpTool(headers, { projectId: stored.project.id, limit: 1, offset: 0 }),
    );
    const secondPage = await readToolResult(
      await callMcpTool(headers, { projectId: stored.project.id, limit: 1, offset: 1 }),
    );

    expect(byProject.output.jobs?.map((job) => job.id).sort()).toEqual(
      [queued.id, succeeded.id].sort(),
    );
    expect(byStatus.output).toMatchObject({
      total: 1,
      jobs: [{ id: queued.id, status: "queued" }],
    });
    expect(firstPage.output).toMatchObject({
      total: 2,
      pagination: { limit: 1, offset: 0, hasMore: true, nextOffset: 1 },
    });
    expect(secondPage.output).toMatchObject({
      total: 2,
      pagination: { limit: 1, offset: 1, hasMore: false, nextOffset: null },
    });
    expect([
      ...(firstPage.output.jobs ?? []).map((job) => job.id),
      ...(secondPage.output.jobs ?? []).map((job) => job.id),
    ].sort()).toEqual([queued.id, succeeded.id].sort());
  });

  it("maps sourcePath to the latest succeeded file job for that path", async () => {
    const stored = await fixture.createStoredProjectFixture();
    const headers = await authenticatedMcpHeaders(stored.identity);

    const olderJob = await insertRepositoryPublicFileJob({
      organizationId: stored.organization.id,
      projectId: stored.project.id,
      sourcePath: "locales/en/source.xliff",
      sourceHash: "sha256:older",
      status: "succeeded",
      versionCreatedAt: new Date("2026-01-01T00:00:00.000Z"),
      jobCreatedAt: new Date("2026-01-01T00:01:00.000Z"),
      completedAt: new Date("2026-01-04T00:00:00.000Z"),
      outputFiles: [
        {
          fileId: "file_output_older_fr",
          locale: "fr-FR",
          filename: "source.older.fr-FR.xliff",
        },
      ],
    });
    const newerJob = await insertRepositoryPublicFileJob({
      organizationId: stored.organization.id,
      projectId: stored.project.id,
      sourcePath: "locales/en/source.xliff",
      sourceHash: "sha256:newer",
      status: "succeeded",
      versionCreatedAt: new Date("2026-01-02T00:00:00.000Z"),
      jobCreatedAt: new Date("2026-01-02T00:01:00.000Z"),
      completedAt: new Date("2026-01-03T00:00:00.000Z"),
      outputFiles: [
        {
          fileId: "file_output_newer_fr",
          locale: "fr-FR",
          filename: "source.newer.fr-FR.xliff",
        },
      ],
    });
    const queuedJob = await insertRepositoryPublicFileJob({
      organizationId: stored.organization.id,
      projectId: stored.project.id,
      sourcePath: "locales/en/source.xliff",
      sourceHash: "sha256:queued",
      status: "queued",
      versionCreatedAt: new Date("2026-01-03T00:00:00.000Z"),
      jobCreatedAt: new Date("2026-01-03T00:01:00.000Z"),
    });
    await insertRepositoryPublicFileJob({
      organizationId: stored.organization.id,
      projectId: stored.project.id,
      sourcePath: "locales/fr/other.xliff",
      sourceHash: "sha256:other",
      status: "succeeded",
      versionCreatedAt: new Date("2026-01-04T00:00:00.000Z"),
      jobCreatedAt: new Date("2026-01-04T00:01:00.000Z"),
      completedAt: new Date("2026-01-04T00:02:00.000Z"),
      outputFiles: [
        {
          fileId: "file_output_other_fr",
          locale: "fr-FR",
          filename: "other.fr-FR.xliff",
        },
      ],
    });

    const latestForPath = await readToolResult(
      await callMcpTool(headers, {
        projectId: stored.project.id,
        sourcePath: "./locales/en/source.xliff",
      }),
    );
    const queuedForPath = await readToolResult(
      await callMcpTool(headers, {
        projectId: stored.project.id,
        sourcePath: "locales/en/source.xliff",
        status: "queued",
      }),
    );

    expect(latestForPath.isError).toBe(false);
    expect(latestForPath.output.jobs?.map((job) => job.id)).toEqual([newerJob.id, olderJob.id]);
    expect(latestForPath.output.jobs?.[0]).toMatchObject({
      id: newerJob.id,
      type: "file",
      status: "succeeded",
    });
    expect(latestForPath.output.jobs?.[0]).not.toHaveProperty("outputFiles");
    expect(queuedForPath.output.jobs?.map((job) => job.id)).toEqual([queuedJob.id]);
  });

  it("truncates lastError and omits output file bodies", async () => {
    const stored = await fixture.createStoredProjectFixture();
    const headers = await authenticatedMcpHeaders(stored.identity);
    const lastError = "x".repeat(COMPACT_JOB_LAST_ERROR_MAX_LENGTH + 40);

    const failed = await insertPublicTranslationJob({
      organizationId: stored.organization.id,
      projectId: stored.project.id,
      status: "failed",
      lastError,
    });
    await insertCompletedPublicFileJob({
      organizationId: stored.organization.id,
      projectId: stored.project.id,
      outputFiles: [
        {
          fileId: "file_output_fr",
          locale: "fr-FR",
          filename: "source.fr-FR.xliff",
        },
      ],
    });

    const result = await readToolResult(
      await callMcpTool(headers, { projectId: stored.project.id, status: "failed" }),
    );

    expect(result.output.jobs).toEqual([
      {
        id: failed.id,
        projectId: stored.project.id,
        type: "string",
        status: "failed",
        createdAt: expect.any(String),
        completedAt: null,
        lastError: "x".repeat(COMPACT_JOB_LAST_ERROR_MAX_LENGTH),
      },
    ]);
  });

  it("returns project_not_found for inaccessible projects", async () => {
    const stored = await fixture.createStoredProjectFixture();
    const external = await fixture.createStoredProjectFixture();
    const headers = await authenticatedMcpHeaders(stored.identity);

    await insertPublicTranslationJob({
      organizationId: external.organization.id,
      projectId: external.project.id,
      status: "succeeded",
    });

    const missing = await readToolResult(
      await callMcpTool(headers, { projectId: "project_does_not_exist" }),
    );
    const otherOrg = await readToolResult(
      await callMcpTool(headers, { projectId: external.project.id }),
    );

    expect(missing.isError).toBe(true);
    expect(missing.output).toMatchObject({ error: "project_not_found" });
    expect(otherOrg.isError).toBe(true);
    expect(otherOrg.output).toMatchObject({ error: "project_not_found" });
  });

  it.each([
    ["an over-limit page size", { limit: 51 }],
    ["a zero page size", { limit: 0 }],
    ["a negative offset", { offset: -1 }],
    ["an unknown status", { status: "not-a-status" }],
  ])("rejects %s", async (_label, args) => {
    const stored = await fixture.createStoredProjectFixture();
    const headers = await authenticatedMcpHeaders(stored.identity);

    const response = await callMcpTool(headers, {
      projectId: stored.project.id,
      ...args,
    });

    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      result?: {
        isError?: boolean;
        content?: Array<{ type: string; text?: string }>;
      };
    };

    expect(body.result?.isError).toBe(true);
    expect(body.result?.content?.[0]?.text).toBeDefined();
  });
});
