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
import { normalizeTranslationMemorySourceText } from "@/lib/translation/normalizeTranslationMemorySourceText";
import "dotenv/config";

import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { app } from "@/api/app";
import { refuseVendorUnlessAllowed } from "@/api/auth/vendor-access";
import type { WorkosAuthIdentity } from "@/api/auth/workos";
import { db, schema } from "@/lib/database/client";
import type { OrganizationMembershipRole } from "@/lib/database/types";
import {
  findOwnedFileTask,
  resolveTaskRouteProjectAccess,
  taskRouteAccessCovers,
} from "@/lib/projects/jobs/task-access";
import { ensureTeamMembership } from "@/lib/teams/default-workspace-team";

import { insertStoredSourceFile } from "../public-jobs/public-jobs.fixture";
import { createProjectTestFixture } from "./project.fixture";

const { resolveApiAuthContextFromSessionMock } = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(),
}));

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
  };
});
vi.mock("@/lib/reporting/capture", () => ({ captureJobStatus: vi.fn(async () => undefined) }));

const fixture = createProjectTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await fixture.cleanup();
});

/** The session function for tests, refusing a vendor exactly as the real one does. */
function useTestSessions() {
  resolveApiAuthContextFromSessionMock.mockImplementation(
    async (options: { cookie?: string; organizationSlug?: string; allowVendor?: boolean } = {}) => {
      const auth = globalThis.__resolveTestApiAuthContextFromSession?.(options) ?? null;
      if (auth) {
        refuseVendorUnlessAllowed(auth, options.allowVendor);
      }
      return auth;
    },
  );
}

/**
 * A project in the default team, owned by an admin, with two files. `person` is a second member
 * with the given role who is in no team unless a test adds them.
 */
async function setUp(role: OrganizationMembershipRole) {
  useTestSessions();
  const { identity: admin, organization, project } = await fixture.createStoredProjectFixture();
  const personIdentity: WorkosAuthIdentity = fixture.createWorkosIdentityForOrganization(
    admin.organization,
    role,
  );
  const headers = await fixture.authHeadersFor(personIdentity);
  const personId = await fixture.getLocalUserId(personIdentity.user.workosUserId);
  const adminId = await fixture.getLocalUserId(admin.user.workosUserId);
  const slug = admin.organization.slug ?? "missing-slug";

  /** Adds a source file with one upload and one string. */
  async function addFile(sourcePath: string, branchName = "main", sourceText = "Hello") {
    const stored = await insertStoredSourceFile({
      organizationId: organization.id,
      projectId: project.id,
      filename: sourcePath.split("/").at(-1),
      contentType: "application/json",
      sourceKind: "repository_file",
    });
    const [sourceFile] = await db
      .insert(schema.repositorySourceFiles)
      .values({ organizationId: organization.id, projectId: project.id, sourcePath, branchName })
      .returning({ id: schema.repositorySourceFiles.id });
    const [version] = await db
      .insert(schema.repositorySourceFileVersions)
      .values({
        repositorySourceFileId: sourceFile!.id,
        organizationId: organization.id,
        projectId: project.id,
        sourcePath,
        storedFileId: stored.id,
      })
      .returning({ id: schema.repositorySourceFileVersions.id });
    await db.insert(schema.projectTranslationKeys).values({
      organizationId: organization.id,
      projectId: project.id,
      repositorySourceFileId: sourceFile!.id,
      branchName,
      key: "greeting",
      sourceText,
      normalizedSourceText: sourceText.toLowerCase(),
    });
    versionByStoredFile.set(stored.id, version!.id);
    return { storedFileId: stored.id, sourceFileId: sourceFile!.id, sourcePath, sourceText };
  }
  // The upload each stored file was added with: a task names its file through it.
  const versionByStoredFile = new Map<string, string>();

  const file = await addFile("locales/app.json", "main", "Hello");
  const otherFile = await addFile("locales/other.json", "main", "Only in the other file");

  async function addTask(
    input: Partial<{
      ownerUserId: string;
      status: (typeof schema.jobs.$inferInsert)["status"];
      kind: (typeof schema.jobs.$inferInsert)["kind"];
      step: string;
      storedFileId: string | null;
      targetLocales: string[];
      afterJobId: string;
    }> = {},
  ) {
    const storedFileId = input.storedFileId === undefined ? file.storedFileId : input.storedFileId;
    const [job] = await db
      .insert(schema.jobs)
      .values({
        id: `job_${randomUUID()}`,
        organizationId: organization.id,
        projectId: project.id,
        ownerUserId: input.ownerUserId ?? personId,
        assigneeType: "user",
        kind: input.kind ?? "proofread",
        status: input.status ?? "waiting_for_review",
        afterJobId: input.afterJobId ?? null,
        inputPayload: {
          ...(storedFileId ? { sourceFileId: storedFileId } : {}),
          sourceLocale: "en-US",
          targetLocales: input.targetLocales ?? ["fr-FR"],
          metadata: input.step ? { workflowTaskStep: input.step } : {},
        },
      })
      .returning({ id: schema.jobs.id });
    await db.insert(schema.translationJobDetails).values({
      jobId: job!.id,
      type: "file",
      sourceFileVersionId: storedFileId ? (versionByStoredFile.get(storedFileId) ?? null) : null,
    });
    return job!.id;
  }

  const request = (method: string, path: string, body?: unknown) =>
    app.request(`http://localhost/api/orgs/${slug}${path}`, {
      method,
      headers: { ...headers, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const errorCode = async (response: Response) =>
    ((await response.json()) as { error?: string }).error;

  return {
    admin,
    adminId,
    organization,
    project,
    personIdentity,
    personId,
    file,
    otherFile,
    addFile,
    addTask,
    markDone: (jobId: string) => request("POST", `/jobs/${jobId}/mark-done`),
    lookUp: (targetLocale: string, projectId = project.id, sourceText = "Hello") =>
      request("POST", `/projects/${projectId}/files/detail/cat/concordance`, {
        sourceLocale: "en-US",
        targetLocale,
        sourceText,
      }),
    asset: (fileId: string) => request("GET", `/projects/${project.id}/assets/${fileId}`),
    download: (sourcePath: string, locale: string) =>
      request(
        "GET",
        `/projects/${project.id}/files/translations/download?sourcePath=${encodeURIComponent(sourcePath)}&locale=${locale}`,
      ),
    request,
    errorCode,
    joinProjectTeam: () =>
      ensureTeamMembership({ teamId: project.teamId!, userId: personId, role: "member" }),
  };
}

async function jobStatus(jobId: string) {
  const [job] = await db
    .select({ status: schema.jobs.status })
    .from(schema.jobs)
    .where(eq(schema.jobs.id, jobId));
  return job?.status;
}

describe("Mark done for a vendor", () => {
  it("finishes an open task they own, and then the task is no longer theirs to act on", async () => {
    const s = await setUp("vendor");
    const task = await s.addTask({ step: "edit" });

    await db
      .update(schema.jobs)
      .set({ createdByUserId: s.adminId, workflowRunId: "run_secret", lastError: "secret error" })
      .where(eq(schema.jobs.id, task));

    const response = await s.markDone(task);
    expect(response.status).toBe(200);
    const body = await response.text();
    expect((JSON.parse(body) as { job: { status: string } }).job.status).toBe("succeeded");
    // The reply says it is done, and nothing about who made the job or how it ran.
    for (const hidden of [s.adminId, "run_secret", "secret error", s.file.storedFileId]) {
      expect(body).not.toContain(hidden);
    }
    expect(await jobStatus(task)).toBe("succeeded");

    expect((await s.markDone(task)).status).toBe(404);
  });

  it("does not finish anything else", async () => {
    const s = await setUp("vendor");
    const earlier = await s.addTask({ ownerUserId: s.adminId });
    const cases: Array<[string, string]> = [
      ["another person's task", earlier],
      ["a waiting task", await s.addTask({ status: "queued", afterJobId: earlier })],
      ["a translate task", await s.addTask({ kind: "translation", step: "translate" })],
      ["a task on chosen strings", await s.addTask({ storedFileId: null })],
    ];
    for (const [name, jobId] of cases) {
      const before = await jobStatus(jobId);
      expect((await s.markDone(jobId)).status, name).toBe(404);
      expect(await jobStatus(jobId), name).toBe(before);
    }
  });

  it("is not helped by a team they were left in", async () => {
    const s = await setUp("vendor");
    await s.joinProjectTeam();
    const adminsTask = await s.addTask({ ownerUserId: s.adminId });
    expect((await s.markDone(adminsTask)).status).toBe(404);
    expect(await jobStatus(adminsTask)).toBe("waiting_for_review");
  });

  it("is refused on every other job action", async () => {
    const s = await setUp("vendor");
    const task = await s.addTask();
    for (const [method, path] of [
      ["GET", `/jobs/${task}`],
      ["PATCH", `/jobs/${task}`],
      ["POST", `/jobs/${task}/cancel`],
      ["POST", `/jobs/${task}/retry`],
      ["POST", `/jobs/${task}/mark-failed`],
      ["GET", `/projects/${s.project.id}/jobs`],
      ["GET", `/projects/${s.project.id}`],
      ["GET", `/projects`],
    ] as const) {
      const response = await s.request(method, path, method === "GET" ? undefined : {});
      expect(response.status, `${method} ${path}`).toBe(403);
    }
    expect(await jobStatus(task)).toBe("waiting_for_review");
  });
});

describe("Mark done for a task owner outside the project's team", () => {
  it("lets a translator finish a task they own", async () => {
    const s = await setUp("translator");
    const task = await s.addTask();
    expect((await s.markDone(task)).status).toBe(200);
    expect(await jobStatus(task)).toBe("succeeded");
  });

  it("still hides a task that is not theirs", async () => {
    const s = await setUp("translator");
    const adminsTask = await s.addTask({ ownerUserId: s.adminId });
    expect((await s.markDone(adminsTask)).status).toBe(404);
  });

  it("still refuses a member, who cannot work on jobs", async () => {
    const s = await setUp("member");
    const task = await s.addTask();
    expect((await s.markDone(task)).status).toBe(403);
    expect(await jobStatus(task)).toBe("waiting_for_review");
  });

  it("changes nothing for a translator on the team", async () => {
    const s = await setUp("translator");
    await s.joinProjectTeam();
    const adminsTask = await s.addTask({ ownerUserId: s.adminId });
    // On the team they can see it, but only its owner or a reviewer may finish it.
    expect((await s.markDone(adminsTask)).status).toBe(403);
    expect((await s.markDone(await s.addTask())).status).toBe(200);
  });
});

describe("memory and glossary lookup", () => {
  it("answers a vendor for the languages of an open task, and nothing else", async () => {
    const s = await setUp("vendor");
    expect((await s.lookUp("fr-FR")).status).toBe(404);

    await s.addTask({ targetLocales: ["fr-FR"] });
    const response = await s.lookUp("fr-FR");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      concordance: { glossaryTerms: [], translationMemoryMatches: [] },
    });
    expect((await s.lookUp("de-DE")).status).toBe(404);
    expect((await s.lookUp("fr-FR", "project_that_is_not_theirs")).status).toBe(404);
    expect((await s.lookUp("fr-FR", "ext:crowdin:123")).status).toBe(404);
  });

  it("answers only for the text of a string in the task's file, so it cannot be used to browse", async () => {
    const s = await setUp("vendor");
    await s.addTask();
    expect((await s.lookUp("fr-FR", s.project.id, "Hello")).status).toBe(200);
    expect((await s.lookUp("fr-FR", s.project.id, "  Hello  ")).status).toBe(200);
    expect((await s.lookUp("fr-FR", s.project.id, "Any other words")).status).toBe(404);
    expect((await s.lookUp("fr-FR", s.project.id, s.otherFile.sourceText)).status).toBe(404);
  });

  it("gives matches without links or the means to change them", async () => {
    const s = await setUp("vendor");
    await s.addTask();
    const [memory] = await db
      .insert(schema.memories)
      .values({ organizationId: s.organization.id, name: "Project memory" })
      .returning({ id: schema.memories.id });
    await db.insert(schema.projectMemories).values({
      organizationId: s.organization.id,
      projectId: s.project.id,
      memoryId: memory!.id,
    });
    await db.insert(schema.memoryEntries).values({
      memoryId: memory!.id,
      sourceLocale: "en-US",
      targetLocale: "fr-FR",
      sourceText: "Hello",
      normalizedSourceText: normalizeTranslationMemorySourceText("Hello"),
      targetText: "Bonjour",
    });

    type Match = { targetText: string; canEdit: boolean; canDelete: boolean; segmentRef?: unknown };
    const matchesFor = async (response: Response) =>
      ((await response.json()) as { concordance: { translationMemoryMatches: Match[] } })
        .concordance.translationMemoryMatches;

    const asVendor = await matchesFor(await s.lookUp("fr-FR"));
    expect(asVendor.map((match) => match.targetText)).toEqual(["Bonjour"]);
    expect(asVendor[0]).toMatchObject({ canEdit: false, canDelete: false });
    expect(asVendor[0]?.segmentRef).toBeUndefined();

    // The same lookup for the project's admin still carries the means to edit the entry.
    const admin = await fixture.authHeadersFor(s.admin);
    const asAdmin = await matchesFor(
      await app.request(
        `http://localhost/api/orgs/${s.admin.organization.slug}/projects/${s.project.id}/files/detail/cat/concordance`,
        {
          method: "POST",
          headers: { ...admin, "content-type": "application/json" },
          body: JSON.stringify({
            sourceLocale: "en-US",
            targetLocale: "fr-FR",
            sourceText: "Hello",
          }),
        },
      ),
    );
    expect(asAdmin[0]).toMatchObject({ targetText: "Bonjour", canEdit: true, canDelete: true });
    expect(asAdmin[0]?.segmentRef).toBeDefined();
  });

  it("stops when the task is finished or given to someone else", async () => {
    const s = await setUp("vendor");
    const task = await s.addTask();
    expect((await s.lookUp("fr-FR")).status).toBe(200);
    await db.update(schema.jobs).set({ ownerUserId: s.adminId }).where(eq(schema.jobs.id, task));
    expect((await s.lookUp("fr-FR")).status).toBe(404);
    await db
      .update(schema.jobs)
      .set({ ownerUserId: s.personId, status: "succeeded" })
      .where(eq(schema.jobs.id, task));
    expect((await s.lookUp("fr-FR")).status).toBe(404);
  });

  it("answers a task owner outside the team the same way, and a teammate as before", async () => {
    const s = await setUp("translator");
    expect((await s.lookUp("fr-FR")).status).toBe(404);
    await s.addTask({ targetLocales: ["fr-FR"] });
    expect((await s.lookUp("fr-FR")).status).toBe(200);
    expect((await s.lookUp("de-DE")).status).toBe(404);

    await s.joinProjectTeam();
    expect((await s.lookUp("de-DE")).status).toBe(200);
  });
});

describe("the task's file", () => {
  it("gives a vendor the file of an open task and no other", async () => {
    const s = await setUp("vendor");
    expect(await s.errorCode(await s.asset(s.file.storedFileId))).toBe("project_not_found");

    await s.addTask();
    // Past the access check: the test storage holds no object, so the file itself is not found.
    expect(await s.errorCode(await s.asset(s.file.storedFileId))).toBe("not_found");
    expect(await s.errorCode(await s.asset(s.otherFile.storedFileId))).toBe("project_not_found");
  });

  it("gives a vendor the translation of the task's file in a task language only", async () => {
    const s = await setUp("vendor");
    await s.addTask({ targetLocales: ["fr-FR"] });

    expect(await s.errorCode(await s.download(s.otherFile.sourcePath, "fr-FR"))).toBe(
      "project_not_found",
    );
    expect(await s.errorCode(await s.download(s.file.sourcePath, "de-DE"))).toBe(
      "project_not_found",
    );
    // Past the access check, the route answers with the file itself.
    const own = await s.download(s.file.sourcePath, "fr-FR");
    expect(own.status).toBe(200);
    expect(own.headers.get("content-disposition")).toContain("app-fr-FR.json");
  });

  it("does not open the default branch's file to a task on another branch of that path", async () => {
    const s = await setUp("vendor");
    const onBranch = await s.addFile(s.file.sourcePath, "release", "Hello on release");
    await s.addTask({ storedFileId: onBranch.storedFileId });

    // The download serves the default branch only, which is not the task's file.
    expect(await s.errorCode(await s.download(s.file.sourcePath, "fr-FR"))).toBe(
      "project_not_found",
    );
    // The task's own upload is still theirs; the default branch's upload is not.
    expect(await s.errorCode(await s.asset(onBranch.storedFileId))).toBe("not_found");
    expect(await s.errorCode(await s.asset(s.file.storedFileId))).toBe("project_not_found");
    // Lookup is for the strings of the task's file, not the default branch's.
    expect((await s.lookUp("fr-FR", s.project.id, "Hello on release")).status).toBe(200);
    expect((await s.lookUp("fr-FR", s.project.id, "Hello")).status).toBe(404);
  });

  it("does not take a copy of the upload on another branch for the task's file", async () => {
    const s = await setUp("vendor");
    await s.addTask();
    // Creating a branch copies the upload record with the same stored file.
    const [branchFile] = await db
      .insert(schema.repositorySourceFiles)
      .values({
        organizationId: s.organization.id,
        projectId: s.project.id,
        sourcePath: s.file.sourcePath,
        branchName: "release",
      })
      .returning({ id: schema.repositorySourceFiles.id });
    await db.insert(schema.repositorySourceFileVersions).values({
      repositorySourceFileId: branchFile!.id,
      organizationId: s.organization.id,
      projectId: s.project.id,
      sourcePath: s.file.sourcePath,
      storedFileId: s.file.storedFileId,
    });

    const access = await resolveTaskRouteProjectAccess(
      globalThis.__testApiAuthContext!,
      s.project.id,
    );
    expect(access?.kind === "task" ? access.files.map((file) => file.branchName) : null).toEqual([
      "main",
    ]);
  });

  it("changes nothing for someone on the project's team", async () => {
    const s = await setUp("translator");
    await s.joinProjectTeam();
    expect(await s.errorCode(await s.asset(s.otherFile.storedFileId))).toBe("not_found");
    const other = await s.download(s.otherFile.sourcePath, "de-DE");
    expect(other.status === 200 ? "ok" : await s.errorCode(other)).not.toBe("project_not_found");
  });
});

describe("creating a job with an owner", () => {
  it("gives a vendor a proofread task on a file, and no other job", async () => {
    const s = await setUp("vendor");
    const headers = await fixture.authHeadersFor(s.admin);
    const create = (kind: "proofread" | "translation") =>
      app.request(
        `http://localhost/api/orgs/${s.admin.organization.slug}/projects/${s.project.id}/jobs`,
        {
          method: "POST",
          headers: { ...headers, "content-type": "application/json" },
          body: JSON.stringify({
            type: "file",
            title: "Homepage",
            kind,
            ownerWorkosUserId: s.personIdentity.user.workosUserId,
            fileInput: {
              sourceFileId: s.file.storedFileId,
              fileFormat: "json",
              sourceLocale: "en-US",
              targetLocales: ["fr-FR"],
            },
          }),
        },
      );

    const refused = await create("translation");
    expect(refused.status).toBe(400);
    expect(await s.errorCode(refused)).toBe("vendor_owner_not_allowed");

    const made = await create("proofread");
    expect(made.status).toBe(201);
    const { job } = (await made.json()) as { job: { id: string } };
    const [stored] = await db
      .select({ ownerUserId: schema.jobs.ownerUserId })
      .from(schema.jobs)
      .where(eq(schema.jobs.id, job.id));
    expect(stored?.ownerUserId).toBe(s.personId);
  });
});

describe("access through a task", () => {
  it("covers every upload of the task's file", async () => {
    const s = await setUp("vendor");
    await s.addTask();
    const newer = await insertStoredSourceFile({
      organizationId: s.organization.id,
      projectId: s.project.id,
      filename: "app.json",
      sourceKind: "repository_file",
    });
    await db.insert(schema.repositorySourceFileVersions).values({
      repositorySourceFileId: s.file.sourceFileId,
      organizationId: s.organization.id,
      projectId: s.project.id,
      sourcePath: s.file.sourcePath,
      storedFileId: newer.id,
    });

    const auth = globalThis.__testApiAuthContext!;
    const access = await resolveTaskRouteProjectAccess(auth, s.project.id);
    expect(access?.kind).toBe("task");
    expect(access?.kind === "task" ? access.files[0]?.storedFileIds.toSorted() : null).toEqual(
      [newer.id, s.file.storedFileId].toSorted(),
    );
    expect(taskRouteAccessCovers(access!, { sourceFileId: newer.id })).toBe(true);
    expect(taskRouteAccessCovers(access!, { sourceFileId: s.file.storedFileId })).toBe(true);
    expect(taskRouteAccessCovers(access!, { sourceFileId: s.otherFile.storedFileId })).toBe(false);
    expect(taskRouteAccessCovers(access!, { sourcePath: s.file.sourcePath, locale: "fr-FR" })).toBe(
      true,
    );
    expect(taskRouteAccessCovers(access!, { sourcePath: s.file.sourcePath, locale: "de-DE" })).toBe(
      false,
    );
  });

  it("reads a task's step, and finds a waiting task only when asked", async () => {
    const s = await setUp("vendor");
    const ids = { organizationId: s.organization.id, userId: s.personId };
    const postEdit = await s.addTask({ step: "edit" });
    const proofread = await s.addTask();
    const waiting = await s.addTask({ status: "queued", afterJobId: postEdit });
    const queued = await s.addTask({ status: "queued" });

    expect(await findOwnedFileTask({ ...ids, jobId: postEdit })).toMatchObject({
      step: "edit",
      sourceFileId: s.file.storedFileId,
      targetLocales: ["fr-FR"],
      projectId: s.project.id,
    });
    expect((await findOwnedFileTask({ ...ids, jobId: proofread }))?.step).toBe("proofread");
    expect(await findOwnedFileTask({ ...ids, jobId: waiting })).toBeNull();
    expect(
      (await findOwnedFileTask({ ...ids, jobId: waiting, includeWaiting: true }))?.status,
    ).toBe("queued");
    // Queued without an earlier job is AI work that has not started, not a waiting task.
    expect(await findOwnedFileTask({ ...ids, jobId: queued, includeWaiting: true })).toBeNull();
    expect(await findOwnedFileTask({ ...ids, userId: s.adminId, jobId: proofread })).toBeNull();
  });
});
