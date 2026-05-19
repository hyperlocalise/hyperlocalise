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
import type { JobQueue, TranslationJobEventData } from "@/lib/workflow/types";

import { createApiKeyTestFixture } from "./api-key.fixture";
import type { ApiKeyResponse } from "./api-key.schema";
import { createProjectTestFixture } from "../project/project.fixture";

function createInlineTestJobQueue(): JobQueue<TranslationJobEventData> {
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

const apiKeyFixture = createApiKeyTestFixture(client);
const projectFixture = createProjectTestFixture(client);
const {
  createWorkosIdentity,
  createWorkosIdentityForOrganization,
  authHeadersFor,
  createApiKeyViaApi,
  insertApiKey,
} = apiKeyFixture;
const { createProjectViaApi } = projectFixture;

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.clearAllMocks();
  await apiKeyFixture.cleanup();
  await projectFixture.cleanup();
});

describe("apiKeyRoutes", () => {
  it("creates an API key for owner", async () => {
    const identity = createWorkosIdentity();
    const response = await createApiKeyViaApi(identity, { name: "Production Key" });

    expect(response.status).toBe(201);
    const body = (await response.json()) as ApiKeyResponse;
    expect(body.apiKey.name).toBe("Production Key");
    expect(body.apiKey.key).toMatch(/^hl_/);
    expect(body.apiKey.keyPrefix).toBe(body.apiKey.key.slice(0, 8));
  });

  it("lists API keys for the organization", async () => {
    const identity = createWorkosIdentity();
    const headers = await authHeadersFor(identity);

    await createApiKeyViaApi(identity, { name: "List Key" });

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

  it("returns 200 when an admin lists API keys", async () => {
    const ownerIdentity = createWorkosIdentity();
    const adminIdentity = createWorkosIdentityForOrganization(ownerIdentity.organization, "admin");

    await createApiKeyViaApi(ownerIdentity, { name: "Admin Visible Key" });

    const response = await client.api.orgs[":organizationSlug"]["api-keys"].$get(
      {
        param: { organizationSlug: ownerIdentity.organization.slug ?? "missing-slug" },
      },
      {
        headers: await authHeadersFor(adminIdentity),
      },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { apiKeys: Array<{ name: string }> };
    expect(body.apiKeys).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Admin Visible Key" })]),
    );
  });

  it("returns 403 when a member lists API keys", async () => {
    const ownerIdentity = createWorkosIdentity();
    const memberIdentity = createWorkosIdentityForOrganization(
      ownerIdentity.organization,
      "member",
    );

    await createApiKeyViaApi(ownerIdentity, { name: "Hidden Key" });

    const response = await client.api.orgs[":organizationSlug"]["api-keys"].$get(
      {
        param: { organizationSlug: ownerIdentity.organization.slug ?? "missing-slug" },
      },
      {
        headers: await authHeadersFor(memberIdentity),
      },
    );

    expect(response.status).toBe(403);
    const responseBody = await response.json();
    expect(responseBody).toMatchObject({ error: "forbidden", message: expect.any(String) });
  });

  it("revokes an API key", async () => {
    const identity = createWorkosIdentity();
    const headers = await authHeadersFor(identity);

    const createResponse = await createApiKeyViaApi(identity, { name: "To Revoke" });

    const createBody = (await createResponse.json()) as ApiKeyResponse;

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
    const responseBody = await response.json();
    expect(responseBody).toMatchObject({ error: "forbidden", message: expect.any(String) });
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
    const responseBody = await response.json();
    expect(responseBody).toMatchObject({ error: "unauthorized", message: expect.any(String) });
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
    const responseBody = await response.json();
    expect(responseBody).toMatchObject({ error: "unauthorized", message: expect.any(String) });
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
    const responseBody = await response.json();
    expect(responseBody).toMatchObject({ error: "forbidden", message: expect.any(String) });
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
    const notFoundBody = (await getResponse.json()) as unknown as {
      error: string;
      message?: string;
    };
    expect(notFoundBody.error).toBe("job_not_found");
    expect(notFoundBody.message).toBeDefined();
  });
});
