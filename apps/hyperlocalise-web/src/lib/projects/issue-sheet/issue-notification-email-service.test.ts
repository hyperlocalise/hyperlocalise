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

import { and, eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db, schema } from "@/lib/database";
import { userNotificationPreferencesService } from "@/lib/notifications/user-notification-preferences-service";
import {
  ISSUE_NOTIFICATION_DIGEST_MIN_AGE_MS,
  IssueNotificationEmailService,
} from "@/lib/projects/issue-sheet/issue-notification-email-service";
import { IssueNotificationService } from "@/lib/projects/issue-sheet/issue-notification-service";
import { IssueSheetService } from "@/lib/projects/issue-sheet/issue-sheet-service";
import { ensureDefaultWorkspaceTeam } from "@/lib/teams/default-workspace-team";
import type { IssueNotificationEmailEventData } from "@/lib/workflow/types";

const enqueueMock = vi.fn(async (_event: IssueNotificationEmailEventData) => ({
  ids: ["workflow_run_1"],
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
      HYPERLOCALISE_PUBLIC_APP_URL: "https://app.example.com",
    },
  };
});

const authFixture = createAuthTestFixture();
const notificationService = new IssueNotificationService();
const emailService = new IssueNotificationEmailService(db, {
  enqueue: enqueueMock,
});
const issueSheetService = new IssueSheetService();

beforeAll(async () => {
  await db.$client.query("select 1");
});

beforeEach(() => {
  enqueueMock.mockClear();
});

afterEach(async () => {
  await authFixture.cleanup();
});

async function createAssignedNotification() {
  const actorIdentity = authFixture.createWorkosIdentityWithRole("admin");
  await authFixture.authHeadersFor(actorIdentity);
  const { organization, user: actor } = await authFixture.createLocalWorkosIdentity(actorIdentity);

  const memberIdentity = authFixture.createWorkosIdentityForOrganization(
    actorIdentity.organization,
    "member",
  );
  await authFixture.authHeadersFor(memberIdentity);
  const assigneeUserId = await authFixture.getLocalUserId(memberIdentity.user.workosUserId);
  const { user: assignee } = await authFixture.createLocalWorkosIdentity(memberIdentity);

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

  await db
    .update(schema.organizations)
    .set({ slug: organization.slug ?? `org-${randomUUID().slice(0, 8)}` })
    .where(eq(schema.organizations.id, organization.id));

  const [org] = await db
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.id, organization.id))
    .limit(1);

  const [project] = await db
    .insert(schema.projects)
    .values({
      id: `project_${randomUUID()}`,
      organizationId: organization.id,
      teamId: team.id,
      createdByUserId: actor.id,
      name: "Email Notification Project",
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
      title: "Email me",
      assigneeUserId,
    },
  });

  const [notification] = await db
    .select()
    .from(schema.issueNotifications)
    .where(eq(schema.issueNotifications.issueId, issue.id))
    .limit(1);

  return {
    actor,
    assignee,
    assigneeUserId,
    organization: org ?? organization,
    project,
    issue,
    notification,
  };
}

describe("IssueNotificationEmailService", () => {
  it("skips enqueue when preferences are disabled", async () => {
    const { notification, assigneeUserId } = await createAssignedNotification();
    expect(notification).toBeTruthy();

    await userNotificationPreferencesService.upsertForUser(assigneeUserId, {
      emailEnabled: false,
      emailFormat: "immediate",
    });

    await emailService.deliverImmediate([notification!.id]);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("enqueues immediate email onto the workflow queue", async () => {
    const { notification, assigneeUserId, assignee } = await createAssignedNotification();
    expect(notification).toBeTruthy();

    await userNotificationPreferencesService.upsertForUser(assigneeUserId, {
      emailEnabled: true,
      emailFormat: "immediate",
    });

    await emailService.deliverImmediate([notification!.id]);

    expect(enqueueMock).toHaveBeenCalledTimes(1);
    const event = enqueueMock.mock.calls[0]?.[0];
    expect(event).toMatchObject({
      kind: "issue_notification_email",
      recipientUserId: assigneeUserId,
      emailFormat: "immediate",
      to: assignee.email,
      notificationIds: [notification!.id],
    });
    expect(event!.subject).toContain("1 unread notification");
    expect(event!.html).toContain("Open your Inbox");
    expect(event!.text).toContain("Open your Inbox");

    // emailed_at is marked by the workflow consumer, not the producer.
    const [updated] = await db
      .select()
      .from(schema.issueNotifications)
      .where(eq(schema.issueNotifications.id, notification!.id))
      .limit(1);
    expect(updated?.emailedAt).toBeNull();
  });

  it("skips enqueue when the inbox item is already read", async () => {
    const { notification, assigneeUserId } = await createAssignedNotification();
    expect(notification).toBeTruthy();

    await userNotificationPreferencesService.upsertForUser(assigneeUserId, {
      emailEnabled: true,
      emailFormat: "immediate",
    });
    await db
      .update(schema.issueNotifications)
      .set({ readAt: new Date() })
      .where(eq(schema.issueNotifications.id, notification!.id));

    await emailService.deliverImmediate([notification!.id]);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("digest tick enqueues aged unread notifications", async () => {
    const { notification, assigneeUserId } = await createAssignedNotification();
    expect(notification).toBeTruthy();

    await userNotificationPreferencesService.upsertForUser(assigneeUserId, {
      emailEnabled: true,
      emailFormat: "digest",
    });

    const agedCreatedAt = new Date(Date.now() - ISSUE_NOTIFICATION_DIGEST_MIN_AGE_MS - 1000);
    await db
      .update(schema.issueNotifications)
      .set({ createdAt: agedCreatedAt, emailedAt: null, readAt: null })
      .where(eq(schema.issueNotifications.id, notification!.id));

    const results = await emailService.runDigestTick();
    expect(results.emailsEnqueued).toBeGreaterThanOrEqual(1);
    expect(enqueueMock).toHaveBeenCalled();
    expect(enqueueMock.mock.calls[0]?.[0]).toMatchObject({
      recipientUserId: assigneeUserId,
      emailFormat: "digest",
    });

    enqueueMock.mockClear();
    const preferenceSpy = vi
      .spyOn(userNotificationPreferencesService, "getForUser")
      .mockResolvedValue({ emailEnabled: false, emailFormat: "digest" });
    try {
      const optedOutResults = await emailService.runDigestTick();
      expect(optedOutResults.emailsEnqueued).toBe(0);
      expect(optedOutResults.notificationsQueued).toBe(0);
      expect(enqueueMock).not.toHaveBeenCalled();
    } finally {
      preferenceSpy.mockRestore();
    }
  });

  it("suppresses email and skips enqueue when recipient lacks project access", async () => {
    const { notification, assigneeUserId, project } = await createAssignedNotification();
    expect(notification).toBeTruthy();
    expect(project.teamId).toBeTruthy();

    await userNotificationPreferencesService.upsertForUser(assigneeUserId, {
      emailEnabled: true,
      emailFormat: "immediate",
    });

    // Remove team membership so the assignee can no longer access the project.
    await db
      .delete(schema.teamMemberships)
      .where(
        and(
          eq(schema.teamMemberships.userId, assigneeUserId),
          eq(schema.teamMemberships.teamId, project.teamId!),
        ),
      );

    await emailService.deliverImmediate([notification!.id]);
    expect(enqueueMock).not.toHaveBeenCalled();

    const [updated] = await db
      .select()
      .from(schema.issueNotifications)
      .where(eq(schema.issueNotifications.id, notification!.id))
      .limit(1);
    expect(updated?.emailedAt).not.toBeNull();

    // Digest must not keep retrying suppressed inaccessible rows.
    const agedCreatedAt = new Date(Date.now() - ISSUE_NOTIFICATION_DIGEST_MIN_AGE_MS - 1000);
    await db
      .update(schema.issueNotifications)
      .set({ createdAt: agedCreatedAt, emailedAt: null, readAt: null })
      .where(eq(schema.issueNotifications.id, notification!.id));
    await userNotificationPreferencesService.upsertForUser(assigneeUserId, {
      emailEnabled: true,
      emailFormat: "digest",
    });

    enqueueMock.mockClear();
    await emailService.runDigestTick();
    expect(
      enqueueMock.mock.calls.some((call) =>
        call[0]?.notificationIds?.includes(notification!.id),
      ),
    ).toBe(false);

    const [afterDigest] = await db
      .select({ emailedAt: schema.issueNotifications.emailedAt })
      .from(schema.issueNotifications)
      .where(eq(schema.issueNotifications.id, notification!.id))
      .limit(1);
    expect(afterDigest?.emailedAt).not.toBeNull();
  });

  it("clears emailed_at when a notification is re-opened via dedupe upsert", async () => {
    const { notification, assigneeUserId, organization, project, actor, issue } =
      await createAssignedNotification();
    expect(notification).toBeTruthy();

    await db
      .update(schema.issueNotifications)
      .set({ emailedAt: new Date(), readAt: new Date() })
      .where(eq(schema.issueNotifications.id, notification!.id));

    await notificationService.notifyAssigned({
      organizationId: organization.id,
      projectId: project.id,
      issueId: issue.id,
      actorUserId: actor.id,
      assigneeUserId,
      issueTitle: "Email me",
    });

    const [updated] = await db
      .select()
      .from(schema.issueNotifications)
      .where(eq(schema.issueNotifications.id, notification!.id))
      .limit(1);

    expect(updated?.readAt).toBeNull();
    expect(updated?.emailedAt).toBeNull();
  });
});
