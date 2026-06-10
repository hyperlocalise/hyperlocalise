import "dotenv/config";

import { and, eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createApp } from "@/api/app";
import { revokeOrganizationMembershipAccess } from "@/api/auth/workos-sync";
import {
  cleanupPublicApiFixture,
  createPublicApiFixture,
  hashApiKey,
} from "@/api/routes/public-jobs/public-jobs.fixture";
import { setMembershipReplacingSentinelForTest } from "@/api/test-cleanup";
import { db, schema } from "@/lib/database";
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

const client = testClient(
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
});
