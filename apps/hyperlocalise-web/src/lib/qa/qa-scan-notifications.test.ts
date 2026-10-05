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

import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { db, schema } from "@/lib/database/client";
import {
  ISSUE_NOTIFICATION_QA_ERRORS_INCREASED,
  ISSUE_NOTIFICATION_QA_SCAN_FAILED,
  issueNotificationService,
} from "@/lib/projects/issue-sheet/issue-notification-service";

import { emptyTranslationQaSummary } from "./qa-report-store";
import {
  notifyQaScanFailed,
  notifyQaScanSucceeded,
  qaErrorsIncrease,
} from "./qa-scan-notifications";

const projectFixture = createProjectTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.restoreAllMocks();
  await projectFixture.cleanup();
});

async function localUserForRole(
  organization: Awaited<
    ReturnType<typeof projectFixture.createStoredProjectFixture>
  >["identity"]["organization"],
  role: "localization_manager" | "developer" | "translator" | "member",
) {
  const identity = projectFixture.createWorkosIdentityForOrganization(organization, role);
  const { user } = await projectFixture.createLocalWorkosIdentity(identity);
  return user;
}

async function insertQaRun(input: {
  organizationId: string;
  projectId: string;
  createdByUserId: string | null;
  status: "succeeded" | "failed";
  errorCount: number;
  createdAt: Date;
  completedAt?: Date | null;
  errorCode?: string | null;
}) {
  const [run] = await db
    .insert(schema.translationQaRuns)
    .values({
      organizationId: input.organizationId,
      projectId: input.projectId,
      trigger: "manual",
      status: input.status,
      createdByUserId: input.createdByUserId,
      errorCount: input.errorCount,
      errorCode: input.errorCode ?? null,
      summary: emptyTranslationQaSummary(),
      createdAt: input.createdAt,
      completedAt: input.completedAt === undefined ? input.createdAt : input.completedAt,
    })
    .returning({ id: schema.translationQaRuns.id });
  return run!;
}

describe("qaErrorsIncrease", () => {
  it("counts new errors against the previous successful scan", () => {
    expect(qaErrorsIncrease(5, 2)).toBe(3);
  });

  it("treats every error as new when there is no previous successful scan", () => {
    expect(qaErrorsIncrease(4, null)).toBe(4);
  });

  it("returns zero when errors stayed the same or went down", () => {
    expect(qaErrorsIncrease(2, 2)).toBe(0);
    expect(qaErrorsIncrease(1, 6)).toBe(0);
    expect(qaErrorsIncrease(0, null)).toBe(0);
  });
});

describe("QA scan notification recipients and baseline", () => {
  it("alerts project writers and the assignable initiator, not translators", async () => {
    const {
      identity,
      organization,
      project,
      user: admin,
    } = await projectFixture.createStoredProjectFixture();
    const manager = await localUserForRole(identity.organization, "localization_manager");
    const developer = await localUserForRole(identity.organization, "developer");
    const translator = await localUserForRole(identity.organization, "translator");
    const member = await localUserForRole(identity.organization, "member");

    await db.insert(schema.teamMemberships).values([
      { teamId: project.teamId!, userId: translator.id, role: "member" },
      { teamId: project.teamId!, userId: member.id, role: "member" },
    ]);

    const notifyQaRun = vi
      .spyOn(issueNotificationService, "notifyQaRun")
      .mockResolvedValue(undefined);

    const run = await insertQaRun({
      organizationId: organization.id,
      projectId: project.id,
      createdByUserId: member.id,
      status: "succeeded",
      errorCount: 4,
      createdAt: new Date("2026-10-03T12:00:00.000Z"),
    });

    await notifyQaScanSucceeded(run.id);

    expect(notifyQaRun).toHaveBeenCalledOnce();
    const recipients = [...(notifyQaRun.mock.calls[0]?.[0].recipientUserIds ?? [])];
    expect(recipients).toEqual(expect.arrayContaining([admin.id, manager.id, member.id]));
    expect(recipients).not.toContain(translator.id);
    expect(recipients).not.toContain(developer.id);
    expect(notifyQaRun.mock.calls[0]?.[0]).toMatchObject({
      type: ISSUE_NOTIFICATION_QA_ERRORS_INCREASED,
      payload: { errorCount: 4, errorsChange: 4 },
    });
  });

  it("compares against the latest completed successful scan and ignores failures", async () => {
    const { organization, project, user } = await projectFixture.createStoredProjectFixture();
    const notifyQaRun = vi
      .spyOn(issueNotificationService, "notifyQaRun")
      .mockResolvedValue(undefined);

    await insertQaRun({
      organizationId: organization.id,
      projectId: project.id,
      createdByUserId: user.id,
      status: "succeeded",
      errorCount: 2,
      createdAt: new Date("2026-10-01T00:00:00.000Z"),
      completedAt: new Date("2026-10-01T01:00:00.000Z"),
    });
    await insertQaRun({
      organizationId: organization.id,
      projectId: project.id,
      createdByUserId: user.id,
      status: "failed",
      errorCount: 99,
      createdAt: new Date("2026-10-02T00:00:00.000Z"),
      completedAt: new Date("2026-10-02T12:00:00.000Z"),
      errorCode: "sandbox_timeout",
    });
    const current = await insertQaRun({
      organizationId: organization.id,
      projectId: project.id,
      createdByUserId: user.id,
      status: "succeeded",
      errorCount: 5,
      createdAt: new Date("2026-10-03T00:00:00.000Z"),
      completedAt: new Date("2026-10-03T01:00:00.000Z"),
    });

    await notifyQaScanSucceeded(current.id);

    expect(notifyQaRun).toHaveBeenCalledOnce();
    expect(notifyQaRun.mock.calls[0]?.[0].payload).toMatchObject({
      errorCount: 5,
      errorsChange: 3,
    });
  });

  it("does not notify when errors did not increase", async () => {
    const { organization, project, user } = await projectFixture.createStoredProjectFixture();
    const notifyQaRun = vi
      .spyOn(issueNotificationService, "notifyQaRun")
      .mockResolvedValue(undefined);

    await insertQaRun({
      organizationId: organization.id,
      projectId: project.id,
      createdByUserId: user.id,
      status: "succeeded",
      errorCount: 5,
      createdAt: new Date("2026-10-01T00:00:00.000Z"),
    });
    const current = await insertQaRun({
      organizationId: organization.id,
      projectId: project.id,
      createdByUserId: user.id,
      status: "succeeded",
      errorCount: 4,
      createdAt: new Date("2026-10-02T00:00:00.000Z"),
    });

    await notifyQaScanSucceeded(current.id);
    expect(notifyQaRun).not.toHaveBeenCalled();
  });

  it("notifies writers when a scan fails", async () => {
    const { organization, project, user } = await projectFixture.createStoredProjectFixture();
    const notifyQaRun = vi
      .spyOn(issueNotificationService, "notifyQaRun")
      .mockResolvedValue(undefined);
    const run = await insertQaRun({
      organizationId: organization.id,
      projectId: project.id,
      createdByUserId: user.id,
      status: "failed",
      errorCount: 0,
      createdAt: new Date("2026-10-04T00:00:00.000Z"),
      errorCode: "cli_unavailable",
    });

    await notifyQaScanFailed(run.id);

    expect(notifyQaRun).toHaveBeenCalledOnce();
    expect(notifyQaRun.mock.calls[0]?.[0]).toMatchObject({
      type: ISSUE_NOTIFICATION_QA_SCAN_FAILED,
      payload: { errorCode: "cli_unavailable" },
    });
    expect([...(notifyQaRun.mock.calls[0]?.[0].recipientUserIds ?? [])]).toContain(user.id);
  });
});
