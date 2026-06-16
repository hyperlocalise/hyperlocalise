import "dotenv/config";

import { randomUUID } from "node:crypto";

import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { app } from "@/api/app";
import { db, schema } from "@/lib/database";
import { upsertExternalTmsJobRecords } from "@/lib/projects/upsert-external-tms-job-records";

import { createProjectTestFixture } from "./project.fixture";
import type { WorkspaceJobsResponse } from "./job.schema";

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

const client = testClient(app);
const projectFixture = createProjectTestFixture(client);

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.clearAllMocks();
  await projectFixture.cleanup();
});

async function insertNativeJob(input: {
  organizationId: string;
  projectId: string;
  createdByUserId?: string | null;
  ownerUserId?: string | null;
}) {
  return db
    .insert(schema.jobs)
    .values({
      id: `job_${randomUUID()}`,
      organizationId: input.organizationId,
      projectId: input.projectId,
      createdByUserId: input.createdByUserId ?? null,
      ownerUserId: input.ownerUserId ?? null,
      kind: "translation",
      status: "queued",
      inputPayload: {
        sourceText: "Hello",
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
      },
    })
    .returning();
}

describe("workspace job list", () => {
  it("filters assigned and created jobs for the current user", async () => {
    const { identity, organization, project, user } =
      await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);

    const [createdNativeJob] = await insertNativeJob({
      organizationId: organization.id,
      projectId: project.id,
      createdByUserId: user.id,
    });
    const [ownedNativeJob] = await insertNativeJob({
      organizationId: organization.id,
      projectId: project.id,
      ownerUserId: user.id,
    });
    const [otherNativeJob] = await insertNativeJob({
      organizationId: organization.id,
      projectId: project.id,
    });

    await upsertExternalTmsJobRecords({
      organizationId: organization.id,
      projectId: project.id,
      providerKind: "crowdin",
      externalProjectId: "crowdin-project",
      tasks: [
        {
          externalJobId: "assigned-to-current-user",
          externalStatus: "todo",
          title: "Assigned to current user",
          assignedUsers: [identity.user.email.toUpperCase()],
        },
        {
          externalJobId: "assigned-to-other-user",
          externalStatus: "todo",
          title: "Assigned to other user",
          assignedUsers: ["someone-else@example.com"],
        },
      ],
    });

    const assignedResponse = await client.api.orgs[":organizationSlug"].jobs.$get(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug" },
        query: { relationship: "assigned", limit: "100" },
      },
      { headers },
    );

    expect(assignedResponse.status).toBe(200);
    const assignedBody = (await assignedResponse.json()) as WorkspaceJobsResponse;
    const assignedJobIds = assignedBody.jobs.map((job) => job.id);

    expect(assignedJobIds).toEqual(
      expect.arrayContaining([
        expect.stringContaining("assigned-to-current-user"),
        ownedNativeJob.id,
      ]),
    );
    expect(assignedJobIds).not.toEqual(expect.arrayContaining([createdNativeJob.id]));
    expect(assignedJobIds).not.toEqual(expect.arrayContaining([otherNativeJob.id]));
    expect(assignedJobIds).not.toEqual(
      expect.arrayContaining([expect.stringContaining("other-user")]),
    );

    const createdResponse = await client.api.orgs[":organizationSlug"].jobs.$get(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug" },
        query: { relationship: "created", limit: "100" },
      },
      { headers },
    );

    expect(createdResponse.status).toBe(200);
    const createdBody = (await createdResponse.json()) as WorkspaceJobsResponse;
    const createdJobIds = createdBody.jobs.map((job) => job.id);

    expect(createdJobIds).toEqual(expect.arrayContaining([createdNativeJob.id]));
    expect(createdJobIds).not.toEqual(expect.arrayContaining([ownedNativeJob.id]));
    expect(createdJobIds).not.toEqual(
      expect.arrayContaining([expect.stringContaining("assigned-to-current-user")]),
    );
  });
});
