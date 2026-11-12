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

import { eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

const { ensureAiFeaturesAllowedMock, startTaskAnalysisMock } = vi.hoisted(() => ({
  ensureAiFeaturesAllowedMock: vi.fn(),
  startTaskAnalysisMock: vi.fn(async () => undefined),
}));

vi.mock("@/lib/reporting/task-analysis-start", () => ({
  startTaskAnalysis: startTaskAnalysisMock,
}));

vi.mock("@/lib/billing/ai-features", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/billing/ai-features")>();
  return { ...actual, ensureAiFeaturesAllowed: ensureAiFeaturesAllowedMock };
});

vi.mock("@/lib/activity-log/job-automation-events", () => ({
  enqueueJobCreatedActivity: vi.fn(),
  enqueueJobFailedActivity: vi.fn(),
}));

import { createApp } from "@/api/app";
import type { AppType } from "@/api/typed-app";
import { db, schema } from "@/lib/database/client";
import { err, ok } from "@/lib/primitives/result/results";
import type { TranslationJobEventData } from "@/lib/workflow/types";

import { cleanupPublicApiFixture, createPublicApiFixture } from "./public-jobs.fixture";

const enqueueJob = vi.fn(async (event: TranslationJobEventData) => ({ ids: [event.jobId] }));
const client = testClient<AppType>(createApp({ jobQueue: { enqueue: enqueueJob } }));

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.clearAllMocks();
  await cleanupPublicApiFixture();
});

const sourceFiles = new Map<string, string>();

/** One source file per project; key jobs only take strings that belong to a file. */
async function sourceFileFor(project: { id: string; organizationId: string }) {
  const existing = sourceFiles.get(project.id);
  if (existing) return existing;
  const [file] = await db
    .insert(schema.repositorySourceFiles)
    .values({
      organizationId: project.organizationId,
      projectId: project.id,
      sourcePath: "en.json",
    })
    .returning({ id: schema.repositorySourceFiles.id });
  sourceFiles.set(project.id, file!.id);
  return file!.id;
}

async function insertKey(
  project: { id: string; organizationId: string },
  key: string,
  options: { tags?: string[]; isHidden?: boolean; inFile?: boolean } = {},
) {
  const fileId = options.inFile === false ? null : await sourceFileFor(project);
  const [row] = await db
    .insert(schema.projectTranslationKeys)
    .values({
      organizationId: project.organizationId,
      projectId: project.id,
      repositorySourceFileId: fileId,
      key,
      sourceText: key,
      normalizedSourceText: key,
      tags: options.tags ?? [],
      isHidden: options.isHidden ?? false,
    })
    .returning({ id: schema.projectTranslationKeys.id });
  return row!.id;
}

const keyJob = (projectId: string, selection: Record<string, unknown>) => ({
  type: "keys" as const,
  projectId,
  title: "Release 7",
  keysInput: { sourceLocale: "en-US", targetLocales: ["fr-FR"], ...selection },
});

async function jobKeyIds(jobId: string) {
  const rows = await db
    .select({ id: schema.translationJobKeys.translationKeyId })
    .from(schema.translationJobKeys)
    .where(eq(schema.translationJobKeys.jobId, jobId));
  return rows.map((row) => row.id).sort();
}

describe("public key jobs", () => {
  it("creates a task for people on the keys carrying a tag, with no AI run", async () => {
    // AI features off must not block a task that never calls a model.
    ensureAiFeaturesAllowedMock.mockResolvedValue(
      err({ code: "ai_features_required", message: "no" }),
    );
    const { apiKey, project } = await createPublicApiFixture();
    const first = await insertKey(project, "checkout.title", { tags: ["release-7"] });
    const second = await insertKey(project, "checkout.cta", { tags: ["release-7", "cta"] });
    await insertKey(project, "checkout.hidden", { tags: ["release-7"], isHidden: true });
    await insertKey(project, "home.title");

    const response = await client.api.v1.jobs.$post(
      { json: keyJob(project.id, { tags: ["release-7"] }) },
      { headers: { "x-api-key": apiKey } },
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as { job: { id: string; status: string; type: string } };
    expect(body.job).toMatchObject({ type: "keys", status: "waiting_for_review" });
    expect(await jobKeyIds(body.job.id)).toEqual([first, second].sort());
    const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, body.job.id));
    expect(job).toMatchObject({ kind: "proofread", status: "waiting_for_review" });
    expect(job?.inputPayload).toEqual({
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
      metadata: { title: "Release 7" },
    });
    expect(enqueueJob).not.toHaveBeenCalled();
    expect(startTaskAnalysisMock).toHaveBeenCalledWith({
      organizationId: project.organizationId,
      projectId: project.id,
      jobId: body.job.id,
      step: "review",
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
      repositorySourceFileId: null,
    });
    const usage = await db
      .select()
      .from(schema.usageEvents)
      .where(eq(schema.usageEvents.jobId, body.job.id));
    expect(usage).toEqual([]);
  });

  it("stores the project's spelling of the languages", async () => {
    const { apiKey, project } = await createPublicApiFixture();
    await db
      .update(schema.projects)
      // Stored as the project spells them, even where that is not the canonical form.
      .set({ targetLocales: ["fr-fr", "pt-BR"] })
      .where(eq(schema.projects.id, project.id));
    await insertKey(project, "a");

    const response = await client.api.v1.jobs.$post(
      {
        json: {
          ...keyJob(project.id, { keys: ["a"] }),
          keysInput: { sourceLocale: "en-us", targetLocales: ["fr-fr", "PT-br"], keys: ["a"] },
        },
      },
      { headers: { "x-api-key": apiKey } },
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as { job: { id: string } };
    const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, body.job.id));
    expect(job?.inputPayload).toMatchObject({
      sourceLocale: "en-US",
      targetLocales: ["fr-fr", "pt-BR"],
    });
  });

  it("refuses an external TMS project and the AI-only overwrite flag", async () => {
    const { apiKey, project } = await createPublicApiFixture();
    await insertKey(project, "a");

    const aiFlag = await client.api.v1.jobs.$post(
      {
        json: {
          ...keyJob(project.id, { keys: ["a"] }),
          keysInput: {
            sourceLocale: "en-US",
            targetLocales: ["fr-FR"],
            keys: ["a"],
            overwriteUnapproved: true,
          },
        },
      },
      { headers: { "x-api-key": apiKey } },
    );
    expect(aiFlag.status).toBe(400);

    await db
      .update(schema.projects)
      .set({ source: "external_tms" })
      .where(eq(schema.projects.id, project.id));
    const external = await client.api.v1.jobs.$post(
      { json: keyJob(project.id, { keys: ["a"] }) },
      { headers: { "x-api-key": apiKey } },
    );
    expect(external.status).toBe(409);
    expect(await external.json()).toMatchObject({ error: "project_not_native" });
  });

  it("refuses a selection that matches no visible string, and two ways of picking", async () => {
    const { apiKey, project } = await createPublicApiFixture();
    await insertKey(project, "hidden", { isHidden: true });
    await insertKey(project, "no-file", { inFile: false });

    const none = await client.api.v1.jobs.$post(
      { json: keyJob(project.id, { keys: ["hidden", "no-file", "missing"] }) },
      { headers: { "x-api-key": apiKey } },
    );
    expect(none.status).toBe(400);
    expect(await none.json()).toMatchObject({ error: "no_strings_matched" });

    const both = await client.api.v1.jobs.$post(
      { json: keyJob(project.id, { keys: ["a"], tags: ["b"] }) },
      { headers: { "x-api-key": apiKey } },
    );
    expect(both.status).toBe(400);
    const jobs = await db
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .where(eq(schema.jobs.projectId, project.id));
    expect(jobs).toEqual([]);
  });

  it("replays a key job when the same Idempotency-Key comes with the keys in another order", async () => {
    const { apiKey, project } = await createPublicApiFixture();
    await insertKey(project, "a");
    await insertKey(project, "b");
    const headers = { "x-api-key": apiKey, "idempotency-key": "release-7-keys" };

    const first = await client.api.v1.jobs.$post(
      { json: keyJob(project.id, { keys: ["a", "b"] }) },
      { headers },
    );
    const second = await client.api.v1.jobs.$post(
      { json: keyJob(project.id, { keys: ["b", "a"] }) },
      { headers },
    );

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.headers.get("Idempotent-Replayed")).toBe("true");
    const firstBody = (await first.json()) as { job: { id: string } };
    const secondBody = (await second.json()) as { job: { id: string; status: string } };
    expect(secondBody.job).toMatchObject({ id: firstBody.job.id, status: "waiting_for_review" });
  });
});

describe("public job completion", () => {
  async function createKeyJob(apiKey: string, projectId: string) {
    const response = await client.api.v1.jobs.$post(
      { json: keyJob(projectId, { keys: ["a"] }) },
      { headers: { "x-api-key": apiKey } },
    );
    expect(response.status).toBe(201);
    return ((await response.json()) as { job: { id: string } }).job.id;
  }

  it("completes an open task for people once", async () => {
    const { apiKey, project } = await createPublicApiFixture();
    await insertKey(project, "a");
    const jobId = await createKeyJob(apiKey, project.id);

    const done = await client.api.v1.jobs[":jobId"].complete.$post(
      { param: { jobId } },
      { headers: { "x-api-key": apiKey } },
    );
    expect(done.status).toBe(200);
    expect(await done.json()).toEqual({ job: { id: jobId, status: "succeeded" } });
    const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
    expect(job?.status).toBe("succeeded");

    const again = await client.api.v1.jobs[":jobId"].complete.$post(
      { param: { jobId } },
      { headers: { "x-api-key": apiKey } },
    );
    expect(again.status).toBe(409);
  });

  it("lets a translator complete only a task assigned to them", async () => {
    const { apiKey, project, user } = await createPublicApiFixture({ role: "translator" });
    const keyId = await insertKey(project, "a");
    // Inserted directly: a translator outside the project's teams can't create it through the API.
    const jobId = `job_${crypto.randomUUID()}`;
    await db.insert(schema.jobs).values({
      id: jobId,
      organizationId: project.organizationId,
      projectId: project.id,
      kind: "proofread",
      status: "waiting_for_review",
      inputPayload: { sourceLocale: "en-US", targetLocales: ["fr-FR"] },
    });
    await db.insert(schema.translationJobDetails).values({ jobId, type: "keys" });
    await db.insert(schema.translationJobKeys).values({ jobId, translationKeyId: keyId });
    const [team] = await db
      .insert(schema.teams)
      .values({
        organizationId: project.organizationId,
        slug: `team-${jobId}`,
        name: "Translators",
      })
      .returning({ id: schema.teams.id });
    await db.insert(schema.teamMemberships).values({ teamId: team!.id, userId: user.id });
    await db
      .update(schema.projects)
      .set({ teamId: team!.id })
      .where(eq(schema.projects.id, project.id));

    const refused = await client.api.v1.jobs[":jobId"].complete.$post(
      { param: { jobId } },
      { headers: { "x-api-key": apiKey } },
    );
    expect(refused.status).toBe(403);

    await db
      .update(schema.jobs)
      .set({ ownerUserId: user.id, assigneeType: "user" })
      .where(eq(schema.jobs.id, jobId));
    const done = await client.api.v1.jobs[":jobId"].complete.$post(
      { param: { jobId } },
      { headers: { "x-api-key": apiKey } },
    );
    expect(done.status).toBe(200);
  });

  it("does not complete an AI job or an unknown job", async () => {
    const { apiKey, project } = await createPublicApiFixture();
    const aiJobId = `job_${crypto.randomUUID()}`;
    await db.insert(schema.jobs).values({
      id: aiJobId,
      organizationId: project.organizationId,
      projectId: project.id,
      kind: "translation",
      status: "running",
      inputPayload: { sourceText: "Hi", sourceLocale: "en-US", targetLocales: ["fr-FR"] },
    });
    const aiJob = await client.api.v1.jobs[":jobId"].complete.$post(
      { param: { jobId: aiJobId } },
      { headers: { "x-api-key": apiKey } },
    );
    expect(aiJob.status).toBe(409);

    const missing = await client.api.v1.jobs[":jobId"].complete.$post(
      { param: { jobId: "job_missing" } },
      { headers: { "x-api-key": apiKey } },
    );
    expect(missing.status).toBe(404);
  });
});

describe("open job budget", () => {
  it("does not let open key jobs block AI jobs", async () => {
    ensureAiFeaturesAllowedMock.mockResolvedValue(ok(undefined));
    const { apiKey, project } = await createPublicApiFixture();
    const ids = Array.from({ length: 50 }, () => `job_${crypto.randomUUID()}`);
    await db.insert(schema.jobs).values(
      ids.map((id) => ({
        id,
        organizationId: project.organizationId,
        projectId: project.id,
        kind: "proofread" as const,
        status: "waiting_for_review" as const,
        inputPayload: { sourceLocale: "en-US", targetLocales: ["fr-FR"] },
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      })),
    );
    await db
      .insert(schema.translationJobDetails)
      .values(ids.map((jobId) => ({ jobId, type: "keys" as const })));

    const response = await client.api.v1.jobs.$post(
      {
        json: {
          type: "string",
          projectId: project.id,
          stringInput: { sourceText: "Hi", sourceLocale: "en-US", targetLocales: ["fr-FR"] },
        },
      },
      { headers: { "x-api-key": apiKey } },
    );
    expect(response.status).toBe(201);
  });

  it("creates a key job while 50 other jobs are open", async () => {
    const { apiKey, project } = await createPublicApiFixture();
    await insertKey(project, "a");
    await db.insert(schema.jobs).values(
      Array.from({ length: 50 }, () => ({
        id: `job_${crypto.randomUUID()}`,
        organizationId: project.organizationId,
        projectId: project.id,
        kind: "translation" as const,
        status: "queued" as const,
        inputPayload: { sourceText: "Hi", sourceLocale: "en-US", targetLocales: ["fr-FR"] },
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      })),
    );

    const response = await client.api.v1.jobs.$post(
      { json: keyJob(project.id, { keys: ["a"] }) },
      { headers: { "x-api-key": apiKey } },
    );
    expect(response.status).toBe(201);
  });
});
