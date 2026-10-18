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

import { and, eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { generateMcpToken, hashMcpToken } from "@/api/auth/mcp";
import { createMcpTestApp } from "@/api/routes/mcp/mcp.fixture";
import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { db, schema } from "@/lib/database/client";
import { ensureRepositorySourceFile } from "@/lib/file-storage/records";
import { upsertProjectTranslationKeysFromEntries } from "@/lib/projects/translations/project-translation-service";

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

async function callMcpTool(
  headers: Record<string, string>,
  name: string,
  args: Record<string, unknown>,
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

async function readToolResult<T>(response: Response) {
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
    output: JSON.parse(text!) as T,
  };
}

async function seedFileKeys(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  entries: Array<{ key: string; text: string }>;
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
    })),
  });

  const keys = await db
    .select({
      id: schema.projectTranslationKeys.id,
      key: schema.projectTranslationKeys.key,
    })
    .from(schema.projectTranslationKeys)
    .where(eq(schema.projectTranslationKeys.repositorySourceFileId, sourceFile.id));

  return { sourceFile, keys };
}

async function grantTeamAccess(
  identity: ReturnType<typeof fixture.createWorkosIdentityForOrganization>,
  teamId: string,
) {
  await fixture.authHeadersFor(identity);
  const auth = globalThis.__testApiAuthContext;
  if (!auth) {
    throw new Error("expected teammate auth context");
  }

  await db.insert(schema.teamMemberships).values({
    teamId,
    userId: auth.user.localUserId,
    role: "member",
  });

  return auth;
}

describe("MCP translator tools", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it("advertises the new translator tools", async () => {
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
    const names = new Set(body.result?.tools?.map((tool) => tool.name));

    expect(names.has("update_translations")).toBe(true);
    expect(names.has("set_translation_status")).toBe(true);
    expect(names.has("list_translation_comments")).toBe(true);
    expect(names.has("add_translation_comment")).toBe(true);
  });

  it("saves valid bulk rows independently of an invalid sibling", async () => {
    const stored = await fixture.createStoredProjectFixture();
    const headers = await authenticatedMcpHeaders(stored.identity);
    const { keys } = await seedFileKeys({
      organizationId: stored.organization.id,
      projectId: stored.project.id,
      sourcePath: "locales/bulk.json",
      entries: [
        { key: "greeting", text: "Hello {name}" },
        { key: "farewell", text: "Goodbye {name}" },
      ],
    });

    const greeting = keys.find((row) => row.key === "greeting");
    const farewell = keys.find((row) => row.key === "farewell");
    if (!greeting || !farewell) {
      throw new Error("expected seeded translation keys");
    }

    const result = await readToolResult<{
      saved?: number;
      failed?: number;
      results?: Array<{
        translationKeyId: string;
        ok: boolean;
        error?: string;
        status?: string;
      }>;
    }>(
      await callMcpTool(headers, "update_translations", {
        projectId: stored.project.id,
        updates: [
          {
            translationKeyId: greeting.id,
            targetLocale: "fr-FR",
            targetText: "Bonjour {name}",
          },
          {
            translationKeyId: farewell.id,
            targetLocale: "fr-FR",
            targetText: "Au revoir",
          },
          {
            translationKeyId: greeting.id,
            targetLocale: "de-DE",
            targetText: "Hallo {name}",
          },
        ],
      }),
    );

    expect(result.isError).toBe(false);
    expect(result.output).toMatchObject({
      saved: 1,
      failed: 2,
    });
    expect(result.output.results).toEqual([
      expect.objectContaining({
        translationKeyId: greeting.id,
        targetLocale: "fr-FR",
        ok: true,
        status: "draft",
      }),
      expect.objectContaining({
        translationKeyId: farewell.id,
        targetLocale: "fr-FR",
        ok: false,
        error: "invalid_translation",
      }),
      expect.objectContaining({
        translationKeyId: greeting.id,
        targetLocale: "de-DE",
        ok: false,
        error: "translation_not_found",
      }),
    ]);

    const saved = await db
      .select({
        translationKeyId: schema.projectTranslations.translationKeyId,
        text: schema.projectTranslations.text,
        status: schema.projectTranslations.status,
      })
      .from(schema.projectTranslations)
      .where(
        and(
          eq(schema.projectTranslations.projectId, stored.project.id),
          eq(schema.projectTranslations.targetLocale, "fr-FR"),
        ),
      );

    expect(saved).toEqual([
      {
        translationKeyId: greeting.id,
        text: "Bonjour {name}",
        status: "draft",
      },
    ]);
  });

  it("rejects translator approve on update_translations before saving any row", async () => {
    const stored = await fixture.createStoredProjectFixture();
    const translator = fixture.createWorkosIdentityForOrganization(
      stored.identity.organization,
      "translator",
    );

    if (!stored.project.teamId) {
      throw new Error("expected project team");
    }

    await grantTeamAccess(translator, stored.project.teamId);

    const { keys } = await seedFileKeys({
      organizationId: stored.organization.id,
      projectId: stored.project.id,
      sourcePath: "locales/approve.json",
      entries: [{ key: "title", text: "Approved title" }],
    });
    const [translationKey] = keys;
    if (!translationKey) {
      throw new Error("expected translation key");
    }

    const headers = await authenticatedMcpHeaders(translator);
    const result = await readToolResult<{ error?: string }>(
      await callMcpTool(headers, "update_translations", {
        projectId: stored.project.id,
        updates: [
          {
            translationKeyId: translationKey.id,
            targetLocale: "fr-FR",
            targetText: "Titre approuve",
            approve: true,
          },
        ],
      }),
    );

    expect(result).toMatchObject({
      isError: true,
      output: { error: "forbidden" },
    });

    const saved = await db
      .select({ id: schema.projectTranslations.id })
      .from(schema.projectTranslations)
      .where(eq(schema.projectTranslations.translationKeyId, translationKey.id));
    expect(saved).toEqual([]);
  });

  it("lets a translator mark a string needs_review but not approve it", async () => {
    const stored = await fixture.createStoredProjectFixture();
    const translator = fixture.createWorkosIdentityForOrganization(
      stored.identity.organization,
      "translator",
    );

    if (!stored.project.teamId) {
      throw new Error("expected project team");
    }

    await grantTeamAccess(translator, stored.project.teamId);

    const { keys } = await seedFileKeys({
      organizationId: stored.organization.id,
      projectId: stored.project.id,
      sourcePath: "locales/status.json",
      entries: [{ key: "title", text: "Title" }],
    });
    const [translationKey] = keys;
    if (!translationKey) {
      throw new Error("expected translation key");
    }

    await db.insert(schema.projectTranslations).values({
      organizationId: stored.organization.id,
      projectId: stored.project.id,
      translationKeyId: translationKey.id,
      targetLocale: "fr-FR",
      text: "Titre",
      status: "draft",
      provenance: "manual",
    });

    const headers = await authenticatedMcpHeaders(translator);

    const needsReview = await readToolResult<{ status?: string }>(
      await callMcpTool(headers, "set_translation_status", {
        projectId: stored.project.id,
        translationKeyId: translationKey.id,
        targetLocale: "fr-FR",
        status: "needs_review",
      }),
    );
    const approve = await readToolResult<{ error?: string }>(
      await callMcpTool(headers, "set_translation_status", {
        projectId: stored.project.id,
        translationKeyId: translationKey.id,
        targetLocale: "fr-FR",
        status: "approved",
      }),
    );

    expect(needsReview.isError).toBe(false);
    expect(needsReview.output).toMatchObject({
      id: translationKey.id,
      targetLocale: "fr-FR",
      status: "needs_review",
    });
    expect(approve).toMatchObject({
      isError: true,
      output: { error: "forbidden" },
    });

    const [saved] = await db
      .select({ status: schema.projectTranslations.status })
      .from(schema.projectTranslations)
      .where(
        and(
          eq(schema.projectTranslations.translationKeyId, translationKey.id),
          eq(schema.projectTranslations.targetLocale, "fr-FR"),
        ),
      )
      .limit(1);
    expect(saved?.status).toBe("needs_review");
  });

  it("forbids read-only members from updating translations", async () => {
    const stored = await fixture.createStoredProjectFixture();
    const member = fixture.createWorkosIdentityForOrganization(
      stored.identity.organization,
      "member",
    );

    if (!stored.project.teamId) {
      throw new Error("expected project team");
    }

    await grantTeamAccess(member, stored.project.teamId);

    const { keys } = await seedFileKeys({
      organizationId: stored.organization.id,
      projectId: stored.project.id,
      sourcePath: "locales/member.json",
      entries: [{ key: "hello", text: "Hello" }],
    });
    const [translationKey] = keys;
    if (!translationKey) {
      throw new Error("expected translation key");
    }

    const headers = await authenticatedMcpHeaders(member);
    const result = await readToolResult<{ error?: string }>(
      await callMcpTool(headers, "update_translations", {
        projectId: stored.project.id,
        updates: [
          {
            translationKeyId: translationKey.id,
            targetLocale: "fr-FR",
            targetText: "Bonjour",
          },
        ],
      }),
    );

    expect(result).toMatchObject({
      isError: true,
      output: { error: "forbidden" },
    });
  });

  it("round-trips a translator comment on one translation", async () => {
    const stored = await fixture.createStoredProjectFixture();
    const translator = fixture.createWorkosIdentityForOrganization(
      stored.identity.organization,
      "translator",
    );

    if (!stored.project.teamId) {
      throw new Error("expected project team");
    }

    await grantTeamAccess(translator, stored.project.teamId);

    const { keys } = await seedFileKeys({
      organizationId: stored.organization.id,
      projectId: stored.project.id,
      sourcePath: "locales/comments.json",
      entries: [{ key: "title", text: "Title" }],
    });
    const [translationKey] = keys;
    if (!translationKey) {
      throw new Error("expected translation key");
    }

    const headers = await authenticatedMcpHeaders(translator);
    const added = await readToolResult<{
      comment?: { id: string; text: string; author: string | null };
    }>(
      await callMcpTool(headers, "add_translation_comment", {
        projectId: stored.project.id,
        translationKeyId: translationKey.id,
        targetLocale: "fr-FR",
        text: "Use formal tone.",
      }),
    );

    expect(added.isError).toBe(false);
    expect(added.output.comment).toEqual(
      expect.objectContaining({
        text: "Use formal tone.",
      }),
    );

    const listed = await readToolResult<{
      comments?: Array<{ id: string; text: string }>;
    }>(
      await callMcpTool(headers, "list_translation_comments", {
        projectId: stored.project.id,
        translationKeyId: translationKey.id,
        targetLocale: "fr-FR",
      }),
    );

    expect(listed.isError).toBe(false);
    expect(listed.output.comments).toEqual([
      expect.objectContaining({
        id: added.output.comment?.id,
        text: "Use formal tone.",
      }),
    ]);
  });

  it("forbids read-only members from adding comments", async () => {
    const stored = await fixture.createStoredProjectFixture();
    const member = fixture.createWorkosIdentityForOrganization(
      stored.identity.organization,
      "member",
    );

    if (!stored.project.teamId) {
      throw new Error("expected project team");
    }

    await grantTeamAccess(member, stored.project.teamId);

    const { keys } = await seedFileKeys({
      organizationId: stored.organization.id,
      projectId: stored.project.id,
      sourcePath: "locales/member-comment.json",
      entries: [{ key: "hello", text: "Hello" }],
    });
    const [translationKey] = keys;
    if (!translationKey) {
      throw new Error("expected translation key");
    }

    const headers = await authenticatedMcpHeaders(member);
    const result = await readToolResult<{ error?: string }>(
      await callMcpTool(headers, "add_translation_comment", {
        projectId: stored.project.id,
        translationKeyId: translationKey.id,
        targetLocale: "fr-FR",
        text: "Looks good.",
      }),
    );

    expect(result).toMatchObject({
      isError: true,
      output: { error: "forbidden" },
    });

    const comments = await db
      .select({ id: schema.projectTranslationComments.id })
      .from(schema.projectTranslationComments)
      .where(eq(schema.projectTranslationComments.translationKeyId, translationKey.id));
    expect(comments).toEqual([]);
  });

  it("does not list comments for a locale the project does not target", async () => {
    const stored = await fixture.createStoredProjectFixture();
    const { keys } = await seedFileKeys({
      organizationId: stored.organization.id,
      projectId: stored.project.id,
      sourcePath: "locales/locale.json",
      entries: [{ key: "hello", text: "Hello" }],
    });
    const [translationKey] = keys;
    if (!translationKey) {
      throw new Error("expected translation key");
    }

    const headers = await authenticatedMcpHeaders(stored.identity);
    const result = await readToolResult<{ error?: string }>(
      await callMcpTool(headers, "list_translation_comments", {
        projectId: stored.project.id,
        translationKeyId: translationKey.id,
        targetLocale: "de-DE",
      }),
    );

    expect(result).toMatchObject({
      isError: true,
      output: { error: "translation_not_found" },
    });
  });
});
