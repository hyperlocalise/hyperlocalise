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
  it("includes synced provider jobs assigned to the current provider user in My Jobs", async () => {
    const { identity, organization, project, user } =
      await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);

    await insertNativeJob({
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

    const response = await client.api.orgs[":organizationSlug"].jobs.$get(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug" },
        query: { mine: "true", limit: "100" },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as WorkspaceJobsResponse;
    const jobIds = body.jobs.map((job) => job.id);

    expect(jobIds).toEqual(
      expect.arrayContaining([
        expect.stringContaining("assigned-to-current-user"),
        ownedNativeJob.id,
      ]),
    );
    expect(jobIds).not.toEqual(expect.arrayContaining([otherNativeJob.id]));
    expect(jobIds).not.toEqual(expect.arrayContaining([expect.stringContaining("other-user")]));
  });
});
