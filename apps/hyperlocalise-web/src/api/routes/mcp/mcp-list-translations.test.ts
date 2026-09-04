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
import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { db, schema } from "@/lib/database/client";
import { ensureRepositorySourceFile } from "@/lib/file-storage/records";
import {
  setProjectTranslationKeysHidden,
  upsertProjectTranslationKeysFromEntries,
} from "@/lib/projects/translations/project-translation-service";

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

type McpTranslationRow = {
  id: string;
  key: string;
  sourcePath: string;
  sourceText: string;
  targetLocale: string | null;
  targetText: string | null;
  status: string | null;
  maxLength: number | null;
  isHidden: boolean;
};

type McpListTranslationsOutput = {
  error?: string;
  total?: number;
  coverageSource?: string;
  pagination?: {
    limit: number;
    offset: number;
    hasMore: boolean;
    nextOffset: number | null;
  };
  translations?: McpTranslationRow[];
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
        name: "list_translations",
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
    output: JSON.parse(text!) as McpListTranslationsOutput,
  };
}

async function seedFileKeys(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  entries: Array<{ key: string; text: string; maxLength?: number }>;
}) {
  const sourceFile = await ensureRepositorySourceFile({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePath: input.sourcePath,
  });

  await upsertProjectTranslationKeysFromEntries({
    organizationId: input.organizationId,
    projectId: input.projectId,
    repositorySourceFileId: sourceFile.id,
    entries: input.entries.map((entry) => ({
      key: entry.key,
      text: entry.text,
      context: null,
      maxLength: entry.maxLength,
    })),
  });

  const keys = await db
    .select({
      id: schema.projectTranslationKeys.id,
      key: schema.projectTranslationKeys.key,
      maxLength: schema.projectTranslationKeys.maxLength,
      isHidden: schema.projectTranslationKeys.isHidden,
    })
    .from(schema.projectTranslationKeys)
    .where(eq(schema.projectTranslationKeys.repositorySourceFileId, sourceFile.id));

  return { sourceFile, keys };
}

async function insertTranslation(input: {
  organizationId: string;
  projectId: string;
  translationKeyId: string;
  targetLocale: string;
  text: string;
  status: "draft" | "needs_review" | "approved" | "rejected";
}) {
  await db.insert(schema.projectTranslations).values(input);
}

describe("MCP list_translations", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it("advertises list_translations with CAT filters and pagination", async () => {
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

    const tool = body.result?.tools?.find(({ name }) => name === "list_translations");

    expect(tool).toBeDefined();
    expect(tool?.description).toContain("native key overlay");
    expect(tool?.inputSchema?.required).toEqual(["projectId"]);
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
      targetLocale: {
        type: "string",
        minLength: 1,
        maxLength: 32,
      },
      search: {
        type: "string",
        maxLength: 256,
      },
      queueFilter: {
        type: "string",
      },
      queueSort: {
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

  it("returns an empty page for a project with no keys", async () => {
    const stored = await fixture.createStoredProjectFixture();
    const headers = await authenticatedMcpHeaders(stored.identity);

    const result = await readToolResult(
      await callMcpTool(headers, {
        projectId: stored.project.id,
      }),
    );

    expect(result.isError).toBe(false);
    expect(result.output).toMatchObject({
      total: 0,
      coverageSource: "native_overlay",
      pagination: {
        limit: 20,
        offset: 0,
        hasMore: false,
        nextOffset: null,
      },
      translations: [],
    });
  });

  it("filters untranslated keys and matches CAT search on key, source, and target text", async () => {
    const stored = await fixture.createStoredProjectFixture();
    const headers = await authenticatedMcpHeaders(stored.identity);
    const { keys } = await seedFileKeys({
      organizationId: stored.organization.id,
      projectId: stored.project.id,
      sourcePath: "locales/home.json",
      entries: [
        { key: "hello", text: "Hello world" },
        { key: "checkout", text: "Checkout" },
        { key: "save", text: "Save" },
      ],
    });

    const hello = keys.find((row) => row.key === "hello");
    const checkout = keys.find((row) => row.key === "checkout");
    expect(hello).toBeDefined();
    expect(checkout).toBeDefined();

    await insertTranslation({
      organizationId: stored.organization.id,
      projectId: stored.project.id,
      translationKeyId: hello!.id,
      targetLocale: "fr-FR",
      text: "Bonjour le monde",
      status: "approved",
    });
    await insertTranslation({
      organizationId: stored.organization.id,
      projectId: stored.project.id,
      translationKeyId: checkout!.id,
      targetLocale: "fr-FR",
      text: "Paiement",
      status: "needs_review",
    });

    const untranslated = await readToolResult(
      await callMcpTool(headers, {
        projectId: stored.project.id,
        targetLocale: "fr-FR",
        queueFilter: "untranslated",
      }),
    );
    expect(untranslated.output.translations?.map((row) => row.key)).toEqual(["save"]);
    expect(untranslated.output.translations?.[0]).toMatchObject({
      sourcePath: "locales/home.json",
      sourceText: "Save",
      targetLocale: "fr-FR",
      targetText: null,
      status: null,
      isHidden: false,
    });

    const needsReview = await readToolResult(
      await callMcpTool(headers, {
        projectId: stored.project.id,
        targetLocale: "fr-FR",
        queueFilter: "needs_review",
      }),
    );
    expect(needsReview.output.translations?.map((row) => row.key)).toEqual(["checkout"]);
    expect(needsReview.output.translations?.[0]).toMatchObject({
      targetText: "Paiement",
      status: "needs_review",
    });

    const byKey = await readToolResult(
      await callMcpTool(headers, {
        projectId: stored.project.id,
        targetLocale: "fr-FR",
        search: "checkout",
      }),
    );
    expect(byKey.output.translations?.map((row) => row.key)).toEqual(["checkout"]);

    const bySource = await readToolResult(
      await callMcpTool(headers, {
        projectId: stored.project.id,
        targetLocale: "fr-FR",
        search: "Hello world",
      }),
    );
    expect(bySource.output.translations?.map((row) => row.key)).toEqual(["hello"]);

    const byTarget = await readToolResult(
      await callMcpTool(headers, {
        projectId: stored.project.id,
        targetLocale: "fr-FR",
        search: "Paiement",
      }),
    );
    expect(byTarget.output.translations?.map((row) => row.key)).toEqual(["checkout"]);
  });

  it("scopes rows to sourcePath and paginates without duplicates or omissions", async () => {
    const stored = await fixture.createStoredProjectFixture();
    const headers = await authenticatedMcpHeaders(stored.identity);

    await seedFileKeys({
      organizationId: stored.organization.id,
      projectId: stored.project.id,
      sourcePath: "locales/marketing.json",
      entries: [
        { key: "cta", text: "Start" },
        { key: "hero", text: "Hero" },
      ],
    });
    await seedFileKeys({
      organizationId: stored.organization.id,
      projectId: stored.project.id,
      sourcePath: "locales/settings.json",
      entries: [{ key: "save", text: "Save" }],
    });

    const scoped = await readToolResult(
      await callMcpTool(headers, {
        projectId: stored.project.id,
        sourcePath: "locales/marketing.json",
        targetLocale: "fr-FR",
      }),
    );
    expect(scoped.output.total).toBe(2);
    expect(scoped.output.translations?.map((row) => row.key)).toEqual(["cta", "hero"]);
    expect(scoped.output.translations?.every((row) => row.sourcePath === "locales/marketing.json")).toBe(
      true,
    );

    const firstPage = await readToolResult(
      await callMcpTool(headers, {
        projectId: stored.project.id,
        targetLocale: "fr-FR",
        limit: 2,
        offset: 0,
      }),
    );
    const secondPage = await readToolResult(
      await callMcpTool(headers, {
        projectId: stored.project.id,
        targetLocale: "fr-FR",
        limit: 2,
        offset: 2,
      }),
    );

    expect(firstPage.output.pagination).toEqual({
      limit: 2,
      offset: 0,
      hasMore: true,
      nextOffset: 2,
    });
    expect(secondPage.output.pagination).toEqual({
      limit: 2,
      offset: 2,
      hasMore: false,
      nextOffset: null,
    });

    const keys = [
      ...(firstPage.output.translations ?? []),
      ...(secondPage.output.translations ?? []),
    ].map((row) => `${row.sourcePath}:${row.key}`);
    expect(keys).toEqual([
      "locales/marketing.json:cta",
      "locales/marketing.json:hero",
      "locales/settings.json:save",
    ]);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("expands omitted targetLocale across project locales without duplicating rows", async () => {
    const stored = await fixture.createStoredProjectFixture();
    await db
      .update(schema.projects)
      .set({ targetLocales: ["de-DE", "fr-FR"] })
      .where(eq(schema.projects.id, stored.project.id));

    const headers = await authenticatedMcpHeaders(stored.identity);
    const { keys } = await seedFileKeys({
      organizationId: stored.organization.id,
      projectId: stored.project.id,
      sourcePath: "locales/home.json",
      entries: [
        { key: "hello", text: "Hello" },
        { key: "bye", text: "Goodbye" },
      ],
    });

    const hello = keys.find((row) => row.key === "hello");
    expect(hello).toBeDefined();
    await insertTranslation({
      organizationId: stored.organization.id,
      projectId: stored.project.id,
      translationKeyId: hello!.id,
      targetLocale: "de-DE",
      text: "Hallo",
      status: "approved",
    });

    const firstPage = await readToolResult(
      await callMcpTool(headers, {
        projectId: stored.project.id,
        limit: 3,
        offset: 0,
      }),
    );
    const secondPage = await readToolResult(
      await callMcpTool(headers, {
        projectId: stored.project.id,
        limit: 3,
        offset: 3,
      }),
    );

    expect(firstPage.output.total).toBe(4);
    expect(firstPage.output.pagination).toEqual({
      limit: 3,
      offset: 0,
      hasMore: true,
      nextOffset: 3,
    });
    expect(secondPage.output.pagination?.hasMore).toBe(false);

    const rows = [
      ...(firstPage.output.translations ?? []),
      ...(secondPage.output.translations ?? []),
    ];
    expect(rows.map((row) => `${row.targetLocale}:${row.key}`)).toEqual([
      "de-DE:bye",
      "de-DE:hello",
      "fr-FR:bye",
      "fr-FR:hello",
    ]);
    expect(rows.find((row) => row.targetLocale === "de-DE" && row.key === "hello")).toMatchObject({
      targetText: "Hallo",
      status: "approved",
    });
  });

  it("maps approved to the CAT reviewed filter and keeps hidden flags", async () => {
    const stored = await fixture.createStoredProjectFixture();
    const headers = await authenticatedMcpHeaders(stored.identity);
    const { keys } = await seedFileKeys({
      organizationId: stored.organization.id,
      projectId: stored.project.id,
      sourcePath: "locales/home.json",
      entries: [
        { key: "done", text: "Done", maxLength: 24 },
        { key: "hidden", text: "Internal" },
      ],
    });

    const done = keys.find((row) => row.key === "done");
    const hidden = keys.find((row) => row.key === "hidden");
    expect(done).toBeDefined();
    expect(hidden).toBeDefined();

    await insertTranslation({
      organizationId: stored.organization.id,
      projectId: stored.project.id,
      translationKeyId: done!.id,
      targetLocale: "fr-FR",
      text: "Fait",
      status: "approved",
    });
    await setProjectTranslationKeysHidden({
      organizationId: stored.organization.id,
      projectId: stored.project.id,
      translationKeyIds: [hidden!.id],
      isHidden: true,
    });

    const approved = await readToolResult(
      await callMcpTool(headers, {
        projectId: stored.project.id,
        targetLocale: "fr-FR",
        queueFilter: "approved",
      }),
    );
    expect(approved.output.translations).toEqual([
      expect.objectContaining({
        key: "done",
        targetText: "Fait",
        status: "approved",
        maxLength: 24,
        isHidden: false,
      }),
    ]);

    const hiddenRows = await readToolResult(
      await callMcpTool(headers, {
        projectId: stored.project.id,
        targetLocale: "fr-FR",
        queueFilter: "hidden",
      }),
    );
    expect(hiddenRows.output.translations?.map((row) => row.key)).toEqual(["hidden"]);
    expect(hiddenRows.output.translations?.[0]?.isHidden).toBe(true);
  });

  it("lets a read-only member list keys", async () => {
    const stored = await fixture.createStoredProjectFixture();
    const member = fixture.createWorkosIdentityForOrganization(stored.identity.organization, "member");

    if (!stored.project.teamId) {
      throw new Error("expected project team");
    }

    await fixture.authHeadersFor(member);
    const memberAuth = globalThis.__testApiAuthContext;
    if (!memberAuth) {
      throw new Error("expected member auth context");
    }

    await db.insert(schema.teamMemberships).values({
      teamId: stored.project.teamId,
      userId: memberAuth.user.localUserId,
      role: "member",
    });

    const headers = await authenticatedMcpHeaders(member);

    await seedFileKeys({
      organizationId: stored.organization.id,
      projectId: stored.project.id,
      sourcePath: "locales/home.json",
      entries: [{ key: "hello", text: "Hello" }],
    });

    const result = await readToolResult(
      await callMcpTool(headers, {
        projectId: stored.project.id,
        targetLocale: "fr-FR",
      }),
    );

    expect(result.isError).toBe(false);
    expect(result.output.translations?.map((row) => row.key)).toEqual(["hello"]);
  });

  it("returns native overlay rows for TMS-backed projects", async () => {
    const stored = await fixture.createStoredProjectFixture();
    await db
      .update(schema.projects)
      .set({ source: "external_tms" })
      .where(eq(schema.projects.id, stored.project.id));

    const headers = await authenticatedMcpHeaders(stored.identity);
    await seedFileKeys({
      organizationId: stored.organization.id,
      projectId: stored.project.id,
      sourcePath: "locales/overlay.json",
      entries: [{ key: "overlay", text: "Overlay" }],
    });

    const result = await readToolResult(
      await callMcpTool(headers, {
        projectId: stored.project.id,
        targetLocale: "fr-FR",
      }),
    );

    expect(result.isError).toBe(false);
    expect(result.output.coverageSource).toBe("native_overlay");
    expect(result.output.translations?.map((row) => row.key)).toEqual(["overlay"]);
  });

  it("returns project_not_found for missing and cross-organization projects", async () => {
    const stored = await fixture.createStoredProjectFixture();
    const external = await fixture.createStoredProjectFixture();
    const headers = await authenticatedMcpHeaders(stored.identity);

    await seedFileKeys({
      organizationId: external.organization.id,
      projectId: external.project.id,
      sourcePath: "locales/secret.json",
      entries: [{ key: "secret", text: "Secret" }],
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
    expect(otherOrg.output.translations).toBeUndefined();
  });

  it.each([
    ["an over-limit page size", { limit: 51 }],
    ["a zero page size", { limit: 0 }],
    ["a negative offset", { offset: -1 }],
    ["an overlong search", { search: "x".repeat(257) }],
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
