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

vi.mock("inngest/hono", () => ({
  serve: () => () => new Response(null, { status: 204 }),
}));

vi.mock("@/lib/inngest", () => ({
  inngest: {},
  createInngestTranslationJobQueue: () => ({
    enqueue: async () => ({ ids: [] }),
  }),
}));

vi.mock("@/lib/translation/translation-job-queued-function", () => ({
  translationJobQueuedFunction: {},
}));

vi.mock("@/api/auth/workos-session", () => ({
  resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
}));

const client = testClient(app);
const fixture = createProjectTestFixture(client);

describe("providerCredentialRoutes", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
    await db.$client.query(`
      DO $$
      BEGIN
        CREATE TYPE llm_provider AS ENUM ('openai', 'anthropic', 'gemini', 'groq', 'mistral');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await db.$client.query(`
      CREATE TABLE IF NOT EXISTS organization_llm_provider_credentials (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE cascade,
        created_by_user_id uuid REFERENCES users(id) ON DELETE set null,
        updated_by_user_id uuid REFERENCES users(id) ON DELETE set null,
        provider llm_provider NOT NULL,
        default_model text NOT NULL,
        masked_api_key_suffix text NOT NULL,
        encryption_algorithm text NOT NULL,
        ciphertext text NOT NULL,
        iv text NOT NULL,
        auth_tag text NOT NULL,
        key_version integer DEFAULT 1 NOT NULL,
        last_validated_at timestamp with time zone NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL
      );
    `);
    await db.$client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS organization_llm_provider_credentials_org_key
      ON organization_llm_provider_credentials (organization_id);
    `);
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
        maskedApiKeySuffix: "-key",
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
    expect(storedCredential?.maskedApiKeySuffix).toBe("-key");
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
