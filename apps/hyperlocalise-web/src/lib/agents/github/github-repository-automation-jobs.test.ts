import "dotenv/config";

import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { db, schema } from "@/lib/database";

import {
  claimGithubRepositoryAutomationJob,
  claimGithubRepositoryAutomationJobForRunning,
  findLatestSucceededCommitAfter,
  updateGithubRepositoryAutomationJobStatus,
} from "./github-repository-automation-jobs";
import type { GithubRepoAutomationDispatchPayload } from "./github-repository-automation-settings";

const organizationIds: string[] = [];

async function seedRepositoryAutomation() {
  const organizationId = crypto.randomUUID();
  const numericSuffix = BigInt(`0x${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`)
    .toString()
    .slice(0, 12);
  const githubInstallationId = `9${numericSuffix}`;
  const githubRepositoryId = `8${numericSuffix}`;

  organizationIds.push(organizationId);

  await db.insert(schema.organizations).values({
    id: organizationId,
    workosOrganizationId: `org_${organizationId}`,
    slug: `org-${organizationId.slice(0, 8)}`,
    name: "Automation Test Org",
  });

  await db.insert(schema.githubInstallations).values({
    organizationId,
    githubInstallationId,
    githubAppId: "123",
    accountLogin: "hyperlocalise",
    accountType: "Organization",
  });

  const [repository] = await db
    .insert(schema.githubInstallationRepositories)
    .values({
      organizationId,
      githubInstallationId,
      githubRepositoryId,
      owner: "hyperlocalise",
      name: "hyperlocalise",
      fullName: "hyperlocalise/hyperlocalise",
      private: false,
      archived: false,
      defaultBranch: "main",
      enabled: true,
    })
    .returning();

  if (!repository) {
    throw new Error("failed to seed github installation repository");
  }

  return {
    organizationId,
    githubInstallationId,
    githubRepositoryId,
    githubInstallationRepositoryId: repository.id,
  };
}

async function claimJob(
  repository: Awaited<ReturnType<typeof seedRepositoryAutomation>>,
  input?: Partial<Parameters<typeof claimGithubRepositoryAutomationJob>[0]>,
) {
  return claimGithubRepositoryAutomationJob({
    idempotencyKey: `test:${crypto.randomUUID()}`,
    organizationId: repository.organizationId,
    githubInstallationRepositoryId: repository.githubInstallationRepositoryId,
    githubInstallationId: repository.githubInstallationId,
    githubRepositoryId: repository.githubRepositoryId,
    configVersion: 1,
    triggerMode: "push",
    triggerBranch: "main",
    commitBefore: "abc",
    commitAfter: "def",
    ...input,
  });
}

describe("github repository automation jobs", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    for (const organizationId of organizationIds.splice(0)) {
      await db.delete(schema.organizations).where(eq(schema.organizations.id, organizationId));
    }
  });

  it("normalizes legacy workflow payloads when claiming duplicate jobs", async () => {
    const repository = await seedRepositoryAutomation();
    const idempotencyKey = `legacy-workflow-payload:${crypto.randomUUID()}`;
    const legacyWorkflows = {
      pushSource: false,
      pullTranslations: false,
      validation: true,
      validationBlockOnFailure: false,
    } satisfies Omit<GithubRepoAutomationDispatchPayload["workflows"], "statusCheck">;

    const first = await claimJob(repository, {
      idempotencyKey,
      workflows: legacyWorkflows as GithubRepoAutomationDispatchPayload["workflows"],
    });
    const duplicate = await claimJob(repository, {
      idempotencyKey,
      workflows: {
        pushSource: true,
        pullTranslations: true,
        validation: true,
        validationBlockOnFailure: true,
        statusCheck: { enabled: true, mode: "blocking" },
      },
    });

    expect(first.inserted).toBe(true);
    expect(duplicate.inserted).toBe(false);
    expect(duplicate.job.id).toBe(first.job.id);
    expect(duplicate.job.workflows).toEqual({
      pushSource: false,
      pullTranslations: false,
      validation: true,
      validationBlockOnFailure: false,
      statusCheck: { enabled: false, mode: "advisory" },
    });
  });

  it("claims a queued job for running only once", async () => {
    const repository = await seedRepositoryAutomation();
    const { job } = await claimJob(repository);

    const claimed = await claimGithubRepositoryAutomationJobForRunning({
      jobId: job.id,
      workflowRunId: "workflow-run-1",
    });
    const duplicateClaim = await claimGithubRepositoryAutomationJobForRunning({
      jobId: job.id,
      workflowRunId: "workflow-run-2",
    });

    expect(claimed?.status).toBe("running");
    expect(claimed?.workflowRunId).toBe("workflow-run-1");
    expect(duplicateClaim).toBeNull();

    const [storedJob] = await db
      .select({
        status: schema.githubRepositoryAutomationJobs.status,
        workflowRunId: schema.githubRepositoryAutomationJobs.workflowRunId,
      })
      .from(schema.githubRepositoryAutomationJobs)
      .where(eq(schema.githubRepositoryAutomationJobs.id, job.id));

    expect(storedJob).toEqual({
      status: "running",
      workflowRunId: "workflow-run-1",
    });
  });

  it("records terminal status metadata without dropping commit updates", async () => {
    const repository = await seedRepositoryAutomation();
    const { job } = await claimJob(repository);

    await updateGithubRepositoryAutomationJobStatus({
      jobId: job.id,
      status: "succeeded",
      workflowRunId: "workflow-run-success",
      resultSummary: { totalCommits: 2 },
      githubCheckRunId: "12345",
      commitBefore: "before-updated",
      commitAfter: "after-updated",
    });

    const [storedJob] = await db
      .select({
        status: schema.githubRepositoryAutomationJobs.status,
        workflowRunId: schema.githubRepositoryAutomationJobs.workflowRunId,
        resultSummary: schema.githubRepositoryAutomationJobs.resultSummary,
        githubCheckRunId: schema.githubRepositoryAutomationJobs.githubCheckRunId,
        commitBefore: schema.githubRepositoryAutomationJobs.commitBefore,
        commitAfter: schema.githubRepositoryAutomationJobs.commitAfter,
        completedAt: schema.githubRepositoryAutomationJobs.completedAt,
      })
      .from(schema.githubRepositoryAutomationJobs)
      .where(eq(schema.githubRepositoryAutomationJobs.id, job.id));

    expect(storedJob).toMatchObject({
      status: "succeeded",
      workflowRunId: "workflow-run-success",
      resultSummary: { totalCommits: 2 },
      githubCheckRunId: "12345",
      commitBefore: "before-updated",
      commitAfter: "after-updated",
    });
    expect(storedJob?.completedAt).toBeInstanceOf(Date);
  });

  it("finds the latest succeeded commit for the same repository branch", async () => {
    const repository = await seedRepositoryAutomation();
    const idempotencyPrefix = crypto.randomUUID();
    const oldMain = await claimJob(repository, {
      idempotencyKey: `${idempotencyPrefix}:commit-range-old-main`,
      triggerBranch: "main",
      commitAfter: "old-main",
    });
    const newMain = await claimJob(repository, {
      idempotencyKey: `${idempotencyPrefix}:commit-range-new-main`,
      triggerBranch: "main",
      commitAfter: "new-main",
    });
    const feature = await claimJob(repository, {
      idempotencyKey: `${idempotencyPrefix}:commit-range-feature`,
      triggerBranch: "feature/test",
      commitAfter: "feature-head",
    });

    await updateGithubRepositoryAutomationJobStatus({
      jobId: oldMain.job.id,
      status: "succeeded",
    });
    await updateGithubRepositoryAutomationJobStatus({
      jobId: newMain.job.id,
      status: "succeeded",
    });
    await updateGithubRepositoryAutomationJobStatus({
      jobId: feature.job.id,
      status: "succeeded",
    });

    await db
      .update(schema.githubRepositoryAutomationJobs)
      .set({ createdAt: new Date("2026-05-30T10:00:00.000Z") })
      .where(eq(schema.githubRepositoryAutomationJobs.id, oldMain.job.id));
    await db
      .update(schema.githubRepositoryAutomationJobs)
      .set({ createdAt: new Date("2026-05-30T11:00:00.000Z") })
      .where(eq(schema.githubRepositoryAutomationJobs.id, newMain.job.id));

    await expect(
      findLatestSucceededCommitAfter({
        githubInstallationRepositoryId: repository.githubInstallationRepositoryId,
        triggerBranch: "main",
      }),
    ).resolves.toBe("new-main");
  });
});
