import "dotenv/config";

import { eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { app } from "@/api/app";
import { db, schema } from "@/lib/database";

import { createProviderCredentialTestFixture } from "./provider-credential.fixture";

const { resolveApiAuthContextFromSessionMock } = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(
    (options) =>
      globalThis.__resolveTestApiAuthContextFromSession?.(options) ??
      globalThis.__testApiAuthContext ??
      null,
  ),
}));

vi.mock("@/api/auth/workos-session", () => ({
  resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
}));

const client = testClient(app);
const fixture = createProviderCredentialTestFixture(client);

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
    const response = await fixture.upsertProviderCredentialViaApi(identity, {
      provider: "openai",
      apiKey: "sk-live-provider-key",
      defaultModel: "gpt-4.1-mini",
    });

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
    const response = await fixture.upsertProviderCredentialViaApi(identity, {
      provider: "openai",
      apiKey: "sk-member-key",
      defaultModel: "gpt-4.1-mini",
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "forbidden",
    });
  });

  it("blocks org members from reading provider credential summaries", async () => {
    const ownerIdentity = fixture.createWorkosIdentity();
    const memberIdentity = fixture.createWorkosIdentityForOrganization(
      ownerIdentity.organization,
      "member",
    );
    const organizationSlug = ownerIdentity.organization.slug ?? "missing-slug";

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })),
    );

    await fixture.upsertProviderCredentialViaApi(ownerIdentity, {
      provider: "openai",
      apiKey: "sk-owner-key",
      defaultModel: "gpt-4.1-mini",
    });

    const response = await client.api.orgs[":organizationSlug"]["provider-credential"].$get(
      {
        param: { organizationSlug },
      },
      { headers: await fixture.authHeadersFor(memberIdentity) },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "forbidden" });
  });

  it("reveals a stored provider credential only after explicit confirmation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })),
    );

    const identity = fixture.createWorkosIdentity();
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const headers = await fixture.authHeadersFor(identity);

    await fixture.upsertProviderCredentialViaApi(identity, {
      provider: "openai",
      apiKey: "sk-reveal-provider-key",
      defaultModel: "gpt-4.1-mini",
    });

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
