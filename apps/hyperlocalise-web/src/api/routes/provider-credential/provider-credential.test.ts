import "dotenv/config";

import { eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { app } from "@/api/app";
import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { db, schema } from "@/lib/database";

const { resolveApiAuthContextFromSessionMock } = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(() => globalThis.__testApiAuthContext ?? null),
}));

vi.mock("@/api/auth/workos-session", () => ({
  resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
}));

const client = testClient(app);
const fixture = createProjectTestFixture(client);

describe("providerCredentialRoutes", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    await fixture.cleanup();
  });

  it("stores an encrypted provider credential for org admins", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })),
    );

    const identity = fixture.createWorkosIdentityWithRole("admin");
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const response = await client.api.orgs[":organizationSlug"]["provider-credential"].$put(
      {
        param: { organizationSlug },
        json: {
          provider: "openai",
          apiKey: "sk-live-provider-key",
          defaultModel: "gpt-4.1-mini",
        },
      },
      {
        headers: await fixture.authHeadersFor(identity),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      providerCredential: {
        provider: "openai",
        defaultModel: "gpt-4.1-mini",
        maskedApiKeySuffix: "••••-key",
      },
    });

    const authContext = globalThis.__testApiAuthContext;
    const [storedCredential] = await db
      .select()
      .from(schema.organizationLlmProviderCredentials)
      .where(
        eq(
          schema.organizationLlmProviderCredentials.organizationId,
          authContext?.organization.localOrganizationId ?? "missing-org-id",
        ),
      );
    expect(authContext).toBeDefined();
    expect(storedCredential?.ciphertext).not.toContain("sk-live-provider-key");
    expect(storedCredential?.maskedApiKeySuffix).toBe("••••-key");
  });

  it("blocks org members from managing provider credentials", async () => {
    const identity = fixture.createWorkosIdentityWithRole("member");
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const response = await client.api.orgs[":organizationSlug"]["provider-credential"].$put(
      {
        param: { organizationSlug },
        json: {
          provider: "openai",
          apiKey: "sk-member-key",
          defaultModel: "gpt-4.1-mini",
        },
      },
      {
        headers: await fixture.authHeadersFor(identity),
      },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "forbidden",
    });
  });

  it("reveals a stored provider credential only after explicit confirmation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })),
    );

    const identity = fixture.createWorkosIdentity();
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const headers = await fixture.authHeadersFor(identity);

    await client.api.orgs[":organizationSlug"]["provider-credential"].$put(
      {
        param: { organizationSlug },
        json: {
          provider: "openai",
          apiKey: "sk-reveal-provider-key",
          defaultModel: "gpt-4.1-mini",
        },
      },
      { headers },
    );

    const revealResponse = await client.api.orgs[":organizationSlug"]["provider-credential"][
      "reveal"
    ].$post(
      {
        param: { organizationSlug },
        json: {
          confirmed: true,
        },
      },
      { headers },
    );

    expect(revealResponse.status).toBe(200);
    await expect(revealResponse.json()).resolves.toMatchObject({
      providerCredential: {
        apiKey: "sk-reveal-provider-key",
        summary: {
          provider: "openai",
          defaultModel: "gpt-4.1-mini",
        },
      },
    });
  });
});
