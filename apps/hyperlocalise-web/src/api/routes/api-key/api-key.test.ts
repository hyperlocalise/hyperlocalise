import "dotenv/config";

import { eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

const { resolveApiAuthContextFromSessionMock } = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(() => globalThis.__testApiAuthContext ?? null),
}));

vi.mock("@/api/auth/workos-session", () => ({
  resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
}));

import { createApp } from "@/api/app";
import { db, schema } from "@/lib/database";
import { generateApiKey, hashApiKey, getApiKeyPrefix } from "@/lib/api-keys";
import type { TranslationJobQueue } from "@/lib/workflow/types";
import { createProjectTestFixture } from "../project/project.fixture";

function createInlineTestJobQueue(): TranslationJobQueue {
  return {
    async enqueue(event) {
      return { ids: [event.jobId] };
    },
  };
}

const client = testClient(
  createApp({
    jobQueue: createInlineTestJobQueue(),
  }),
);

const projectFixture = createProjectTestFixture(client);
const {
  cleanup,
  createProjectViaApi,
  createWorkosIdentity,
  createWorkosIdentityForOrganization,
  authHeadersFor,
} = projectFixture;

async function insertApiKey(params: {
  organizationId: string;
  name: string;
  createdByUserId?: string;
  permissions?: string[];
  revokedAt?: Date;
}) {
  const plainKey = generateApiKey();
  const keyHash = hashApiKey(plainKey);
  const keyPrefix = getApiKeyPrefix(plainKey);

  const [apiKey] = await db
    .insert(schema.organizationApiKeys)
    .values({
      organizationId: params.organizationId,
      name: params.name,
      keyHash,
      keyPrefix,
      permissions: params.permissions ?? ["jobs:read", "jobs:write"],
      createdByUserId: params.createdByUserId ?? null,
      revokedAt: params.revokedAt ?? null,
    })
    .returning();

  return { plainKey, apiKey };
}

async function ensureOrganizationApiKeysTestSchema() {
  await db.$client.query(`
    CREATE TABLE IF NOT EXISTS organization_api_keys (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE cascade,
      name text NOT NULL,
      key_hash text NOT NULL,
      key_prefix text NOT NULL,
      permissions jsonb DEFAULT '["jobs:read", "jobs:write"]'::jsonb NOT NULL,
      created_by_user_id uuid REFERENCES users(id) ON DELETE set null,
      last_used_at timestamp with time zone,
      revoked_at timestamp with time zone,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL
    )
  `);
  await db.$client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS organization_api_keys_key_hash_key ON organization_api_keys USING btree (key_hash)
  `);
  await db.$client.query(`
    CREATE INDEX IF NOT EXISTS idx_organization_api_keys_org ON organization_api_keys USING btree (organization_id)
  `);
  await db.$client.query(`
    CREATE INDEX IF NOT EXISTS idx_organization_api_keys_created_at ON organization_api_keys USING btree (created_at)
  `);

  // Ensure jobs table has the api_key_id column for tests
  await db.$client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'jobs' AND column_name = 'api_key_id'
      ) THEN
        ALTER TABLE jobs ADD COLUMN api_key_id uuid;
      END IF;
    END $$;
  `);
}

beforeAll(async () => {
  await db.$client.query("select 1");
  await ensureOrganizationApiKeysTestSchema();
});

afterEach(async () => {
  vi.clearAllMocks();
  await cleanup();
});

describe("apiKeyRoutes", () => {
  it("creates an API key for owner", async () => {
    const identity = createWorkosIdentity();
    await authHeadersFor(identity);

    const response = await client.api.orgs[":organizationSlug"]["api-keys"].$post(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug" },
        json: { name: "Production Key" },
      },
      {
        headers: await authHeadersFor(identity),
      },
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      apiKey: { id: string; name: string; key: string; keyPrefix: string };
    };
    expect(body.apiKey.name).toBe("Production Key");
    expect(body.apiKey.key).toMatch(/^hl_/);
    expect(body.apiKey.keyPrefix).toBe(body.apiKey.key.slice(0, 8));
  });

  it("lists API keys for the organization", async () => {
    const identity = createWorkosIdentity();
    const headers = await authHeadersFor(identity);

    // Create a key first
    await client.api.orgs[":organizationSlug"]["api-keys"].$post(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug" },
        json: { name: "List Key" },
      },
      { headers },
    );

    const response = await client.api.orgs[":organizationSlug"]["api-keys"].$get(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug" },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { apiKeys: Array<{ name: string }> };
    expect(body.apiKeys).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "List Key" })]),
    );
  });

  it("revokes an API key", async () => {
    const identity = createWorkosIdentity();
    const headers = await authHeadersFor(identity);

    const createResponse = await client.api.orgs[":organizationSlug"]["api-keys"].$post(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug" },
        json: { name: "To Revoke" },
      },
      { headers },
    );

    const createBody = (await createResponse.json()) as {
      apiKey: { id: string };
    };

    const deleteResponse = await client.api.orgs[":organizationSlug"]["api-keys"][
      ":apiKeyId"
    ].$delete(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          apiKeyId: createBody.apiKey.id,
        },
      },
      { headers },
    );

    expect(deleteResponse.status).toBe(204);

    const keys = await db
      .select({ revokedAt: schema.organizationApiKeys.revokedAt })
      .from(schema.organizationApiKeys)
      .where(eq(schema.organizationApiKeys.id, createBody.apiKey.id));

    expect(keys[0]?.revokedAt).not.toBeNull();
  });

  it("returns 403 when a member creates an API key", async () => {
    const ownerIdentity = createWorkosIdentity();
    const memberIdentity = createWorkosIdentityForOrganization(
      ownerIdentity.organization,
      "member",
    );

    const response = await client.api.orgs[":organizationSlug"]["api-keys"].$post(
      {
        param: { organizationSlug: ownerIdentity.organization.slug ?? "missing-slug" },
        json: { name: "Member Key" },
      },
      {
        headers: await authHeadersFor(memberIdentity),
      },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "forbidden" });
  });
});

describe("publicJobRoutes", () => {
  it("creates a string translation job with an API key", async () => {
    const identity = createWorkosIdentity();
    const projectResponse = await createProjectViaApi(identity);
    const project = ((await projectResponse.json()) as { project: { id: string } }).project;

    // Need to get the local organization id
    const [org] = await db
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .where(
        eq(schema.organizations.workosOrganizationId, identity.organization.workosOrganizationId),
      )
      .limit(1);

    const { plainKey } = await insertApiKey({
      organizationId: org.id,
      name: "Test Key",
    });

    const response = await client.api.v1.jobs.$post(
      {
        json: {
          type: "string",
          projectId: project.id,
          stringInput: {
            sourceText: "Hello world",
            sourceLocale: "en-US",
            targetLocales: ["fr-FR"],
          },
        },
      },
      {
        headers: { "x-api-key": plainKey },
      },
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as { job: { id: string; status: string; type: string } };
    expect(body.job.id).toMatch(/^job_/);
    expect(body.job.status).toBe("queued");
    expect(body.job.type).toBe("string");
  });

  it("gets a job by id with an API key", async () => {
    const identity = createWorkosIdentity();
    const projectResponse = await createProjectViaApi(identity);
    const project = ((await projectResponse.json()) as { project: { id: string } }).project;

    const [org] = await db
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .where(
        eq(schema.organizations.workosOrganizationId, identity.organization.workosOrganizationId),
      )
      .limit(1);

    const { plainKey } = await insertApiKey({
      organizationId: org.id,
      name: "Test Key",
    });

    const createResponse = await client.api.v1.jobs.$post(
      {
        json: {
          type: "string",
          projectId: project.id,
          stringInput: {
            sourceText: "Hello world",
            sourceLocale: "en-US",
            targetLocales: ["fr-FR"],
          },
        },
      },
      {
        headers: { "x-api-key": plainKey },
      },
    );

    const createBody = (await createResponse.json()) as { job: { id: string } };

    const getResponse = await client.api.v1.jobs[":jobId"].$get(
      {
        param: { jobId: createBody.job.id },
      },
      {
        headers: { "x-api-key": plainKey },
      },
    );

    expect(getResponse.status).toBe(200);
    const body = (await getResponse.json()) as { job: { id: string; status: string } };
    expect(body.job.id).toBe(createBody.job.id);
  });

  it("returns 401 without an API key", async () => {
    const response = await client.api.v1.jobs.$post({
      json: {
        type: "string",
        projectId: "project_123",
        stringInput: {
          sourceText: "Hello",
          sourceLocale: "en-US",
          targetLocales: ["fr-FR"],
        },
      },
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "unauthorized" });
  });

  it("returns 401 with a revoked API key", async () => {
    const identity = createWorkosIdentity();
    await authHeadersFor(identity);
    const [org] = await db
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .where(
        eq(schema.organizations.workosOrganizationId, identity.organization.workosOrganizationId),
      )
      .limit(1);

    const { plainKey } = await insertApiKey({
      organizationId: org!.id,
      name: "Revoked Key",
      revokedAt: new Date(),
    });

    const response = await client.api.v1.jobs.$post(
      {
        json: {
          type: "string",
          projectId: "project_123",
          stringInput: {
            sourceText: "Hello",
            sourceLocale: "en-US",
            targetLocales: ["fr-FR"],
          },
        },
      },
      {
        headers: { "x-api-key": plainKey },
      },
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "unauthorized" });
  });

  it("returns 403 when API key lacks jobs:write permission", async () => {
    const identity = createWorkosIdentity();
    const projectResponse = await createProjectViaApi(identity);
    const project = ((await projectResponse.json()) as { project: { id: string } }).project;

    const [org] = await db
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .where(
        eq(schema.organizations.workosOrganizationId, identity.organization.workosOrganizationId),
      )
      .limit(1);

    const { plainKey } = await insertApiKey({
      organizationId: org.id,
      name: "Readonly Key",
      permissions: ["jobs:read"],
    });

    const response = await client.api.v1.jobs.$post(
      {
        json: {
          type: "string",
          projectId: project.id,
          stringInput: {
            sourceText: "Hello",
            sourceLocale: "en-US",
            targetLocales: ["fr-FR"],
          },
        },
      },
      {
        headers: { "x-api-key": plainKey },
      },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "forbidden" });
  });

  it("returns 404 for a job in another organization", async () => {
    const identityA = createWorkosIdentity();
    const projectResponse = await createProjectViaApi(identityA);
    const project = ((await projectResponse.json()) as { project: { id: string } }).project;

    const [orgA] = await db
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .where(
        eq(schema.organizations.workosOrganizationId, identityA.organization.workosOrganizationId),
      )
      .limit(1);

    const { plainKey: keyA } = await insertApiKey({
      organizationId: orgA.id,
      name: "Key A",
    });

    const createResponse = await client.api.v1.jobs.$post(
      {
        json: {
          type: "string",
          projectId: project.id,
          stringInput: {
            sourceText: "Hello",
            sourceLocale: "en-US",
            targetLocales: ["fr-FR"],
          },
        },
      },
      {
        headers: { "x-api-key": keyA },
      },
    );

    const createBody = (await createResponse.json()) as { job: { id: string } };

    // Different org
    const identityB = createWorkosIdentity();
    await authHeadersFor(identityB);
    const [orgB] = await db
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .where(
        eq(schema.organizations.workosOrganizationId, identityB.organization.workosOrganizationId),
      )
      .limit(1);

    const { plainKey: keyB } = await insertApiKey({
      organizationId: orgB!.id,
      name: "Key B",
    });

    const getResponse = await client.api.v1.jobs[":jobId"].$get(
      {
        param: { jobId: createBody.job.id },
      },
      {
        headers: { "x-api-key": keyB },
      },
    );

    expect(getResponse.status).toBe(404);
    await expect(getResponse.json()).resolves.toEqual({ error: "job_not_found" });
  });
});
