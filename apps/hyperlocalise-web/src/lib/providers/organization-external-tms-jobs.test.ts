import "dotenv/config";

import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { db, schema } from "@/lib/database";

import { createProjectTestFixture } from "../../api/routes/project/project.fixture";
import {
  getExternalJobByProviderJobId,
  linkExternalJobToNativeJob,
  unlinkExternalJobFromNativeJob,
  upsertExternalJob,
} from "./organization-external-tms-jobs";

const projectFixture = createProjectTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await projectFixture.cleanup();
});

async function createTestProject() {
  const { project } = await projectFixture.createStoredProjectFixture();
  return project;
}

describe("upsertExternalJob", () => {
  it("creates a new external job when none exists", async () => {
    const project = await createTestProject();

    const result = await upsertExternalJob({
      organizationId: project.organizationId,
      projectId: project.id,
      providerKind: "crowdin",
      externalJobId: "crowdin_job_123",
      externalStatus: "in_progress",
      title: "Translate homepage",
      targetLocales: ["fr-FR", "de-DE"],
      assignedUsers: ["translator@example.com"],
      externalUrl: "https://crowdin.com/project/demo/123",
      providerPayload: { progress: 50 },
    });

    expect(result.id).toMatch(/^job_/);
    expect(result.status).toBe("running");
    expect(result.kind).toBe("translation");
    expect(result.projectId).toBe(project.id);
    expect(result.externalDetails).toMatchObject({
      providerKind: "crowdin",
      externalJobId: "crowdin_job_123",
      externalStatus: "in_progress",
      title: "Translate homepage",
      targetLocales: ["fr-FR", "de-DE"],
      assignedUsers: ["translator@example.com"],
      externalUrl: "https://crowdin.com/project/demo/123",
      syncState: "synced",
      providerPayload: { progress: 50 },
    });
  });

  it("updates an existing external job idempotently", async () => {
    const project = await createTestProject();

    const first = await upsertExternalJob({
      organizationId: project.organizationId,
      projectId: project.id,
      providerKind: "crowdin",
      externalJobId: "crowdin_job_456",
      externalStatus: "todo",
      title: "Initial title",
    });

    const second = await upsertExternalJob({
      organizationId: project.organizationId,
      projectId: project.id,
      providerKind: "crowdin",
      externalJobId: "crowdin_job_456",
      externalStatus: "done",
      title: "Updated title",
      targetLocales: ["ja-JP"],
    });

    expect(second.id).toBe(first.id);
    expect(second.status).toBe("succeeded");
    expect(second.externalDetails?.externalStatus).toBe("done");
    expect(second.externalDetails?.title).toBe("Updated title");
    expect(second.externalDetails?.targetLocales).toEqual(["ja-JP"]);
    expect(second.completedAt).toBeTruthy();

    // Verify only one job record exists.
    const jobs = await db
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .where(eq(schema.jobs.projectId, project.id));

    expect(jobs).toHaveLength(1);
  });

  it("sets completedAt for terminal statuses", async () => {
    const project = await createTestProject();

    const succeeded = await upsertExternalJob({
      organizationId: project.organizationId,
      projectId: project.id,
      providerKind: "crowdin",
      externalJobId: "job_succeeded",
      externalStatus: "done",
    });
    expect(succeeded.completedAt).toBeTruthy();

    const failed = await upsertExternalJob({
      organizationId: project.organizationId,
      projectId: project.id,
      providerKind: "crowdin",
      externalJobId: "job_failed",
      externalStatus: "failed",
    });
    expect(failed.completedAt).toBeTruthy();

    const cancelled = await upsertExternalJob({
      organizationId: project.organizationId,
      projectId: project.id,
      providerKind: "crowdin",
      externalJobId: "job_cancelled",
      externalStatus: "cancelled",
    });
    expect(cancelled.completedAt).toBeTruthy();

    const queued = await upsertExternalJob({
      organizationId: project.organizationId,
      projectId: project.id,
      providerKind: "crowdin",
      externalJobId: "job_queued",
      externalStatus: "todo",
    });
    expect(queued.completedAt).toBeNull();
  });

  it("allows overriding kind", async () => {
    const project = await createTestProject();

    const result = await upsertExternalJob({
      organizationId: project.organizationId,
      projectId: project.id,
      providerKind: "smartling",
      externalJobId: "smartling_review_1",
      externalStatus: "in_progress",
      kind: "review",
    });

    expect(result.kind).toBe("review");
  });
});

describe("linkExternalJobToNativeJob", () => {
  it("links an external job to a native job", async () => {
    const project = await createTestProject();

    const external = await upsertExternalJob({
      organizationId: project.organizationId,
      projectId: project.id,
      providerKind: "phrase",
      externalJobId: "phrase_job_1",
      externalStatus: "new",
    });

    const nativeJobId = `job_${randomUUID()}`;
    await db.insert(schema.jobs).values({
      id: nativeJobId,
      organizationId: project.organizationId,
      projectId: project.id,
      createdByUserId: null,
      kind: "translation",
      status: "queued",
      inputPayload: {},
    });

    const linked = await linkExternalJobToNativeJob({
      jobId: external.id,
      nativeJobId,
    });

    expect(linked?.linkedJobId).toBe(nativeJobId);
  });
});

describe("unlinkExternalJobFromNativeJob", () => {
  it("clears the linked job id", async () => {
    const project = await createTestProject();

    const external = await upsertExternalJob({
      organizationId: project.organizationId,
      projectId: project.id,
      providerKind: "lokalise",
      externalJobId: "lokalise_job_1",
      externalStatus: "new",
    });

    const nativeJobId = `job_${randomUUID()}`;
    await db.insert(schema.jobs).values({
      id: nativeJobId,
      organizationId: project.organizationId,
      projectId: project.id,
      createdByUserId: null,
      kind: "translation",
      status: "queued",
      inputPayload: {},
    });

    await linkExternalJobToNativeJob({
      jobId: external.id,
      nativeJobId,
    });

    const unlinked = await unlinkExternalJobFromNativeJob({
      jobId: external.id,
    });

    expect(unlinked?.linkedJobId).toBeNull();
  });
});

describe("getExternalJobByProviderJobId", () => {
  it("finds an existing external job by provider id", async () => {
    const project = await createTestProject();

    const external = await upsertExternalJob({
      organizationId: project.organizationId,
      projectId: project.id,
      providerKind: "crowdin",
      externalJobId: "crowdin_job_lookup",
      externalStatus: "in_progress",
    });

    const found = await getExternalJobByProviderJobId({
      organizationId: project.organizationId,
      projectId: project.id,
      providerKind: "crowdin",
      externalJobId: "crowdin_job_lookup",
    });

    expect(found).not.toBeNull();
    expect(found?.external_job_details.jobId).toBe(external.id);
  });

  it("returns null when no match exists", async () => {
    const project = await createTestProject();

    const found = await getExternalJobByProviderJobId({
      organizationId: project.organizationId,
      projectId: project.id,
      providerKind: "crowdin",
      externalJobId: "nonexistent",
    });

    expect(found).toBeNull();
  });
});
