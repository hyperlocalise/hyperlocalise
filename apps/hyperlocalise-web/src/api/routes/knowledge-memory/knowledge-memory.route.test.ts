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
import { testClient } from "hono/testing";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { resolveApiAuthContextFromSessionMock, workspaceKnowledgeFlagRunMock } = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(
    (options) =>
      globalThis.__resolveTestApiAuthContextFromSession?.(options) ??
      globalThis.__testApiAuthContext ??
      null,
  ),
  workspaceKnowledgeFlagRunMock: vi.fn(async () => true),
}));

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
  };
});

vi.mock("@/lib/flags/workspace-flags", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/flags/workspace-flags")>();
  return {
    ...actual,
    workspaceKnowledgeFlag: { run: workspaceKnowledgeFlagRunMock },
  };
});

import { createApp } from "@/api/app";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import type { KnowledgeMemoryRecord } from "@/api/routes/knowledge-memory/knowledge-memory.schema";
import { db, schema } from "@/lib/database";
import {
  KNOWLEDGE_MEMORY_CONTENT_MAX_LENGTH,
  KNOWLEDGE_MEMORY_SUMMARY_MAX_LENGTH,
} from "@/lib/knowledge-memory/knowledge-memory.shared";

const client = testClient(createApp());
const fixture = createAuthTestFixture();

function knowledgeMemoryFromResponseBody(body: unknown): KnowledgeMemoryRecord {
  if (
    typeof body !== "object" ||
    body === null ||
    !("knowledgeMemory" in body) ||
    typeof body.knowledgeMemory !== "object" ||
    body.knowledgeMemory === null
  ) {
    throw new Error("expected a Knowledge Memory response");
  }
  return body.knowledgeMemory as KnowledgeMemoryRecord;
}

const previewMemory = [
  "# Memory.md",
  "",
  "## Locale notes",
  "",
  "### en-AU",
  "",
  "Use Australian English for customer-facing copy.",
  "",
  "- Prefer colour, customise, localise, organise.",
  "- Avoid US spelling.",
  "",
  "### fr-FR",
  "",
  "French marketing and pricing copy should sound natural, not directly translated.",
  "",
  "- Avoid literal launch slogans.",
  "- Prefer idiomatic French marketing phrasing.",
  "",
  "## Brand voice",
  "",
  "- Avoid hype-heavy words like revolutionary and game-changing.",
  "",
  ...Array.from(
    { length: 80 },
    (_, index) => `- General filler ${index + 1}: keep unrelated support text concise.`,
  ),
].join("\n");

beforeAll(async () => {
  await db.$client.query("select 1");
});

beforeEach(() => {
  workspaceKnowledgeFlagRunMock.mockResolvedValue(true);
});

afterEach(async () => {
  vi.clearAllMocks();
  await fixture.cleanup();
});

describe("knowledgeMemoryRoutes", () => {
  it("denies workspace memory access when the feature flag is disabled", async () => {
    workspaceKnowledgeFlagRunMock.mockResolvedValue(false);
    const identity = fixture.createWorkosIdentity();
    const headers = await fixture.authHeadersFor(identity);

    const response = await client.api.orgs[":organizationSlug"]["knowledge-memory"].$get(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug" },
      },
      { headers },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "feature_unavailable",
    });
  });

  it("loads an empty workspace memory before one is saved", async () => {
    const identity = fixture.createWorkosIdentity();
    const headers = await fixture.authHeadersFor(identity);

    const response = await client.api.orgs[":organizationSlug"]["knowledge-memory"].$get(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug" },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("etag")).toBe('"0"');
    await expect(response.json()).resolves.toEqual({
      knowledgeMemory: {
        revisionId: null,
        version: 0,
        content: "",
        summary: null,
        updatedAt: null,
        updatedByUserId: null,
      },
    });
  });

  it("upserts workspace memory and trims trailing whitespace", async () => {
    const identity = fixture.createWorkosIdentity();
    const headers = await fixture.authHeadersFor(identity);

    const firstResponse = await client.api.orgs[":organizationSlug"]["knowledge-memory"].$put(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug" },
        json: {
          content: "Use sentence case for feature names.\n\n",
          summary: "Add feature-name casing",
        },
      },
      { headers: { ...headers, "If-Match": '"0"' } },
    );
    expect(firstResponse.status).toBe(200);
    await expect(firstResponse.json()).resolves.toMatchObject({
      knowledgeMemory: {
        version: 1,
        content: "Use sentence case for feature names.",
        summary: "Add feature-name casing",
      },
    });
    const firstEtag = firstResponse.headers.get("etag");
    expect(firstEtag).toMatch(/^"[0-9a-f-]+"$/u);

    const secondResponse = await client.api.orgs[":organizationSlug"]["knowledge-memory"].$put(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug" },
        json: { content: "Prefer short button labels." },
      },
      { headers: { ...headers, "If-Match": firstEtag! } },
    );
    expect(secondResponse.status).toBe(200);
    await expect(secondResponse.json()).resolves.toMatchObject({
      knowledgeMemory: {
        version: 2,
        content: "Prefer short button labels.",
        summary: "Updated memory",
      },
    });

    const organizationId = globalThis.__testApiAuthContext?.organization.localOrganizationId ?? "";
    const rows = await db
      .select({ content: schema.knowledgeMemories.content })
      .from(schema.knowledgeMemories)
      .where(eq(schema.knowledgeMemories.organizationId, organizationId));
    expect(rows).toEqual([{ content: "Prefer short button labels." }]);

    const revisions = await db
      .select({
        version: schema.knowledgeMemoryRevisions.version,
        content: schema.knowledgeMemoryRevisions.content,
      })
      .from(schema.knowledgeMemoryRevisions)
      .where(eq(schema.knowledgeMemoryRevisions.organizationId, organizationId));
    expect(revisions).toEqual([
      {
        version: 1,
        content: "Use sentence case for feature names.",
      },
    ]);
  });

  it("requires a current ETag and returns the latest head for stale commits", async () => {
    const identity = fixture.createWorkosIdentity();
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const missingResponse = await client.api.orgs[":organizationSlug"]["knowledge-memory"].$put(
      {
        param: { organizationSlug },
        json: { content: "First version" },
      },
      { headers },
    );
    expect(missingResponse.status).toBe(428);
    await expect(missingResponse.json()).resolves.toMatchObject({
      error: "knowledge_memory_precondition_required",
    });

    const firstResponse = await client.api.orgs[":organizationSlug"]["knowledge-memory"].$put(
      {
        param: { organizationSlug },
        json: { content: "First version" },
      },
      { headers: { ...headers, "If-Match": '"0"' } },
    );
    const firstEtag = firstResponse.headers.get("etag")!;

    const secondResponse = await client.api.orgs[":organizationSlug"]["knowledge-memory"].$put(
      {
        param: { organizationSlug },
        json: { content: "Second version" },
      },
      { headers: { ...headers, "If-Match": firstEtag } },
    );
    const secondEtag = secondResponse.headers.get("etag")!;

    const staleResponse = await client.api.orgs[":organizationSlug"]["knowledge-memory"].$put(
      {
        param: { organizationSlug },
        json: { content: "Stale version" },
      },
      { headers: { ...headers, "If-Match": firstEtag } },
    );
    expect(staleResponse.status).toBe(412);
    expect(staleResponse.headers.get("etag")).toBe(secondEtag);
    await expect(staleResponse.json()).resolves.toMatchObject({
      error: "knowledge_memory_precondition_failed",
      details: {
        knowledgeMemory: {
          version: 2,
          content: "Second version",
        },
      },
    });
  });

  it("lists, compares, and restores organization-scoped revisions", async () => {
    const identity = fixture.createWorkosIdentity();
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const firstResponse = await client.api.orgs[":organizationSlug"]["knowledge-memory"].$put(
      {
        param: { organizationSlug },
        json: { content: "Version one", summary: "Initial rules" },
      },
      { headers: { ...headers, "If-Match": '"0"' } },
    );
    const firstMemory = knowledgeMemoryFromResponseBody(await firstResponse.json());
    const firstEtag = firstResponse.headers.get("etag")!;

    const secondResponse = await client.api.orgs[":organizationSlug"]["knowledge-memory"].$put(
      {
        param: { organizationSlug },
        json: { content: "Version two", summary: "Revise rules" },
      },
      { headers: { ...headers, "If-Match": firstEtag } },
    );
    const secondMemory = knowledgeMemoryFromResponseBody(await secondResponse.json());
    const secondEtag = secondResponse.headers.get("etag")!;

    const firstPage = await client.api.orgs[":organizationSlug"]["knowledge-memory"].revisions.$get(
      {
        param: { organizationSlug },
        query: { limit: "1" },
      },
      { headers },
    );
    expect(firstPage.status).toBe(200);
    await expect(firstPage.json()).resolves.toMatchObject({
      knowledgeMemoryRevisions: [
        {
          revisionId: secondMemory.revisionId,
          version: 2,
          summary: "Revise rules",
          isCurrent: true,
        },
      ],
      nextCursor: 2,
    });

    const secondPage = await client.api.orgs[":organizationSlug"][
      "knowledge-memory"
    ].revisions.$get(
      {
        param: { organizationSlug },
        query: { limit: "1", cursor: 2 },
      },
      { headers },
    );
    await expect(secondPage.json()).resolves.toMatchObject({
      knowledgeMemoryRevisions: [
        {
          revisionId: firstMemory.revisionId,
          version: 1,
          isCurrent: false,
        },
      ],
      nextCursor: null,
    });

    const detailResponse = await client.api.orgs[":organizationSlug"]["knowledge-memory"].revisions[
      ":revisionId"
    ].$get(
      {
        param: {
          organizationSlug,
          revisionId: secondMemory.revisionId!,
        },
      },
      { headers },
    );
    await expect(detailResponse.json()).resolves.toMatchObject({
      knowledgeMemoryRevision: {
        version: 2,
        content: "Version two",
      },
      previousKnowledgeMemoryRevision: {
        version: 1,
        content: "Version one",
      },
    });

    const restoreResponse = await client.api.orgs[":organizationSlug"][
      "knowledge-memory"
    ].revisions[":revisionId"].restore.$post(
      {
        param: {
          organizationSlug,
          revisionId: firstMemory.revisionId!,
        },
      },
      { headers: { ...headers, "If-Match": secondEtag } },
    );
    expect(restoreResponse.status).toBe(200);
    await expect(restoreResponse.json()).resolves.toMatchObject({
      knowledgeMemory: {
        version: 3,
        content: "Version one",
        summary: "Restored version 1",
      },
    });
  });

  it("does not expose revisions across organizations", async () => {
    const firstIdentity = fixture.createWorkosIdentity();
    const firstHeaders = await fixture.authHeadersFor(firstIdentity);
    const firstOrganizationSlug = firstIdentity.organization.slug ?? "missing-slug";
    const firstCommit = await client.api.orgs[":organizationSlug"]["knowledge-memory"].$put(
      {
        param: { organizationSlug: firstOrganizationSlug },
        json: { content: "Private organization guidance" },
      },
      { headers: { ...firstHeaders, "If-Match": '"0"' } },
    );
    const firstRevisionId = knowledgeMemoryFromResponseBody(await firstCommit.json()).revisionId!;

    const secondIdentity = fixture.createWorkosIdentity();
    const secondHeaders = await fixture.authHeadersFor(secondIdentity);
    const secondOrganizationSlug = secondIdentity.organization.slug ?? "missing-slug";

    const response = await client.api.orgs[":organizationSlug"]["knowledge-memory"].revisions[
      ":revisionId"
    ].$get(
      {
        param: {
          organizationSlug: secondOrganizationSlug,
          revisionId: firstRevisionId,
        },
      },
      { headers: secondHeaders },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: "knowledge_memory_revision_not_found",
    });
  });

  it("rejects workspace memory over the configured limit", async () => {
    const identity = fixture.createWorkosIdentity();
    const headers = await fixture.authHeadersFor(identity);

    const response = await client.api.orgs[":organizationSlug"]["knowledge-memory"].$put(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug" },
        json: { content: "a".repeat(KNOWLEDGE_MEMORY_CONTENT_MAX_LENGTH + 1) },
      },
      { headers },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_knowledge_memory_payload",
    });
  });

  it("rejects version notes over the configured limit", async () => {
    const identity = fixture.createWorkosIdentity();
    const headers = await fixture.authHeadersFor(identity);

    const response = await client.api.orgs[":organizationSlug"]["knowledge-memory"].$put(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug" },
        json: {
          content: "Use sentence case.",
          summary: "a".repeat(KNOWLEDGE_MEMORY_SUMMARY_MAX_LENGTH + 1),
        },
      },
      { headers: { ...headers, "If-Match": '"0"' } },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_knowledge_memory_payload",
    });
  });

  it("previews selected workspace memory with retrieval metrics", async () => {
    const identity = fixture.createWorkosIdentity();
    const headers = await fixture.authHeadersFor(identity);
    const organizationId = globalThis.__testApiAuthContext?.organization.localOrganizationId ?? "";
    await db.insert(schema.knowledgeMemories).values({
      organizationId,
      updatedByUserId: globalThis.__testApiAuthContext?.user.localUserId,
      content: previewMemory,
    });

    const response = await client.api.orgs[":organizationSlug"]["knowledge-memory"].preview.$post(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug" },
        json: {
          targetLocale: "en-AU",
          sourceText: "Customize your color settings",
          maxChars: 1200,
        },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.memoryPreview.compactText).toContain("Australian English");
    expect(body.memoryPreview.compactText).toContain("colour");
    expect(body.memoryPreview.compactText).not.toContain("fr-FR");
    expect(body.memoryPreview.metrics).toMatchObject({
      fallbackMode: "selective",
      wholeMemoryChars: previewMemory.length,
    });
    expect(body.memoryPreview.metrics.selectedMemoryCount).toBeGreaterThan(0);
    expect(body.memoryPreview.metrics.selectedMemoryChars).toBeLessThan(
      body.memoryPreview.metrics.wholeMemoryChars,
    );
    expect(body.memoryPreview.metrics.matchedHeadingPaths).toContain(
      "Memory.md > Locale notes > en-AU",
    );
  });

  it("allows members to preview workspace memory without update permission", async () => {
    const identity = fixture.createWorkosIdentityWithRole("member");
    const headers = await fixture.authHeadersFor(identity);

    const response = await client.api.orgs[":organizationSlug"]["knowledge-memory"].preview.$post(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug" },
        json: { targetLocale: "en-AU", sourceText: "Hello" },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      memoryPreview: {
        compactText: "",
        metrics: { fallbackMode: "empty" },
      },
    });
  });

  it("rejects invalid preview payloads", async () => {
    const identity = fixture.createWorkosIdentity();
    const headers = await fixture.authHeadersFor(identity);

    const response = await client.api.orgs[":organizationSlug"]["knowledge-memory"].preview.$post(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug" },
        json: { maxChars: 64 },
      },
      { headers },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_knowledge_memory_preview_payload",
    });
  });

  it("rejects preview metadata with too many entries", async () => {
    const identity = fixture.createWorkosIdentity();
    const headers = await fixture.authHeadersFor(identity);

    const response = await client.api.orgs[":organizationSlug"]["knowledge-memory"].preview.$post(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug" },
        json: {
          targetLocale: "en-AU",
          metadata: Object.fromEntries(
            Array.from({ length: 51 }, (_, index) => [`key-${index}`, `value-${index}`]),
          ),
        },
      },
      { headers },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_knowledge_memory_preview_payload",
    });
  });

  it("denies workspace memory updates for members", async () => {
    const identity = fixture.createWorkosIdentityWithRole("member");
    const headers = await fixture.authHeadersFor(identity);

    const response = await client.api.orgs[":organizationSlug"]["knowledge-memory"].$put(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug" },
        json: { content: "Use a direct tone." },
      },
      { headers },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "forbidden",
    });

    const restoreResponse = await client.api.orgs[":organizationSlug"][
      "knowledge-memory"
    ].revisions[":revisionId"].restore.$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          revisionId: "7e268056-d04f-4d2e-b6b3-5f11cedf865c",
        },
      },
      { headers },
    );
    expect(restoreResponse.status).toBe(403);
  });
});
