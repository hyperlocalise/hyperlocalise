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
import { testClient } from "hono/testing";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createApp } from "@/api/app";
import type { AppType } from "@/api/typed-app";
import {
  apiKeyAuthLogContext,
  INVALID_OR_REVOKED_API_KEY_MESSAGE,
  touchApiKeyLastUsedAt,
} from "@/api/auth/api-key";
import { revokeOrganizationMembershipAccess } from "@/api/auth/workos-sync";
import {
  cleanupPublicApiFixture,
  createPublicApiFixture,
  hashApiKey,
} from "@/api/routes/public-jobs/public-jobs.fixture";
import { setMembershipReplacingSentinelForTest } from "@/api/test-cleanup";
import { db, schema } from "@/lib/database/client";
import type { TranslationJobEventData } from "@/lib/workflow/types";

const { reconcileWorkosMembershipsForUserMock } = vi.hoisted(() => ({
  reconcileWorkosMembershipsForUserMock: vi.fn(),
}));

vi.mock("@/api/auth/workos-membership-reconcile", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-membership-reconcile")>();

  return {
    ...actual,
    reconcileWorkosMembershipsForUser: reconcileWorkosMembershipsForUserMock,
  };
});

const enqueueJob = vi.fn(async (event: TranslationJobEventData) => ({
  ids: [event.jobId],
}));

const client = testClient<AppType>(
  createApp({
    jobQueue: {
      enqueue: enqueueJob,
    },
  }),
);

beforeAll(async () => {
  await db.$client.query("select 1");
});

beforeEach(() => {
  reconcileWorkosMembershipsForUserMock.mockResolvedValue({ status: "skipped" });
});

afterEach(async () => {
  reconcileWorkosMembershipsForUserMock.mockClear();
  enqueueJob.mockClear();
  await cleanupPublicApiFixture();
});

function createStringJob(apiKey: string, projectId: string) {
  return client.api.v1.jobs.$post(
    {
      json: {
        type: "string",
        projectId,
        stringInput: {
          sourceText: "Hello",
          sourceLocale: "en-US",
          targetLocales: ["fr-FR"],
        },
      },
    },
    { headers: { "x-api-key": apiKey } },
  );
}

describe("apiKeyAuthMiddleware", () => {
  it("rejects API keys for archived workspaces", async () => {
    const { apiKey, project } = await createPublicApiFixture();

    await db
      .update(schema.organizations)
      .set({ lifecycleStatus: "archived", archivedAt: new Date() })
      .where(eq(schema.organizations.id, project.organizationId));

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
      { headers: { "x-api-key": apiKey } },
    );

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("workspace_archived");
  });

  it("rejects API keys while invite replacement sentinel is set", async () => {
    const { apiKey, project } = await createPublicApiFixture();

    const [membership] = await db
      .select({
        organizationId: schema.organizationMemberships.organizationId,
        userId: schema.organizationMemberships.userId,
      })
      .from(schema.organizationMemberships)
      .where(eq(schema.organizationMemberships.organizationId, project.organizationId))
      .limit(1);

    expect(membership).toBeDefined();

    await setMembershipReplacingSentinelForTest(db, {
      organizationId: membership!.organizationId,
      userId: membership!.userId,
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
      { headers: { "x-api-key": apiKey } },
    );

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("forbidden");
  });

  it("fails closed when WorkOS membership lookup fails without a fresh reconcile timestamp", async () => {
    const { apiKey, project } = await createPublicApiFixture();
    reconcileWorkosMembershipsForUserMock.mockResolvedValueOnce({
      status: "lookup_failed",
      lastReconciledAt: null,
    });

    const response = await createStringJob(apiKey, project.id);

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("forbidden");
    expect(reconcileWorkosMembershipsForUserMock).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        workosUserId: expect.any(String),
      }),
    );
  });

  it("allows API keys when WorkOS lookup fails but the reconcile timestamp is fresh", async () => {
    const { apiKey, project } = await createPublicApiFixture();
    reconcileWorkosMembershipsForUserMock.mockResolvedValueOnce({
      status: "lookup_failed",
      lastReconciledAt: new Date(),
    });

    const response = await createStringJob(apiKey, project.id);

    expect(response.status).toBe(201);
    const body = (await response.json()) as { job: { status: string } };
    expect(body.job).toMatchObject({
      status: "queued",
    });
    expect(enqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: project.id,
      }),
    );
  });

  it("rejects API keys when the creator lacks an authoritative WorkOS membership", async () => {
    const { apiKey, project } = await createPublicApiFixture();

    await db
      .update(schema.organizationMemberships)
      .set({ workosMembershipId: null })
      .where(eq(schema.organizationMemberships.organizationId, project.organizationId));

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
      { headers: { "x-api-key": apiKey } },
    );

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("forbidden");
  });

  it("rejects API keys after membership revocation revokes the key", async () => {
    const { apiKey, project } = await createPublicApiFixture();

    const [membership] = await db
      .select({
        organizationId: schema.organizationMemberships.organizationId,
        userId: schema.organizationMemberships.userId,
        workosMembershipId: schema.organizationMemberships.workosMembershipId,
        workosOrganizationId: schema.organizations.workosOrganizationId,
        workosUserId: schema.users.workosUserId,
      })
      .from(schema.organizationMemberships)
      .innerJoin(schema.users, eq(schema.organizationMemberships.userId, schema.users.id))
      .innerJoin(
        schema.organizations,
        eq(schema.organizationMemberships.organizationId, schema.organizations.id),
      )
      .where(eq(schema.organizationMemberships.organizationId, project.organizationId))
      .limit(1);

    expect(membership?.workosMembershipId).toBeTruthy();

    const result = await revokeOrganizationMembershipAccess(db, {
      workosMembershipId: membership!.workosMembershipId!,
      workosOrganizationId: membership!.workosOrganizationId,
      workosUserId: membership!.workosUserId,
    });

    expect(result.apiKeysRevoked).toBe(1);

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
      { headers: { "x-api-key": apiKey } },
    );

    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("unauthorized");

    const [keyRecord] = await db
      .select({ revokedAt: schema.organizationApiKeys.revokedAt })
      .from(schema.organizationApiKeys)
      .where(
        and(
          eq(schema.organizationApiKeys.organizationId, project.organizationId),
          eq(schema.organizationApiKeys.keyHash, hashApiKey(apiKey)),
        ),
      )
      .limit(1);

    expect(keyRecord?.revokedAt).not.toBeNull();
  });

  it("rejects unknown, revoked, and ownerless tokens with the same 401", async () => {
    const { apiKey, apiKeyId, project } = await createPublicApiFixture();
    const expected = {
      error: "unauthorized",
      message: INVALID_OR_REVOKED_API_KEY_MESSAGE,
    };

    const unknownResponse = await createStringJob("hl_unknown_token_does_not_exist", project.id);
    expect(unknownResponse.status).toBe(401);
    await expect(unknownResponse.json()).resolves.toMatchObject(expected);

    await db
      .update(schema.organizationApiKeys)
      .set({ revokedAt: new Date() })
      .where(eq(schema.organizationApiKeys.id, apiKeyId));

    const revokedResponse = await createStringJob(apiKey, project.id);
    expect(revokedResponse.status).toBe(401);
    await expect(revokedResponse.json()).resolves.toMatchObject(expected);

    await db
      .update(schema.organizationApiKeys)
      .set({ revokedAt: null, createdByUserId: null })
      .where(eq(schema.organizationApiKeys.id, apiKeyId));

    const ownerlessResponse = await createStringJob(apiKey, project.id);
    expect(ownerlessResponse.status).toBe(401);
    await expect(ownerlessResponse.json()).resolves.toMatchObject(expected);
  });

  it("rejects a token after its owner user row is removed", async () => {
    const { apiKey, project, user } = await createPublicApiFixture();

    await db.delete(schema.users).where(eq(schema.users.id, user.id));

    const response = await createStringJob(apiKey, project.id);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: "unauthorized",
      message: INVALID_OR_REVOKED_API_KEY_MESSAGE,
    });
  });

  it("denies jobs:write when the token scope does not include it", async () => {
    const { apiKey, project } = await createPublicApiFixture({
      permissions: ["jobs:read"],
    });

    const response = await createStringJob(apiKey, project.id);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: "forbidden" });
  });

  it("denies jobs:write when the owner's current role cannot back the scope", async () => {
    const { apiKey, project } = await createPublicApiFixture({
      permissions: ["jobs:read", "jobs:write"],
      role: "member",
    });

    const response = await createStringJob(apiKey, project.id);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: "forbidden" });
  });

  it("applies a role downgrade on the next authenticated request", async () => {
    const { apiKey, project, user } = await createPublicApiFixture({
      permissions: ["jobs:read", "jobs:write"],
      role: "admin",
    });

    const allowed = await createStringJob(apiKey, project.id);
    expect(allowed.status).toBe(201);

    await db
      .update(schema.organizationMemberships)
      .set({ role: "member" })
      .where(
        and(
          eq(schema.organizationMemberships.organizationId, project.organizationId),
          eq(schema.organizationMemberships.userId, user.id),
        ),
      );

    const denied = await createStringJob(apiKey, project.id);
    expect(denied.status).toBe(403);
    await expect(denied.json()).resolves.toMatchObject({ error: "forbidden" });
  });

  it("does not grant broader runtime access after the owner loses api_keys:write", async () => {
    const { apiKey, project, user } = await createPublicApiFixture({
      permissions: ["jobs:read", "jobs:write"],
      role: "admin",
    });

    const [team] = await db
      .insert(schema.teams)
      .values({
        organizationId: project.organizationId,
        name: "Runtime Access Team",
        slug: `runtime-access-${user.id.slice(0, 8)}`,
      })
      .returning();
    expect(team).toBeDefined();

    await db
      .update(schema.projects)
      .set({ teamId: team!.id })
      .where(eq(schema.projects.id, project.id));

    await db.insert(schema.teamMemberships).values({
      teamId: team!.id,
      userId: user.id,
      role: "member",
    });

    await db
      .update(schema.organizationMemberships)
      .set({ role: "translator" })
      .where(
        and(
          eq(schema.organizationMemberships.organizationId, project.organizationId),
          eq(schema.organizationMemberships.userId, user.id),
        ),
      );

    const response = await createStringJob(apiKey, project.id);
    expect(response.status).toBe(201);
  });

  it("updates lastUsedAt only after successful authentication", async () => {
    const { apiKey, apiKeyId, project } = await createPublicApiFixture();

    const rejected = await createStringJob("hl_unknown_token_does_not_exist", project.id);
    expect(rejected.status).toBe(401);

    const [untouched] = await db
      .select({ lastUsedAt: schema.organizationApiKeys.lastUsedAt })
      .from(schema.organizationApiKeys)
      .where(eq(schema.organizationApiKeys.id, apiKeyId))
      .limit(1);
    expect(untouched?.lastUsedAt).toBeNull();

    const allowed = await createStringJob(apiKey, project.id);
    expect(allowed.status).toBe(201);

    await vi.waitFor(async () => {
      const [touched] = await db
        .select({ lastUsedAt: schema.organizationApiKeys.lastUsedAt })
        .from(schema.organizationApiKeys)
        .where(eq(schema.organizationApiKeys.id, apiKeyId))
        .limit(1);
      expect(touched?.lastUsedAt).toBeInstanceOf(Date);
    });
  });

  it("does not update lastUsedAt for a revoked credential", async () => {
    const { apiKey, project } = await createPublicApiFixture();

    await db
      .update(schema.organizationApiKeys)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(schema.organizationApiKeys.organizationId, project.organizationId),
          eq(schema.organizationApiKeys.keyHash, hashApiKey(apiKey)),
        ),
      );

    const response = await createStringJob(apiKey, project.id);
    expect(response.status).toBe(401);

    const [keyRecord] = await db
      .select({ lastUsedAt: schema.organizationApiKeys.lastUsedAt })
      .from(schema.organizationApiKeys)
      .where(
        and(
          eq(schema.organizationApiKeys.organizationId, project.organizationId),
          eq(schema.organizationApiKeys.keyHash, hashApiKey(apiKey)),
        ),
      )
      .limit(1);

    expect(keyRecord?.lastUsedAt).toBeNull();
  });
});

describe("apiKeyAuthLogContext", () => {
  it("binds only opaque ids and the safe prefix", () => {
    const context = apiKeyAuthLogContext({
      id: "token_123",
      organizationId: "org_123",
      createdByUserId: "user_123",
      keyPrefix: "hl_AbCd",
    });

    expect(context).toEqual({
      auth: {
        apiKeyId: "token_123",
        localOrganizationId: "org_123",
        localUserId: "user_123",
        keyPrefix: "hl_AbCd",
      },
    });
    expect(JSON.stringify(context)).not.toContain("@");
    expect(JSON.stringify(context)).not.toContain("x-api-key");
  });
});

describe("touchApiKeyLastUsedAt", () => {
  it("swallows write failures so authentication is not delayed", async () => {
    const updateSpy = vi.spyOn(db, "update").mockImplementation(
      () =>
        ({
          set: () => ({
            where: () => ({
              execute: () => Promise.reject(new Error("hl_must_not_escape")),
            }),
          }),
        }) as never,
    );

    expect(() => touchApiKeyLastUsedAt("token_123")).not.toThrow();
    await Promise.resolve();
    updateSpy.mockRestore();
  });
});
