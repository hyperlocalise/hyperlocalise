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

import type { ReactElement } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { insertStoredSourceFile } from "@/api/routes/public-jobs/public-jobs.fixture";
import { db, schema } from "@/lib/database/client";
import type { OrganizationMembershipRole } from "@/lib/database/types";
import { ensureTeamMembership } from "@/lib/teams/default-workspace-team";

/*
 * What the task's page and its editor page decide on the server: whether the person is there
 * through the project's team, as before, or only through a task they own.
 */
const mocks = vi.hoisted(() => ({ authOptions: [] as Array<{ allowVendor?: boolean }> }));

vi.mock("next/navigation", () => ({
  redirect: (location: string) => {
    throw new Error(`redirect:${location}`);
  },
}));
vi.mock("@/lib/workos/app-auth", () => ({
  requireAppAuthContext: async (options: { allowVendor?: boolean }) => {
    mocks.authOptions.push(options);
    return globalThis.__testApiAuthContext;
  },
}));
vi.mock("@/lib/flags/release-flags", () => ({
  isReleaseCatAdaptiveWorkspaceEnabled: async () => false,
  isReleaseContentEditorAllFilesEnabled: async () => false,
}));
vi.mock("@/lib/seo/authenticated-page-metadata", () => ({
  generateAuthenticatedPageMetadata: async () => ({}),
}));
vi.mock("./_components/job-detail-page-content", () => ({
  JobDetailPageContent: () => null,
}));
vi.mock("./strings/_components/job-content-editor-page-content", () => ({
  JobContentEditorPageContent: function TeamEditor() {
    return null;
  },
}));
vi.mock("./strings/_components/task-job-content-editor", () => ({
  TaskJobContentEditor: function TaskEditor() {
    return null;
  },
}));

import TaskPage from "./page";
import EditorPage from "./strings/page";

const fixture = createProjectTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  mocks.authOptions.length = 0;
  await fixture.cleanup();
});

type Loaded = ReactElement<Record<string, unknown>> & { type: { name?: string } };

/** Runs a page's server loader and returns what it renders. */
async function load(page: (props: never) => ReactElement, props: object): Promise<Loaded> {
  const shell = page(props as never) as ReactElement<object> & {
    type: (props: object) => Promise<Loaded>;
  };
  return shell.type(shell.props);
}

/** "vendor" is a reviewer in a vendor team. */
async function setUp(
  role: OrganizationMembershipRole | "vendor",
  options: { onTeam?: boolean } = {},
) {
  const { identity: admin, organization, project } = await fixture.createStoredProjectFixture();
  const person = fixture.createWorkosIdentityForOrganization(
    admin.organization,
    role === "vendor" ? "reviewer" : role,
  );
  // The page reads the signed-in person from here.
  await fixture.authHeadersFor(person);
  const personId = await fixture.getLocalUserId(person.user.workosUserId);
  if (role === "vendor") {
    await fixture.joinVendorTeam(person);
  }
  if (options.onTeam) {
    await ensureTeamMembership({ teamId: project.teamId!, userId: personId, role: "member" });
  }
  const file = await insertStoredSourceFile({
    organizationId: organization.id,
    projectId: project.id,
    filename: "app.json",
    contentType: "application/json",
    sourceKind: "repository_file",
  });

  async function addTask(
    input: {
      status?: (typeof schema.jobs.$inferInsert)["status"];
      ownerUserId?: string | null;
    } = {},
  ) {
    const id = `job_${randomUUID()}`;
    await db.insert(schema.jobs).values({
      id,
      organizationId: organization.id,
      projectId: project.id,
      ownerUserId: input.ownerUserId === undefined ? personId : input.ownerUserId,
      assigneeType: "user",
      kind: "proofread",
      status: input.status ?? "waiting_for_review",
      inputPayload: { sourceFileId: file.id, sourceLocale: "en-US", targetLocales: ["fr-FR"] },
    });
    return id;
  }

  const slug = admin.organization.slug ?? "missing-slug";
  const params = (jobId: string, projectId = project.id) =>
    Promise.resolve({ organizationSlug: slug, projectId, jobId });
  return {
    slug,
    project,
    addTask,
    taskPage: (jobId: string, projectId?: string) =>
      load(TaskPage, { params: params(jobId, projectId) }),
    editorPage: (jobId: string, projectId?: string) =>
      load(EditorPage, { params: params(jobId, projectId), searchParams: Promise.resolve({}) }),
  };
}

describe("the task's page", () => {
  it("gives a vendor the reduced page for an open task they own", async () => {
    const s = await setUp("vendor");
    const page = await s.taskPage(await s.addTask());

    expect(mocks.authOptions).toEqual([expect.objectContaining({ allowVendor: true })]);
    expect(page.props).toMatchObject({
      taskOwnerOnly: true,
      canEditJobFields: false,
      canMarkOwnTaskDone: true,
      canMarkAnyTaskDone: false,
    });
  });

  it("sends a vendor to My jobs for anything that is not their own open or waiting task", async () => {
    const s = await setUp("vendor");
    const toMyJobs = `redirect:/org/${s.slug}/my-jobs`;

    await expect(s.taskPage(await s.addTask({ ownerUserId: null }))).rejects.toThrow(toMyJobs);
    await expect(s.taskPage(await s.addTask({ status: "succeeded" }))).rejects.toThrow(toMyJobs);
    await expect(s.taskPage(`job_${randomUUID()}`)).rejects.toThrow(toMyJobs);
    // Their own task named under another project.
    await expect(s.taskPage(await s.addTask(), "project_other")).rejects.toThrow(toMyJobs);
  });

  it("gives a translator outside the project's team the reduced page for their own task", async () => {
    const s = await setUp("translator");
    const page = await s.taskPage(await s.addTask());

    expect(page.props).toMatchObject({
      taskOwnerOnly: true,
      canEditJobFields: false,
      canMarkOwnTaskDone: true,
    });
  });

  it("does not let a member outside the team, who cannot work on jobs, mark a task done", async () => {
    const s = await setUp("member");
    const page = await s.taskPage(await s.addTask());

    expect(page.props).toMatchObject({ taskOwnerOnly: true, canMarkOwnTaskDone: false });
  });

  it("changes nothing for someone on the project's team, or for an admin", async () => {
    const onTeam = await setUp("translator", { onTeam: true });
    expect((await onTeam.taskPage(await onTeam.addTask())).props).toMatchObject({
      taskOwnerOnly: false,
      canEditJobFields: true,
    });

    const admin = await setUp("admin");
    expect((await admin.taskPage(await admin.addTask())).props).toMatchObject({
      taskOwnerOnly: false,
      canEditJobFields: true,
      canMarkAnyTaskDone: true,
    });
  });
});

describe("the task's editor page", () => {
  it("opens the task editor for a vendor, and for a translator outside the team, on an open task", async () => {
    for (const role of ["vendor", "translator"] as const) {
      const s = await setUp(role);
      const taskId = await s.addTask();
      const page = await s.editorPage(taskId);

      expect(page.type.name, role).toBe("TaskEditor");
      expect(page.props, role).toMatchObject({ projectId: s.project.id, jobId: taskId });
    }
  });

  it("sends a vendor to My jobs when the task is finished, not theirs, or in another project", async () => {
    const s = await setUp("vendor");
    const toMyJobs = `redirect:/org/${s.slug}/my-jobs`;

    await expect(s.editorPage(await s.addTask({ status: "succeeded" }))).rejects.toThrow(toMyJobs);
    await expect(s.editorPage(await s.addTask({ ownerUserId: null }))).rejects.toThrow(toMyJobs);
    await expect(s.editorPage(await s.addTask(), "project_other")).rejects.toThrow(toMyJobs);
  });

  it("opens the usual editor for someone on the project's team", async () => {
    const s = await setUp("translator", { onTeam: true });
    const page = await s.editorPage(await s.addTask());

    expect(page.type.name).toBe("TeamEditor");
  });
});
