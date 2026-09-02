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

import { generateMcpToken, hashMcpToken } from "@/api/auth/mcp";
import { createApp } from "@/api/app";
import { createMcpTestApp } from "@/api/routes/mcp/mcp.fixture";
import { insertStoredSourceFile } from "@/api/routes/public-jobs/public-jobs.fixture";
import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import type { AppType } from "@/api/typed-app";
import { db, schema } from "@/lib/database/client";
import { ensureRepositorySourceFileVersionForStoredFile } from "@/lib/file-storage/records";

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
const apiApp = createApp();
const apiClient = testClient<AppType>(apiApp);
const fixture = createProjectTestFixture();

type McpFileRow = {
  id: string;
  sourcePath: string;
  filename: string;
  contentType: string | null;
  byteSize: number | null;
  updatedAt: string;
  sourceLocale: string | null;
};

type McpListFilesOutput = {
  error?: string;
  total?: number;
  pagination?: {
    limit: number;
    offset: number;
    hasMore: boolean;
    nextOffset: number | null;
  };
  files?: McpFileRow[];
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

async function callMcpTool(headers: Record<string, string>, args: Record<string, unknown>) {
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
        name: "list_files",
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
    output: JSON.parse(text!) as McpListFilesOutput,
  };
}

async function seedNativeSourceFile(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  contentType?: string;
}) {
  const filename = input.sourcePath.split("/").at(-1) ?? input.sourcePath;
  const storedFile = await insertStoredSourceFile({
    organizationId: input.organizationId,
    projectId: input.projectId,
    filename,
    contentType: input.contentType ?? "application/json",
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
}

describe("MCP list_files", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it("advertises list_files with bounded pagination and search", async () => {
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

    const tool = body.result?.tools?.find(({ name }) => name === "list_files");

    expect(tool).toBeDefined();
    expect(tool?.description).toContain("source files");
    expect(tool?.inputSchema?.required).toEqual(["projectId"]);
    expect(tool?.inputSchema?.properties).toMatchObject({
      projectId: {
        type: "string",
        minLength: 1,
        maxLength: 128,
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
      search: {
        type: "string",
        maxLength: 256,
      },
    });
  });

  it("lists native project files that match the Files UI and paginates stably", async () => {
    const stored = await fixture.createStoredProjectFixture();
    const headers = await authenticatedMcpHeaders(stored.identity);
    const sourcePaths = ["locales/aaa.json", "locales/bbb.json", "locales/zzz-late.json"];

    const seeded = [];
    for (const sourcePath of sourcePaths) {
      seeded.push(
        await seedNativeSourceFile({
          organizationId: stored.organization.id,
          projectId: stored.project.id,
          sourcePath,
        }),
      );
    }

    const filesUiResponse = await apiClient.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.$get(
      {
        param: {
          organizationSlug: stored.identity.organization.slug ?? "missing-slug",
          projectId: stored.project.id,
        },
        query: {
          origin: "repository",
        },
      },
      { headers: await fixture.authHeadersFor(stored.identity) },
    );

    expect(filesUiResponse.status).toBe(200);
    const filesUiBody = (await filesUiResponse.json()) as {
      files: Array<{ sourcePath: string; filename: string; storedFileId: string | null }>;
    };

    const firstPage = await readToolResult(
      await callMcpTool(headers, {
        projectId: stored.project.id,
        limit: 2,
        offset: 0,
      }),
    );
    const secondPage = await readToolResult(
      await callMcpTool(headers, {
        projectId: stored.project.id,
        limit: 2,
        offset: 2,
      }),
    );

    expect(firstPage.isError).toBe(false);
    expect(secondPage.isError).toBe(false);

    expect(firstPage.output).toMatchObject({
      total: 3,
      pagination: {
        limit: 2,
        offset: 0,
        hasMore: true,
        nextOffset: 2,
      },
    });
    expect(secondPage.output).toMatchObject({
      total: 3,
      pagination: {
        limit: 2,
        offset: 2,
        hasMore: false,
        nextOffset: null,
      },
    });

    const mcpFiles = [...(firstPage.output.files ?? []), ...(secondPage.output.files ?? [])];
    expect(mcpFiles.map((file) => file.sourcePath)).toEqual(
      filesUiBody.files.map((file) => file.sourcePath),
    );
    expect(mcpFiles.map((file) => file.sourcePath)).toEqual(sourcePaths);
    expect(mcpFiles.map((file) => file.id)).toEqual(seeded.map((file) => file.id));
    expect(mcpFiles[0]).toMatchObject({
      filename: "aaa.json",
      contentType: "application/json",
      byteSize: 2,
      sourceLocale: "en-US",
    });
    expect(mcpFiles[0]?.updatedAt).toEqual(expect.any(String));
  });

  it("filters files by path or filename search", async () => {
    const stored = await fixture.createStoredProjectFixture();
    const headers = await authenticatedMcpHeaders(stored.identity);

    await seedNativeSourceFile({
      organizationId: stored.organization.id,
      projectId: stored.project.id,
      sourcePath: "locales/home.json",
    });
    await seedNativeSourceFile({
      organizationId: stored.organization.id,
      projectId: stored.project.id,
      sourcePath: "locales/checkout.json",
    });

    const byPath = await readToolResult(
      await callMcpTool(headers, {
        projectId: stored.project.id,
        search: "locales/home",
      }),
    );
    const byFilename = await readToolResult(
      await callMcpTool(headers, {
        projectId: stored.project.id,
        search: "checkout.json",
      }),
    );

    expect(byPath.output.files?.map((file) => file.sourcePath)).toEqual(["locales/home.json"]);
    expect(byFilename.output.files?.map((file) => file.sourcePath)).toEqual([
      "locales/checkout.json",
    ]);
  });

  it("returns project_not_found for inaccessible projects", async () => {
    const stored = await fixture.createStoredProjectFixture();
    const external = await fixture.createStoredProjectFixture();
    const headers = await authenticatedMcpHeaders(stored.identity);

    await seedNativeSourceFile({
      organizationId: external.organization.id,
      projectId: external.project.id,
      sourcePath: "locales/secret.json",
    });

    const missing = await readToolResult(
      await callMcpTool(headers, {
        projectId: "project_does_not_exist",
      }),
    );
    const otherOrg = await readToolResult(
      await callMcpTool(headers, {
        projectId: external.project.id,
      }),
    );

    expect(missing.isError).toBe(true);
    expect(missing.output).toMatchObject({
      error: "project_not_found",
    });
    expect(otherOrg.isError).toBe(true);
    expect(otherOrg.output).toMatchObject({
      error: "project_not_found",
    });
  });

  it.each([
    ["an over-limit page size", { limit: 51 }],
    ["a zero page size", { limit: 0 }],
    ["a negative offset", { offset: -1 }],
    ["an overlong search", { search: "x".repeat(257) }],
  ])("rejects %s", async (_label, args) => {
    const stored = await fixture.createStoredProjectFixture();
    const headers = await authenticatedMcpHeaders(stored.identity);

    const result = await readToolResult(
      await callMcpTool(headers, {
        projectId: stored.project.id,
        ...args,
      }),
    );

    expect(result.isError).toBe(true);
  });
});
