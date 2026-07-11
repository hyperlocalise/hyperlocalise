import "dotenv/config";

import { eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { resolveApiAuthContextFromSessionMock, workspaceKnowledgeFlagResolverMock } = vi.hoisted(
  () => ({
    resolveApiAuthContextFromSessionMock: vi.fn(
      (options) =>
        globalThis.__resolveTestApiAuthContextFromSession?.(options) ??
        globalThis.__testApiAuthContext ??
        null,
    ),
    workspaceKnowledgeFlagResolverMock: vi.fn(async () => true),
  }),
);

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
  };
});

import { createApp } from "@/api/app";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db, schema } from "@/lib/database";
import { KNOWLEDGE_MEMORY_CONTENT_MAX_LENGTH } from "@/lib/knowledge-memory/knowledge-memory.shared";

const client = testClient(
  createApp({
    workspaceKnowledgeFlagResolver: workspaceKnowledgeFlagResolverMock,
  }),
);
const fixture = createAuthTestFixture();

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
  workspaceKnowledgeFlagResolverMock.mockResolvedValue(true);
});

afterEach(async () => {
  vi.clearAllMocks();
  await fixture.cleanup();
});

describe("knowledgeMemoryRoutes", () => {
  it("denies workspace memory access when the feature flag is disabled", async () => {
    workspaceKnowledgeFlagResolverMock.mockResolvedValue(false);
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
    await expect(response.json()).resolves.toEqual({
      knowledgeMemory: {
        content: "",
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
        json: { content: "Use sentence case for feature names.\n\n" },
      },
      { headers },
    );
    expect(firstResponse.status).toBe(200);
    await expect(firstResponse.json()).resolves.toMatchObject({
      knowledgeMemory: { content: "Use sentence case for feature names." },
    });

    const secondResponse = await client.api.orgs[":organizationSlug"]["knowledge-memory"].$put(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug" },
        json: { content: "Prefer short button labels." },
      },
      { headers },
    );
    expect(secondResponse.status).toBe(200);
    await expect(secondResponse.json()).resolves.toMatchObject({
      knowledgeMemory: { content: "Prefer short button labels." },
    });

    const organizationId = globalThis.__testApiAuthContext?.organization.localOrganizationId ?? "";
    const rows = await db
      .select({ content: schema.knowledgeMemories.content })
      .from(schema.knowledgeMemories)
      .where(eq(schema.knowledgeMemories.organizationId, organizationId));
    expect(rows).toEqual([{ content: "Prefer short button labels." }]);
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
  });
});
