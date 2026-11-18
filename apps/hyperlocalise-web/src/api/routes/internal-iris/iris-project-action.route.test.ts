/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
    10| * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import "dotenv/config";

import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { createApp } from "@/api/app";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db, schema } from "@/lib/database/client";
import { env } from "@/lib/env";
import {
  GO_SVC_SERVICE_TOKEN_HEADER,
  mintGoSvcServiceToken,
} from "@/lib/go-svc/go-svc-service-token";
import { uniqueTestProjectIdentifier } from "@/lib/projects/issue-identifier/test-project-identifier";
import { ensureDefaultWorkspaceTeam } from "@/lib/teams/default-workspace-team";
import type { TranslationJobEventData, TranslationQaScanQueue } from "@/lib/workflow/types";

const fixture = createAuthTestFixture();
const enqueueJob = vi.fn(async (event: TranslationJobEventData) => ({ ids: [event.jobId] }));
const enqueueQa = vi.fn(async () => ({ ids: ["qa_run"] }));

function serviceHeaders() {
  const password = env.WORKOS_COOKIE_PASSWORD;
  if (!password) {
    throw new Error("WORKOS_COOKIE_PASSWORD is required for internal iris route tests");
  }
  return {
    "content-type": "application/json",
    [GO_SVC_SERVICE_TOKEN_HEADER]: mintGoSvcServiceToken(password),
  };
}

const app = createApp({
  jobQueue: { enqueue: enqueueJob },
  translationQaScanQueue: { enqueue: enqueueQa } as TranslationQaScanQueue,
});

async function postAction(
  action: string,
  payload: Record<string, unknown>,
  headers = serviceHeaders(),
) {
  return app.request("/api/internal/iris/project-action", {
    method: "POST",
    headers,
    body: JSON.stringify({ action, payload }),
  });
}

async function seedNativeProject() {
  const { organization, user } = await fixture.createLocalWorkosIdentity();
  const team = await ensureDefaultWorkspaceTeam(organization.id);
  const [project] = await db
    .insert(schema.projects)
    .values({
      id: `project_${randomUUID()}`,
      identifier: uniqueTestProjectIdentifier(),
      organizationId: organization.id,
      teamId: team.id,
      createdByUserId: user.id,
      name: "Iris native",
      description: "",
      translationContext: "",
      source: "native",
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
    })
    .returning();
  return { organization, user, project: project! };
}

async function insertJob(input: {
  organizationId: string;
  projectId: string;
  createdByUserId: string;
  status?: (typeof schema.jobs.$inferInsert)["status"];
}) {
  const [job] = await db
    .insert(schema.jobs)
    .values({
      id: `job_${randomUUID()}`,
      organizationId: input.organizationId,
      projectId: input.projectId,
      createdByUserId: input.createdByUserId,
      kind: "translation",
      status: input.status ?? "queued",
      inputPayload: { sourceLocale: "en-US", targetLocales: ["fr-FR"] },
    })
    .returning();
  return job!;
}

describe("internal iris project-action route", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await fixture.cleanup();
  });

  it("rejects requests without the go-svc service token", async () => {
    const response = await app.request("/api/internal/iris/project-action", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "qa_start", payload: {} }),
    });
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: "unauthorized" });
  });

  it("rejects a wrong service token", async () => {
    const response = await postAction(
      "qa_start",
      {},
      {
        "content-type": "application/json",
        [GO_SVC_SERVICE_TOKEN_HEADER]: "deadbeef",
      },
    );
    expect(response.status).toBe(401);
  });

  it("rejects a missing action or payload", async () => {
    const response = await app.request("/api/internal/iris/project-action", {
      method: "POST",
      headers: serviceHeaders(),
      body: JSON.stringify({ action: "qa_start" }),
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_request_body",
      message: "Invalid project action",
    });
  });

  it("rejects unknown actions and incomplete identity", async () => {
    const unknown = await postAction("explode", {
      organizationId: randomUUID(),
      userId: randomUUID(),
      projectId: `project_${randomUUID()}`,
    });
    expect(unknown.status).toBe(400);
    await expect(unknown.json()).resolves.toMatchObject({ error: "unknown_project_action" });

    const missing = await postAction("qa_start", { organizationId: randomUUID() });
    expect(missing.status).toBe(400);
    await expect(missing.json()).resolves.toMatchObject({
      error: "invalid_request_body",
      message: "organization, user, and project are required",
    });
  });

  it("does not run an action against a project from another organization", async () => {
    const owned = await seedNativeProject();
    const other = await seedNativeProject();
    const response = await postAction("upload_file", {
      organizationId: owned.organization.id,
      userId: owned.user.id,
      projectId: other.project.id,
      sourcePath: "app.json",
      contentBase64: Buffer.from("{}").toString("base64"),
    });
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: "project_not_found" });
  });

  it("validates file, job, and settings payloads before calling workflows", async () => {
    const { organization, user, project } = await seedNativeProject();
    const identity = {
      organizationId: organization.id,
      userId: user.id,
      projectId: project.id,
    };

    const upload = await postAction("upload_file", identity);
    expect(upload.status).toBe(400);
    await expect(upload.json()).resolves.toMatchObject({ error: "invalid_request_body" });

    const download = await postAction("download_file", { ...identity, sourcePath: "app.json" });
    expect(download.status).toBe(400);
    await expect(download.json()).resolves.toMatchObject({ error: "invalid_request_body" });

    const settings = await postAction("file_settings_get", { ...identity, kind: "unknown" });
    expect(settings.status).toBe(400);
    await expect(settings.json()).resolves.toMatchObject({ error: "invalid_request_body" });

    const missingFile = await postAction("translate_file", {
      ...identity,
      sourcePath: "missing.json",
      locales: ["fr-FR"],
    });
    expect(missingFile.status).toBe(404);
    await expect(missingFile.json()).resolves.toMatchObject({ error: "source_file_not_found" });

    const createJob = await postAction("create_job", {
      ...identity,
      fileIds: ["app.json"],
      targetLocales: ["fr-FR"],
      title: "Translate app",
    });
    expect(createJob.status).toBe(404);
    await expect(createJob.json()).resolves.toMatchObject({ error: "source_file_not_found" });

    const unknownJobAction = await postAction("job_action", {
      ...identity,
      jobId: `job_${randomUUID()}`,
      action: "explode",
    });
    expect(unknownJobAction.status).toBe(400);
    await expect(unknownJobAction.json()).resolves.toMatchObject({
      error: "invalid_request_body",
    });
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it("maps QA start failures and enqueues a retry only for the caller organization", async () => {
    const owned = await seedNativeProject();
    const other = await seedNativeProject();
    const tmsProject = (
      await db
        .insert(schema.projects)
        .values({
          id: `project_${randomUUID()}`,
          identifier: uniqueTestProjectIdentifier(),
          organizationId: owned.organization.id,
          teamId: owned.project.teamId,
          createdByUserId: owned.user.id,
          name: "Iris TMS",
          description: "",
          translationContext: "",
          source: "external_tms",
          externalProviderKind: "phrase",
          externalProjectId: "42",
          sourceLocale: "en-US",
          targetLocales: ["fr-FR"],
        })
        .returning()
    )[0]!;

    const missing = await postAction("qa_start", {
      organizationId: owned.organization.id,
      userId: owned.user.id,
      projectId: `project_${randomUUID()}`,
    });
    expect(missing.status).toBe(400);
    await expect(missing.json()).resolves.toMatchObject({ error: "project_not_found" });

    const provider = await postAction("qa_start", {
      organizationId: owned.organization.id,
      userId: owned.user.id,
      projectId: tmsProject.id,
    });
    expect(provider.status).toBe(400);
    await expect(provider.json()).resolves.toMatchObject({ error: "project_not_native" });

    const first = await postAction("qa_start", {
      organizationId: owned.organization.id,
      userId: owned.user.id,
      projectId: owned.project.id,
    });
    expect(first.status).toBe(201);
    const firstBody = (await first.json()) as { result: { run: { id: string; status: string } } };
    expect(firstBody.result.run.status).toBe("queued");
    expect(enqueueQa).toHaveBeenCalledTimes(1);

    const second = await postAction("qa_start", {
      organizationId: owned.organization.id,
      userId: owned.user.id,
      projectId: owned.project.id,
    });
    expect(second.status).toBe(409);
    await expect(second.json()).resolves.toMatchObject({ error: "scan_in_progress" });
    expect(enqueueQa).toHaveBeenCalledTimes(1);

    const ownedJob = await insertJob({
      organizationId: owned.organization.id,
      projectId: owned.project.id,
      createdByUserId: owned.user.id,
      status: "failed",
    });
    const otherJob = await insertJob({
      organizationId: other.organization.id,
      projectId: other.project.id,
      createdByUserId: other.user.id,
      status: "queued",
    });

    const retry = await postAction("job_action", {
      organizationId: owned.organization.id,
      userId: owned.user.id,
      projectId: owned.project.id,
      jobId: ownedJob.id,
      action: "retry",
    });
    expect(retry.status).toBe(200);
    await expect(retry.json()).resolves.toEqual({
      result: { id: ownedJob.id, action: "retry" },
    });
    expect(enqueueJob).toHaveBeenCalledWith({
      kind: "translation",
      jobId: ownedJob.id,
      projectId: owned.project.id,
      type: "file",
    });

    const failed = await postAction("job_action", {
      organizationId: owned.organization.id,
      userId: owned.user.id,
      projectId: owned.project.id,
      jobId: otherJob.id,
      action: "mark_failed",
    });
    expect(failed.status).toBe(200);
    const [untouched] = await db
      .select({ status: schema.jobs.status, lastError: schema.jobs.lastError })
      .from(schema.jobs)
      .where(eq(schema.jobs.id, otherJob.id));
    expect(untouched?.status).toBe("queued");
    expect(untouched?.lastError).toBeNull();

    const marked = await postAction("job_action", {
      organizationId: owned.organization.id,
      userId: owned.user.id,
      projectId: owned.project.id,
      jobId: ownedJob.id,
      action: "mark_failed",
    });
    expect(marked.status).toBe(200);
    const [ownedRow] = await db
      .select({ status: schema.jobs.status, lastError: schema.jobs.lastError })
      .from(schema.jobs)
      .where(eq(schema.jobs.id, ownedJob.id));
    expect(ownedRow?.status).toBe("failed");
    expect(ownedRow?.lastError).toBe("Marked failed");
  });

  it("cancels only jobs in the caller organization", async () => {
    const owned = await seedNativeProject();
    const other = await seedNativeProject();
    const ownedJob = await insertJob({
      organizationId: owned.organization.id,
      projectId: owned.project.id,
      createdByUserId: owned.user.id,
    });
    const otherJob = await insertJob({
      organizationId: other.organization.id,
      projectId: other.project.id,
      createdByUserId: other.user.id,
    });

    const cancelled = await postAction("job_action", {
      organizationId: owned.organization.id,
      userId: owned.user.id,
      projectId: owned.project.id,
      jobId: ownedJob.id,
      action: "cancel",
    });
    expect(cancelled.status).toBe(200);
    const [ownedRow] = await db
      .select({ status: schema.jobs.status })
      .from(schema.jobs)
      .where(eq(schema.jobs.id, ownedJob.id));
    expect(ownedRow?.status).toBe("cancelled");

    const foreign = await postAction("job_action", {
      organizationId: owned.organization.id,
      userId: owned.user.id,
      projectId: owned.project.id,
      jobId: otherJob.id,
      action: "cancel",
    });
    expect(foreign.status).toBe(409);
    await expect(foreign.json()).resolves.toMatchObject({ error: "job_not_found" });
    const [otherRow] = await db
      .select({ status: schema.jobs.status })
      .from(schema.jobs)
      .where(eq(schema.jobs.id, otherJob.id));
    expect(otherRow?.status).toBe("queued");
  });
});
