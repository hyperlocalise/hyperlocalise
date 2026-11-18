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

import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { insertStoredSourceFile } from "@/api/routes/public-jobs/public-jobs.fixture";
import { db, schema } from "@/lib/database/client";
import type { OrganizationMembershipRole } from "@/lib/database/types";
import {
  assertAssignableIssueAssignee,
  listAssignableIssueMembers,
} from "@/lib/projects/issue-sheet/issue-sheet-assignee";
import { isErr, isOk } from "@/lib/primitives/result/results";
import { ensureTeamMembership } from "@/lib/teams/default-workspace-team";

import { createWorkflowTaskJob } from "./create-workflow-task-job";
import {
  isActiveWorkspaceMember,
  isFileTaskForPeople,
  readJobSourceFileId,
  refuseVendorOwnerUnlessFileTask,
  VENDOR_OWNER_NOT_ALLOWED_MESSAGE,
} from "./job-owner";
import { updateNativeJob } from "./update-native-job";

vi.mock("@/lib/reporting/task-analysis-start", () => ({
  startTaskAnalysis: vi.fn(async () => undefined),
}));
vi.mock("@/lib/activity-log/job-automation-events", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/activity-log/job-automation-events")>()),
  enqueueJobCreatedActivity: vi.fn(async () => undefined),
}));

const fixture = createProjectTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await fixture.cleanup();
});

async function setUp() {
  const { identity: admin, organization, project } = await fixture.createStoredProjectFixture();
  const file = await insertStoredSourceFile({
    organizationId: organization.id,
    projectId: project.id,
    filename: "messages.json",
    contentType: "application/json",
    sourceKind: "repository_file",
    metadata: { sourcePath: "locales/messages.json" },
  });

  /** Adds a member with the role, in no team. */
  async function member(role: OrganizationMembershipRole) {
    const identity = fixture.createWorkosIdentityForOrganization(admin.organization, role);
    await fixture.authHeadersFor(identity);
    return {
      workosUserId: identity.user.workosUserId,
      id: await fixture.getLocalUserId(identity.user.workosUserId),
    };
  }

  async function job(input: {
    kind: (typeof schema.jobs.$inferInsert)["kind"];
    sourceFileId?: string;
  }) {
    const [created] = await db
      .insert(schema.jobs)
      .values({
        id: `job_${randomUUID()}`,
        organizationId: organization.id,
        projectId: project.id,
        kind: input.kind,
        status: input.kind === "proofread" ? "waiting_for_review" : "queued",
        inputPayload: {
          ...(input.sourceFileId ? { sourceFileId: input.sourceFileId } : {}),
          sourceLocale: "en-US",
          targetLocales: ["fr-FR"],
        },
      })
      .returning({ id: schema.jobs.id });
    return created!.id;
  }

  const give = (jobId: string, ownerWorkosUserId: string) =>
    updateNativeJob({
      organizationId: organization.id,
      jobId,
      body: { ownerWorkosUserId },
      accessWhere: eq(schema.jobs.organizationId, organization.id),
    });
  const ownerOf = async (jobId: string) =>
    (
      await db
        .select({ ownerUserId: schema.jobs.ownerUserId })
        .from(schema.jobs)
        .where(eq(schema.jobs.id, jobId))
    )[0]?.ownerUserId;

  return { organization, project, file, member, job, give, ownerOf };
}

describe("which jobs are tasks on a file", () => {
  it("is a proofread job that names a file and is not mirrored from a provider", () => {
    expect(isFileTaskForPeople({ kind: "proofread", sourceFileId: "file_1" })).toBe(true);
    expect(isFileTaskForPeople({ kind: "proofread", sourceFileId: null })).toBe(false);
    expect(isFileTaskForPeople({ kind: "translation", sourceFileId: "file_1" })).toBe(false);
    expect(
      isFileTaskForPeople({ kind: "proofread", sourceFileId: "file_1", isProviderJob: true }),
    ).toBe(false);
  });

  it("reads the file from a job's saved input", () => {
    expect(readJobSourceFileId({ sourceFileId: "file_1" })).toBe("file_1");
    expect(readJobSourceFileId({ sourceFileId: "" })).toBeNull();
    expect(readJobSourceFileId({ sourceFileId: 7 })).toBeNull();
    expect(readJobSourceFileId({})).toBeNull();
    expect(readJobSourceFileId(null)).toBeNull();
    expect(readJobSourceFileId(["file_1"])).toBeNull();
  });
});

describe("who a job can be given to in the app", () => {
  it("gives a task on a file to any active member, a vendor included", async () => {
    const s = await setUp();
    const task = await s.job({ kind: "proofread", sourceFileId: s.file.id });
    const vendor = await s.member("vendor");
    const offTeam = await s.member("translator");

    expect(isOk(await s.give(task, vendor.workosUserId))).toBe(true);
    expect(await s.ownerOf(task)).toBe(vendor.id);
    expect(isOk(await s.give(task, offTeam.workosUserId))).toBe(true);
    expect(await s.ownerOf(task)).toBe(offTeam.id);
  });

  it("does not give a task on a file to someone whose invitation is still pending", async () => {
    const s = await setUp();
    const task = await s.job({ kind: "proofread", sourceFileId: s.file.id });
    const pending = await s.member("translator");
    await db
      .update(schema.organizationMemberships)
      .set({ workosMembershipId: null })
      .where(eq(schema.organizationMemberships.userId, pending.id));

    const result = await s.give(task, pending.workosUserId);
    expect(isErr(result) && result.error.code).toBe("assignee_not_assignable");
    expect(
      await isActiveWorkspaceMember({ organizationId: s.organization.id, userId: pending.id }),
    ).toBe(false);
  });

  it("never gives any other job to a vendor, even one left in the project's team", async () => {
    const s = await setUp();
    const vendor = await s.member("vendor");
    await ensureTeamMembership({ teamId: s.project.teamId!, userId: vendor.id, role: "member" });

    for (const jobId of [
      await s.job({ kind: "translation", sourceFileId: s.file.id }),
      await s.job({ kind: "proofread" }),
    ]) {
      const result = await s.give(jobId, vendor.workosUserId);
      expect(isErr(result) && result.error).toEqual({
        code: "vendor_owner_not_allowed",
        message: VENDOR_OWNER_NOT_ALLOWED_MESSAGE,
      });
      expect(await s.ownerOf(jobId)).toBeNull();
    }
  });

  it("still asks that the owner of any other job can open the project", async () => {
    const s = await setUp();
    const other = await s.job({ kind: "translation", sourceFileId: s.file.id });
    const translator = await s.member("translator");

    const refused = await s.give(other, translator.workosUserId);
    expect(isErr(refused) && refused.error.code).toBe("assignee_not_assignable");

    await ensureTeamMembership({
      teamId: s.project.teamId!,
      userId: translator.id,
      role: "member",
    });
    expect(isOk(await s.give(other, translator.workosUserId))).toBe(true);
  });
});

describe("the vendor owner check used where jobs are created", () => {
  it("refuses a vendor only when the job is not a task on a file", async () => {
    const s = await setUp();
    const vendor = await s.member("vendor");
    const translator = await s.member("translator");
    const check = (ownerUserId: string, fileTask: boolean) =>
      refuseVendorOwnerUnlessFileTask({ organizationId: s.organization.id, ownerUserId, fileTask });

    expect(isOk(await check(vendor.id, true))).toBe(true);
    expect(isErr(await check(vendor.id, false))).toBe(true);
    expect(isOk(await check(translator.id, false))).toBe(true);
    expect(isOk(await check(randomUUID(), false))).toBe(true);
  });

  it("lets the Assign task step give a vendor a post-edit or proofread task, not a translate task", async () => {
    const s = await setUp();
    const vendor = await s.member("vendor");
    const create = (step: "translate" | "edit" | "proofread") =>
      createWorkflowTaskJob({
        organizationId: s.organization.id,
        projectId: s.project.id,
        sourceFileId: s.file.id,
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
        step,
        assigneeWorkosUserId: vendor.workosUserId,
      });

    for (const step of ["edit", "proofread"] as const) {
      const result = await create(step);
      expect(isOk(result) && result.value.ownerUserId, step).toBe(vendor.id);
    }
    const translate = await create("translate");
    expect(isErr(translate) && translate.error).toEqual({
      code: "vendor_owner_not_allowed",
      message: VENDOR_OWNER_NOT_ALLOWED_MESSAGE,
    });
  });
});

describe("issues are never given to a vendor", () => {
  it("leaves a vendor out even when they were left in the project's team", async () => {
    const s = await setUp();
    const vendor = await s.member("vendor");
    const translator = await s.member("translator");
    for (const person of [vendor, translator]) {
      await ensureTeamMembership({ teamId: s.project.teamId!, userId: person.id, role: "member" });
    }
    const ids = { organizationId: s.organization.id, projectId: s.project.id };

    expect(isErr(await assertAssignableIssueAssignee({ ...ids, assigneeUserId: vendor.id }))).toBe(
      true,
    );
    expect(
      isOk(await assertAssignableIssueAssignee({ ...ids, assigneeUserId: translator.id })),
    ).toBe(true);
    const listed = (await listAssignableIssueMembers(ids)).map((member) => member.userId);
    expect(listed).toContain(translator.id);
    expect(listed).not.toContain(vendor.id);
  });
});
