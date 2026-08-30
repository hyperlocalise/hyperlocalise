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

import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { mockAudit } from "evlog";
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
import type { WorkosAuthIdentity } from "@/api/auth/workos";
import { db, schema } from "@/lib/database/client";
import { err } from "@/lib/primitives/result/results";
import * as accessTokenAudit from "@/lib/security/access-token-audit";
import {
  ACCESS_TOKEN_AUDIT_ACTIONS,
  ACCESS_TOKEN_REVOKE_REASONS,
} from "@/lib/security/access-token-audit";
import type { JobQueue, TranslationJobEventData } from "@/lib/workflow/types";

import { createApiKeyTestFixture } from "./api-key.fixture";
import type { ApiKeyResponse, ApiKeysResponse } from "./api-key.schema";
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
  getLocalOrganizationId,
  getLocalUserId,
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

async function listApiKeysAs(identity: WorkosAuthIdentity) {
  return client.api.orgs[":organizationSlug"]["api-keys"].$get(
    {
      param: { organizationSlug: identity.organization.slug ?? "missing-slug" },
    },
    { headers: await authHeadersFor(identity) },
  );
}

async function revokeApiKeyAs(identity: WorkosAuthIdentity, apiKeyId: string) {
  return client.api.orgs[":organizationSlug"]["api-keys"][":apiKeyId"].$delete(
    {
      param: {
        organizationSlug: identity.organization.slug ?? "missing-slug",
        apiKeyId,
      },
    },
    { headers: await authHeadersFor(identity) },
  );
}

async function readApiKeyRow(apiKeyId: string) {
  const [row] = await db
    .select({
      revokedAt: schema.organizationApiKeys.revokedAt,
      createdByUserId: schema.organizationApiKeys.createdByUserId,
    })
    .from(schema.organizationApiKeys)
    .where(eq(schema.organizationApiKeys.id, apiKeyId))
    .limit(1);

  return row;
}

describe("apiKeyRoutes", () => {
  it("creates a token owned by the caller and discloses the secret once", async () => {
    const identity = createWorkosIdentity();
    const response = await createApiKeyViaApi(identity, { name: "Production Key" });

    expect(response.status).toBe(201);
    const body = (await response.json()) as ApiKeyResponse;
    expect(body.apiKey.name).toBe("Production Key");
    expect(body.apiKey.key).toMatch(/^hl_/);
    expect(body.apiKey.keyPrefix).toBe(body.apiKey.key.slice(0, 8));
    expect(body.apiKey.owner).toEqual({
      userId: await getLocalUserId(identity.user.workosUserId),
      email: identity.user.email,
      firstName: null,
      lastName: null,
    });

    const listResponse = await listApiKeysAs(identity);
    const listed = ((await listResponse.json()) as ApiKeysResponse).apiKeys.find(
      (key) => key.id === body.apiKey.id,
    );

    expect(Object.keys(listed ?? {}).sort()).toEqual([
      "createdAt",
      "id",
      "keyPrefix",
      "lastUsedAt",
      "name",
      "owner",
      "permissions",
      "revokedAt",
    ]);
    expect(listed?.createdAt).toEqual(expect.any(String));
    expect(listed?.lastUsedAt).toBeNull();
  });

  it("emits a safe pat.created audit record", async () => {
    const captured = mockAudit();
    const identity = createWorkosIdentity();
    const response = await createApiKeyViaApi(identity, { name: "Audited Key" });
    const body = (await response.json()) as ApiKeyResponse;
    const ownerUserId = await getLocalUserId(identity.user.workosUserId);

    expect(response.status).toBe(201);
    const event = captured.assertAudit({
      action: ACCESS_TOKEN_AUDIT_ACTIONS.created,
      actor: { type: "user", id: ownerUserId },
      target: { id: body.apiKey.id },
    });
    expect(event.target).toMatchObject({
      organizationId: await getLocalOrganizationId(identity.organization.workosOrganizationId),
      ownerUserId,
      keyPrefix: body.apiKey.keyPrefix,
    });
    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain(body.apiKey.key);
    expect(serialized).not.toContain(identity.user.email);
    expect(serialized).not.toContain("x-api-key");
    captured.restore();
  });

  it("revokes the token and omits the secret when audit recording fails", async () => {
    const identity = createWorkosIdentity();
    const emitSpy = vi
      .spyOn(accessTokenAudit, "emitPatCreated")
      .mockReturnValueOnce(err({ code: "audit_emit_failed" }));

    const response = await createApiKeyViaApi(identity, { name: "Unrecorded Key" });
    const body = (await response.json()) as { error?: string; apiKey?: { key?: string } };

    expect(response.status).toBe(500);
    expect(body.error).toBe("access_token_audit_failed");
    expect(body.apiKey?.key).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("hl_");

    const rows = await db
      .select({
        name: schema.organizationApiKeys.name,
        revokedAt: schema.organizationApiKeys.revokedAt,
      })
      .from(schema.organizationApiKeys)
      .where(
        eq(
          schema.organizationApiKeys.organizationId,
          await getLocalOrganizationId(identity.organization.workosOrganizationId),
        ),
      );
    const created = rows.find((row) => row.name === "Unrecorded Key");
    expect(created?.revokedAt).not.toBeNull();
    emitSpy.mockRestore();
  });

  it("emits a manual pat.revoked audit record for the acting user", async () => {
    const captured = mockAudit();
    const ownerIdentity = createWorkosIdentity();
    const adminIdentity = createWorkosIdentityForOrganization(ownerIdentity.organization, "admin");
    const createResponse = await createApiKeyViaApi(ownerIdentity, { name: "Revoke Audit" });
    const created = (await createResponse.json()) as ApiKeyResponse;

    expect((await revokeApiKeyAs(adminIdentity, created.apiKey.id)).status).toBe(204);

    const actorUserId = await getLocalUserId(adminIdentity.user.workosUserId);
    const ownerUserId = await getLocalUserId(ownerIdentity.user.workosUserId);

    const event = captured.assertAudit({
      action: ACCESS_TOKEN_AUDIT_ACTIONS.revoked,
      actor: { type: "user", id: actorUserId },
      target: { id: created.apiKey.id },
    });
    expect(event.reason).toBe(ACCESS_TOKEN_REVOKE_REASONS.manual);
    expect(event.target).toMatchObject({
      ownerUserId,
      keyPrefix: created.apiKey.keyPrefix,
    });
    expect(JSON.stringify(event)).not.toContain(created.apiKey.key);
    expect(JSON.stringify(event)).not.toContain(ownerIdentity.user.email);
    captured.restore();
  });

  it("emits pat.revoked only for the revoke that updates the token", async () => {
    const identity = createWorkosIdentity();
    const createResponse = await createApiKeyViaApi(identity, { name: "Idempotent Revoke Audit" });
    const created = (await createResponse.json()) as ApiKeyResponse;
    const captured = mockAudit();

    expect((await revokeApiKeyAs(identity, created.apiKey.id)).status).toBe(204);
    expect((await revokeApiKeyAs(identity, created.apiKey.id)).status).toBe(204);

    const revokedEvents = captured.events.filter(
      (event) => event.action === ACCESS_TOKEN_AUDIT_ACTIONS.revoked,
    );
    expect(revokedEvents).toHaveLength(1);
    expect(revokedEvents[0]).toMatchObject({
      action: ACCESS_TOKEN_AUDIT_ACTIONS.revoked,
      reason: ACCESS_TOKEN_REVOKE_REASONS.manual,
      target: { id: created.apiKey.id },
    });
    captured.restore();
  });

  it("emits a single pat.revoked when two authorized revokes race", async () => {
    const ownerIdentity = createWorkosIdentity();
    const adminIdentity = createWorkosIdentityForOrganization(ownerIdentity.organization, "admin");
    const createResponse = await createApiKeyViaApi(ownerIdentity, { name: "Raced Revoke Audit" });
    const created = (await createResponse.json()) as ApiKeyResponse;
    const captured = mockAudit();

    const [first, second] = await Promise.all([
      revokeApiKeyAs(ownerIdentity, created.apiKey.id),
      revokeApiKeyAs(adminIdentity, created.apiKey.id),
    ]);

    expect(first.status).toBe(204);
    expect(second.status).toBe(204);
    expect(
      captured.events.filter((event) => event.action === ACCESS_TOKEN_AUDIT_ACTIONS.revoked),
    ).toHaveLength(1);
    expect((await readApiKeyRow(created.apiKey.id))?.revokedAt).not.toBeNull();
    captured.restore();
  });

  it("lists the caller's own tokens with owner attribution", async () => {
    const identity = createWorkosIdentity();

    await createApiKeyViaApi(identity, { name: "List Key" });

    const response = await listApiKeysAs(identity);

    expect(response.status).toBe(200);
    const body = (await response.json()) as ApiKeysResponse;
    expect(body.apiKeys).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "List Key",
          owner: expect.objectContaining({ email: identity.user.email }),
        }),
      ]),
    );
  });

  it("returns every token in the workspace to a holder of api_keys:read", async () => {
    const ownerIdentity = createWorkosIdentity();
    const adminIdentity = createWorkosIdentityForOrganization(ownerIdentity.organization, "admin");

    await createApiKeyViaApi(ownerIdentity, { name: "Admin Visible Key" });

    const response = await listApiKeysAs(adminIdentity);

    expect(response.status).toBe(200);
    const body = (await response.json()) as ApiKeysResponse;
    expect(body.apiKeys).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Admin Visible Key",
          owner: expect.objectContaining({ email: ownerIdentity.user.email }),
        }),
      ]),
    );
  });

  it("returns only the caller's own tokens to a member without api_keys:read", async () => {
    const ownerIdentity = createWorkosIdentity();
    const memberIdentity = createWorkosIdentityForOrganization(
      ownerIdentity.organization,
      "member",
    );

    await createApiKeyViaApi(ownerIdentity, { name: "Hidden Key" });
    await authHeadersFor(memberIdentity);
    await insertApiKey({
      organizationId: await getLocalOrganizationId(
        memberIdentity.organization.workosOrganizationId,
      ),
      name: "Member Own Key",
      createdByUserId: await getLocalUserId(memberIdentity.user.workosUserId),
    });

    const response = await listApiKeysAs(memberIdentity);

    expect(response.status).toBe(200);
    const names = ((await response.json()) as ApiKeysResponse).apiKeys.map((key) => key.name);
    expect(names).toContain("Member Own Key");
    expect(names).not.toContain("Hidden Key");
  });

  it("revokes the caller's own token without api_keys:write", async () => {
    const ownerIdentity = createWorkosIdentity();
    const memberIdentity = createWorkosIdentityForOrganization(
      ownerIdentity.organization,
      "member",
    );
    await authHeadersFor(memberIdentity);

    const { apiKey } = await insertApiKey({
      organizationId: await getLocalOrganizationId(
        memberIdentity.organization.workosOrganizationId,
      ),
      name: "Member Own Key",
      createdByUserId: await getLocalUserId(memberIdentity.user.workosUserId),
    });

    const response = await revokeApiKeyAs(memberIdentity, apiKey.id);

    expect(response.status).toBe(204);
    expect((await readApiKeyRow(apiKey.id))?.revokedAt).not.toBeNull();
  });

  it("returns 404 when a member revokes another member's token", async () => {
    const ownerIdentity = createWorkosIdentity();
    const memberIdentity = createWorkosIdentityForOrganization(
      ownerIdentity.organization,
      "member",
    );

    const createResponse = await createApiKeyViaApi(ownerIdentity, { name: "Owner Key" });
    const created = (await createResponse.json()) as ApiKeyResponse;

    const response = await revokeApiKeyAs(memberIdentity, created.apiKey.id);

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: "api_key_not_found",
      message: expect.any(String),
    });
    expect((await readApiKeyRow(created.apiKey.id))?.revokedAt).toBeNull();
  });

  it("revokes another member's token for a holder of api_keys:write", async () => {
    const ownerIdentity = createWorkosIdentity();
    const memberIdentity = createWorkosIdentityForOrganization(
      ownerIdentity.organization,
      "member",
    );
    await authHeadersFor(memberIdentity);

    const { apiKey } = await insertApiKey({
      organizationId: await getLocalOrganizationId(ownerIdentity.organization.workosOrganizationId),
      name: "Member Key",
      createdByUserId: await getLocalUserId(memberIdentity.user.workosUserId),
    });

    const response = await revokeApiKeyAs(ownerIdentity, apiKey.id);

    expect(response.status).toBe(204);
    expect((await readApiKeyRow(apiKey.id))?.revokedAt).not.toBeNull();
  });

  it("returns 404 for a token in another organization", async () => {
    const identityA = createWorkosIdentity();
    const identityB = createWorkosIdentity();

    const createResponse = await createApiKeyViaApi(identityA, { name: "Org A Key" });
    const created = (await createResponse.json()) as ApiKeyResponse;

    const response = await revokeApiKeyAs(identityB, created.apiKey.id);

    expect(response.status).toBe(404);
    expect((await readApiKeyRow(created.apiKey.id))?.revokedAt).toBeNull();
  });

  it("returns 404 for unknown and malformed token ids", async () => {
    const identity = createWorkosIdentity();

    const unknownResponse = await revokeApiKeyAs(identity, randomUUID());
    expect(unknownResponse.status).toBe(404);

    const malformedResponse = await revokeApiKeyAs(identity, "not-a-token-id");
    expect(malformedResponse.status).toBe(404);
    expect(await malformedResponse.json()).toMatchObject({ error: "api_key_not_found" });
  });

  it("keeps the first revocation timestamp when a token is revoked twice", async () => {
    const identity = createWorkosIdentity();

    const createResponse = await createApiKeyViaApi(identity, { name: "Twice Revoked" });
    const created = (await createResponse.json()) as ApiKeyResponse;

    expect((await revokeApiKeyAs(identity, created.apiKey.id)).status).toBe(204);
    const firstRevokedAt = (await readApiKeyRow(created.apiKey.id))?.revokedAt;
    expect(firstRevokedAt).not.toBeNull();

    expect((await revokeApiKeyAs(identity, created.apiKey.id)).status).toBe(204);
    expect((await readApiKeyRow(created.apiKey.id))?.revokedAt).toEqual(firstRevokedAt);
  });

  it("stops authentication as soon as a token is revoked", async () => {
    const identity = createWorkosIdentity();
    await authHeadersFor(identity);

    const { plainKey, apiKey } = await insertApiKey({
      organizationId: await getLocalOrganizationId(identity.organization.workosOrganizationId),
      name: "Revoke During Use",
      createdByUserId: await getLocalUserId(identity.user.workosUserId),
    });

    const beforeRevoke = await client.api.v1.jobs[":jobId"].$get(
      { param: { jobId: `job_${randomUUID()}` } },
      { headers: { "x-api-key": plainKey } },
    );
    expect(beforeRevoke.status).toBe(404);

    expect((await revokeApiKeyAs(identity, apiKey.id)).status).toBe(204);

    const afterRevoke = await client.api.v1.jobs[":jobId"].$get(
      { param: { jobId: `job_${randomUUID()}` } },
      { headers: { "x-api-key": plainKey } },
    );
    expect(afterRevoke.status).toBe(401);
    expect(await afterRevoke.json()).toMatchObject({ error: "unauthorized" });
  });

  it("presents a legacy token with no owner as revoked and hides it from other members", async () => {
    const adminIdentity = createWorkosIdentity();
    const memberIdentity = createWorkosIdentityForOrganization(
      adminIdentity.organization,
      "member",
    );
    await authHeadersFor(adminIdentity);

    const { plainKey, apiKey } = await insertApiKey({
      organizationId: await getLocalOrganizationId(adminIdentity.organization.workosOrganizationId),
      name: "Legacy Key",
    });
    expect((await readApiKeyRow(apiKey.id))?.createdByUserId).toBeNull();

    const adminList = ((await (await listApiKeysAs(adminIdentity)).json()) as ApiKeysResponse)
      .apiKeys;
    const legacyEntry = adminList.find((key) => key.id === apiKey.id);
    expect(legacyEntry?.owner).toBeNull();
    expect(legacyEntry?.revokedAt).toBeTruthy();

    const memberList = ((await (await listApiKeysAs(memberIdentity)).json()) as ApiKeysResponse)
      .apiKeys;
    expect(memberList.map((key) => key.id)).not.toContain(apiKey.id);

    const authResponse = await client.api.v1.jobs[":jobId"].$get(
      { param: { jobId: `job_${randomUUID()}` } },
      { headers: { "x-api-key": plainKey } },
    );
    expect(authResponse.status).toBe(403);
  });

  it("keeps listing and authenticating a pre-existing key created outside the route", async () => {
    const identity = createWorkosIdentity();
    await authHeadersFor(identity);

    const { plainKey, apiKey } = await insertApiKey({
      organizationId: await getLocalOrganizationId(identity.organization.workosOrganizationId),
      name: "Pre-existing Key",
      createdByUserId: await getLocalUserId(identity.user.workosUserId),
    });

    const listed = ((await (await listApiKeysAs(identity)).json()) as ApiKeysResponse).apiKeys.find(
      (key) => key.id === apiKey.id,
    );
    expect(listed?.owner).toEqual(
      expect.objectContaining({ email: identity.user.email, userId: apiKey.createdByUserId }),
    );
    expect(listed?.revokedAt).toBeNull();

    const authResponse = await client.api.v1.jobs[":jobId"].$get(
      { param: { jobId: `job_${randomUUID()}` } },
      { headers: { "x-api-key": plainKey } },
    );
    expect(authResponse.status).toBe(404);
  });

  it("lets a member create a read-only token when permissions are omitted", async () => {
    const ownerIdentity = createWorkosIdentity();
    const memberIdentity = createWorkosIdentityForOrganization(
      ownerIdentity.organization,
      "member",
    );

    const response = await createApiKeyViaApi(memberIdentity, { name: "Member Key" });

    expect(response.status).toBe(201);
    const body = (await response.json()) as ApiKeyResponse;
    expect(body.apiKey.key).toMatch(/^hl_/);
    expect(body.apiKey.permissions).toEqual(["jobs:read", "files:read"]);
    expect(body.apiKey.owner).toEqual(
      expect.objectContaining({ email: memberIdentity.user.email }),
    );
  });

  it("lets a translator create a token with the full grantable set", async () => {
    const ownerIdentity = createWorkosIdentity();
    const translatorIdentity = createWorkosIdentityForOrganization(
      ownerIdentity.organization,
      "translator",
    );

    const response = await createApiKeyViaApi(translatorIdentity, { name: "Translator CLI" });

    expect(response.status).toBe(201);
    const body = (await response.json()) as ApiKeyResponse;
    expect(body.apiKey.permissions).toEqual([
      "jobs:read",
      "jobs:write",
      "files:read",
      "files:write",
    ]);
  });

  it("refuses scopes the caller's role cannot back", async () => {
    const ownerIdentity = createWorkosIdentity();
    const memberIdentity = createWorkosIdentityForOrganization(
      ownerIdentity.organization,
      "member",
    );

    const response = await client.api.orgs[":organizationSlug"]["api-keys"].$post(
      {
        param: { organizationSlug: ownerIdentity.organization.slug ?? "missing-slug" },
        json: { name: "Member Write Key", permissions: ["jobs:read", "jobs:write"] },
      },
      {
        headers: await authHeadersFor(memberIdentity),
      },
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: "api_key_permissions_not_grantable",
      details: { permissions: ["jobs:write"] },
    });
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
      createdByUserId: await getLocalUserId(identity.user.workosUserId),
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
      createdByUserId: await getLocalUserId(identity.user.workosUserId),
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

  it("returns 403 when a member-owned token lists jobs:write", async () => {
    const ownerIdentity = createWorkosIdentity();
    const memberIdentity = createWorkosIdentityForOrganization(
      ownerIdentity.organization,
      "member",
    );
    const projectResponse = await createProjectViaApi(ownerIdentity);
    const project = ((await projectResponse.json()) as { project: { id: string } }).project;
    await authHeadersFor(memberIdentity);

    const [projectRow] = await db
      .select({ teamId: schema.projects.teamId })
      .from(schema.projects)
      .where(eq(schema.projects.id, project.id))
      .limit(1);
    expect(projectRow?.teamId).toBeTruthy();

    await db.insert(schema.teamMemberships).values({
      teamId: projectRow!.teamId!,
      userId: await getLocalUserId(memberIdentity.user.workosUserId),
      role: "member",
    });

    const { plainKey } = await insertApiKey({
      organizationId: await getLocalOrganizationId(ownerIdentity.organization.workosOrganizationId),
      name: "Member Write Key",
      createdByUserId: await getLocalUserId(memberIdentity.user.workosUserId),
      permissions: ["jobs:read", "jobs:write"],
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
    expect(await response.json()).toMatchObject({
      error: "forbidden",
      message: expect.any(String),
    });
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
      createdByUserId: await getLocalUserId(identity.user.workosUserId),
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
      createdByUserId: await getLocalUserId(identityA.user.workosUserId),
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
      createdByUserId: await getLocalUserId(identityB.user.workosUserId),
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
