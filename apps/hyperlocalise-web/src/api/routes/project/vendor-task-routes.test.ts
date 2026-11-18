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

  async function addFile(sourcePath: string) {
    const stored = await insertStoredSourceFile({
      organizationId: organization.id,
      projectId: project.id,
      filename: sourcePath.split("/").at(-1),
      contentType: "application/json",
      sourceKind: "repository_file",
    });
    const [sourceFile] = await db
      .insert(schema.repositorySourceFiles)
      .values({ organizationId: organization.id, projectId: project.id, sourcePath })
      .returning({ id: schema.repositorySourceFiles.id });
    await db.insert(schema.repositorySourceFileVersions).values({
      repositorySourceFileId: sourceFile!.id,
      organizationId: organization.id,
      projectId: project.id,
      sourcePath,
      storedFileId: stored.id,
    });
    return { storedFileId: stored.id, sourceFileId: sourceFile!.id, sourcePath };
  }

  const file = await addFile("locales/app.json");
  const otherFile = await addFile("locales/other.json");

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
    lookUp: (targetLocale: string, projectId = project.id) =>
      request("POST", `/projects/${projectId}/files/detail/cat/concordance`, {
        sourceLocale: "en-US",
        targetLocale,
        sourceText: "Hello",
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

    const response = await s.markDone(task);
    expect(response.status).toBe(200);
    expect(((await response.json()) as { job: { status: string } }).job.status).toBe("succeeded");
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
    const own = await s.download(s.file.sourcePath, "fr-FR");
    expect(own.status === 200 ? "ok" : await s.errorCode(own)).not.toBe("project_not_found");
  });

  it("changes nothing for someone on the project's team", async () => {
    const s = await setUp("translator");
    await s.joinProjectTeam();
    expect(await s.errorCode(await s.asset(s.otherFile.storedFileId))).toBe("not_found");
    const other = await s.download(s.otherFile.sourcePath, "de-DE");
    expect(other.status === 200 ? "ok" : await s.errorCode(other)).not.toBe("project_not_found");
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
