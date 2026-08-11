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
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db, schema } from "@/lib/database";
import { userNotificationPreferencesService } from "@/lib/notifications/user-notification-preferences-service";
import { IssueSheetService } from "@/lib/projects/issue-sheet/issue-sheet-service";
import { ensureDefaultWorkspaceTeam } from "@/lib/teams/default-workspace-team";
import type { IssueNotificationEmailEventData } from "@/lib/workflow/types";

const sendMock = vi.fn(
  async (
    _input: { from: string; to: string[]; subject: string; html: string; text: string },
    _options?: { idempotencyKey?: string },
  ): Promise<{ data: { id: string } | null; error: { message: string } | null }> => ({
    data: { id: "email_1" },
    error: null,
  }),
);

vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: sendMock,
    };
  },
}));

vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return {
    ...actual,
    env: {
      ...actual.env,
      RESEND_API_KEY: "test-resend-api-key",
      RESEND_FROM_ADDRESS: "notifications@example.com",
      RESEND_FROM_NAME: "Hyperlocalise",
    },
  };
});

const authFixture = createAuthTestFixture();
const issueSheetService = new IssueSheetService();

beforeAll(async () => {
  await db.$client.query("select 1");
});

beforeEach(() => {
  sendMock.mockClear();
});

afterEach(async () => {
  await authFixture.cleanup();
});

async function createAssignedNotificationFixture() {
  const actorIdentity = authFixture.createWorkosIdentityWithRole("admin");
  await authFixture.authHeadersFor(actorIdentity);
  const { organization, user: actor } = await authFixture.createLocalWorkosIdentity(actorIdentity);

  const memberIdentity = authFixture.createWorkosIdentityForOrganization(
    actorIdentity.organization,
    "member",
  );
  await authFixture.authHeadersFor(memberIdentity);
  const assigneeUserId = await authFixture.getLocalUserId(memberIdentity.user.workosUserId);
  await authFixture.createLocalWorkosIdentity(memberIdentity);

  const team = await ensureDefaultWorkspaceTeam(organization.id);
  await db
    .insert(schema.teamMemberships)
    .values({
      teamId: team.id,
      userId: assigneeUserId,
      role: "member",
    })
    .onConflictDoNothing();

  await authFixture.authHeadersFor(actorIdentity);

  const [project] = await db
    .insert(schema.projects)
    .values({
      id: `project_${randomUUID()}`,
      organizationId: organization.id,
      teamId: team.id,
      createdByUserId: actor.id,
      name: "Workflow Email Project",
      description: "",
      translationContext: "",
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
    })
    .returning();

  const issue = await issueSheetService.createIssue({
    organizationId: organization.id,
    projectId: project.id,
    actorUserId: actor.id,
    body: {
      title: "Workflow email",
      assigneeUserId,
    },
  });

  const [notification] = await db
    .select()
    .from(schema.issueNotifications)
    .where(eq(schema.issueNotifications.issueId, issue.id))
    .limit(1);
  expect(notification).toBeTruthy();

  await userNotificationPreferencesService.upsertForUser(assigneeUserId, {
    emailEnabled: true,
    emailFormat: "immediate",
  });

  const event: IssueNotificationEmailEventData = {
    kind: "issue_notification_email",
    recipientUserId: assigneeUserId,
    emailFormat: "immediate",
    to: "assignee@example.com",
    subject: "You have 1 unread notification on Hyperlocalise.",
    html: "<p>Open your Inbox</p>",
    text: "Open your Inbox",
    notificationIds: [notification!.id],
  };

  return { assigneeUserId, notification: notification!, event };
}

describe("sendIssueNotificationEmailStep", () => {
  it("marks emailedAt only after Resend succeeds and uses an idempotency key", async () => {
    const { notification, event } = await createAssignedNotificationFixture();
    const { sendIssueNotificationEmailStep } =
      await import("@/workflows/steps/issue-notification-email");

    const result = await sendIssueNotificationEmailStep(event);
    expect(result).toMatchObject({ ok: true, skipped: false, markedCount: 1 });
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0]?.[1]?.idempotencyKey).toMatch(
      /^issue-notification-email\/[a-f0-9]{64}$/,
    );

    const [updated] = await db
      .select()
      .from(schema.issueNotifications)
      .where(eq(schema.issueNotifications.id, notification.id))
      .limit(1);
    expect(updated?.emailedAt).not.toBeNull();

    await db
      .update(schema.issueNotifications)
      .set({ emailedAt: null })
      .where(eq(schema.issueNotifications.id, notification.id));
    sendMock.mockResolvedValueOnce({
      data: null,
      error: { message: "Resend unavailable" },
    });

    await expect(sendIssueNotificationEmailStep(event)).rejects.toThrow("Resend unavailable");

    const [released] = await db
      .select({ emailedAt: schema.issueNotifications.emailedAt })
      .from(schema.issueNotifications)
      .where(eq(schema.issueNotifications.id, notification.id))
      .limit(1);
    expect(released?.emailedAt).toBeNull();
  });

  it("skips Resend when preferences changed before delivery", async () => {
    const { assigneeUserId, event } = await createAssignedNotificationFixture();
    const { sendIssueNotificationEmailStep } =
      await import("@/workflows/steps/issue-notification-email");

    await userNotificationPreferencesService.upsertForUser(assigneeUserId, {
      emailEnabled: false,
      emailFormat: "immediate",
    });
    sendMock.mockClear();

    const optedOutResult = await sendIssueNotificationEmailStep(event);

    expect(optedOutResult).toMatchObject({
      ok: true,
      skipped: true,
      reason: "delivery_preferences_changed",
    });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("skips Resend when notifications are already read", async () => {
    const { notification, assigneeUserId, event } = await createAssignedNotificationFixture();
    const { sendIssueNotificationEmailStep } =
      await import("@/workflows/steps/issue-notification-email");

    await db
      .update(schema.issueNotifications)
      .set({ readAt: new Date() })
      .where(eq(schema.issueNotifications.id, notification.id));

    await userNotificationPreferencesService.upsertForUser(assigneeUserId, {
      emailEnabled: true,
      emailFormat: "immediate",
    });

    const result = await sendIssueNotificationEmailStep(event);

    expect(result).toMatchObject({ ok: true, skipped: true, reason: "already_read_or_emailed" });
    expect(sendMock).not.toHaveBeenCalled();
  });
});
