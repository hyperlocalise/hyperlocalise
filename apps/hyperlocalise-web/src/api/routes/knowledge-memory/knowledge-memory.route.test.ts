import "dotenv/config";

import { eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

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

import { createApp } from "@/api/app";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db, schema } from "@/lib/database";
import { KNOWLEDGE_MEMORY_CONTENT_MAX_LENGTH } from "@/lib/knowledge-memory/knowledge-memory.shared";

const client = testClient(createApp());
const fixture = createAuthTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.clearAllMocks();
  await fixture.cleanup();
});

describe("knowledgeMemoryRoutes", () => {
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

  it("rejects workspace memory over 2048 characters", async () => {
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
