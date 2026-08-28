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
import { and, asc, eq, inArray, isNull, lte } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { render } from "@react-email/render";

import { db, schema, type DatabaseClient } from "@/lib/database/client";
import type { IssueNotificationType } from "@/lib/database/schema/issue-sheet";
import { env } from "@/lib/env";
import { createLogger } from "@/lib/log";
import { userNotificationPreferencesService } from "@/lib/notifications/user-notification-preferences-service";
import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";
import { err, ok, type Result } from "@/lib/primitives/result/results";
import type {
  IssueNotificationEmailEventData,
  IssueNotificationEmailQueue,
} from "@/lib/workflow/types";
import {
  IssueInboxNotificationsEmail,
  issueInboxNotificationsPlainText,
  issueInboxNotificationsSubject,
  type EmailNotificationItem,
} from "@/emails/issue-inbox-notifications-email";
import { createIssueNotificationEmailQueue } from "@/workflows/adapters";

import { userHasIssueProjectAccess } from "./issue-sheet-assignee";

const logger = createLogger("issue-notification-email-service");
const recipientUsers = alias(schema.users, "issue_notification_recipient_users");
const actorUsers = alias(schema.users, "issue_notification_actor_users");

const DIGEST_MIN_AGE_MS = 5 * 60 * 1000;
const DIGEST_BATCH_CAP = 50;
const DIGEST_USER_CONCURRENCY = 5;

type EmailEnqueueError = {
  code: "email_not_configured" | "enqueue_failed" | "skipped";
  message: string;
};

type NotificationEmailRow = {
  id: string;
  organizationId: string;
  organizationSlug: string | null;
  projectId: string;
  issueId: string;
  type: IssueNotificationType;
  payload: {
    issueTitle: string;
    projectId: string;
    commentExcerpt?: string;
  };
  recipientUserId: string;
  recipientEmail: string;
  readAt: Date | null;
  emailedAt: Date | null;
  createdAt: Date;
  actorFirstName: string | null;
  actorLastName: string | null;
  actorEmail: string | null;
  actorAvatarUrl: string | null;
};

function publicAppOrigin(): string {
  return env.HYPERLOCALISE_PUBLIC_APP_URL ?? "http://localhost:3000";
}

function brandLogoUrl(): string {
  return `${publicAppOrigin()}/images/logo.png`;
}

function inboxUrl(organizationSlug: string): string {
  return `${publicAppOrigin()}/org/${encodeURIComponent(organizationSlug)}/inbox`;
}

function notificationUrl(organizationSlug: string, notificationId: string): string {
  return `${inboxUrl(organizationSlug)}/notifications/${encodeURIComponent(notificationId)}`;
}

function unsubscribeUrl(organizationSlug: string): string {
  return `${publicAppOrigin()}/org/${encodeURIComponent(organizationSlug)}/settings/account#notifications`;
}

function formatActorName(row: {
  actorFirstName: string | null;
  actorLastName: string | null;
  actorEmail: string | null;
}): string {
  const name = [row.actorFirstName, row.actorLastName].filter(Boolean).join(" ");
  return name || row.actorEmail || "Someone";
}

function actorInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || "?";
}

function issueLabel(issueId: string): string {
  return issueId.replaceAll("-", "").slice(0, 8).toUpperCase();
}

function toEmailItem(row: NotificationEmailRow, organizationSlug: string): EmailNotificationItem {
  const actorName = formatActorName(row);
  return {
    id: row.id,
    type: row.type,
    issueId: row.issueId,
    issueTitle: row.payload.issueTitle,
    issueLabel: issueLabel(row.issueId),
    actorName,
    actorAvatarUrl: row.actorAvatarUrl,
    actorInitials: actorInitials(actorName),
    actionHref: notificationUrl(organizationSlug, row.id),
    excerpt: row.payload.commentExcerpt ?? null,
  };
}

export class IssueNotificationEmailService {
  constructor(
    private readonly database: typeof db = db,
    private readonly emailQueue: IssueNotificationEmailQueue = createIssueNotificationEmailQueue(),
  ) {}

  /**
   * Prepare immediate emails and push them onto the Vercel Workflow queue.
   * Awaited so serverless requests do not finish before enqueue completes.
   */
  async scheduleImmediateDelivery(notificationIds: string[]): Promise<void> {
    if (notificationIds.length === 0) {
      return;
    }

    try {
      await this.deliverImmediate(notificationIds);
    } catch (error) {
      logger.warn(
        {
          count: notificationIds.length,
          errorName: error instanceof Error ? error.name : "unknown",
          errorMessage: error instanceof Error ? error.message : "unknown",
        },
        "immediate issue notification email enqueue failed",
      );
    }
  }

  async deliverImmediate(
    notificationIds: string[],
    database: DatabaseClient = this.database,
  ): Promise<void> {
    const rows = await this.loadNotificationRows(notificationIds, database);
    const open = rows.filter((row) => row.readAt == null && row.emailedAt == null);
    if (open.length === 0) {
      return;
    }

    const { accessible, inaccessible } = await this.partitionByProjectAccess(open, database);
    await this.suppressEmailForInaccessible(
      inaccessible.map((row) => row.id),
      database,
    );
    if (accessible.length === 0) {
      return;
    }

    const byRecipient = new Map<string, NotificationEmailRow[]>();
    for (const row of accessible) {
      const list = byRecipient.get(row.recipientUserId) ?? [];
      list.push(row);
      byRecipient.set(row.recipientUserId, list);
    }

    await mapWithConcurrency(
      [...byRecipient.entries()],
      DIGEST_USER_CONCURRENCY,
      async ([recipientUserId, recipientRows]) => {
        const prefs = await userNotificationPreferencesService.getForUser(
          recipientUserId,
          database,
        );
        if (!prefs.emailEnabled || prefs.emailFormat !== "immediate") {
          return;
        }

        for (const row of recipientRows) {
          const result = await this.enqueueEmailForRows([row], "immediate", database);
          if (!result.ok) {
            logger.warn(
              {
                recipientUserId,
                notificationId: row.id,
                code: result.error.code,
                message: result.error.message,
              },
              "immediate issue notification email enqueue skipped",
            );
          }
        }
      },
    );
  }

  async runDigestTick(database: DatabaseClient = this.database): Promise<{
    recipientsProcessed: number;
    emailsEnqueued: number;
    notificationsQueued: number;
  }> {
    const cutoff = new Date(Date.now() - DIGEST_MIN_AGE_MS);
    const candidateRows = await database
      .select({
        id: schema.issueNotifications.id,
        recipientUserId: schema.issueNotifications.recipientUserId,
      })
      .from(schema.issueNotifications)
      .innerJoin(
        schema.userNotificationPreferences,
        eq(schema.userNotificationPreferences.userId, schema.issueNotifications.recipientUserId),
      )
      .where(
        and(
          isNull(schema.issueNotifications.readAt),
          isNull(schema.issueNotifications.emailedAt),
          lte(schema.issueNotifications.createdAt, cutoff),
          eq(schema.userNotificationPreferences.emailEnabled, true),
          eq(schema.userNotificationPreferences.emailFormat, "digest"),
        ),
      )
      .orderBy(asc(schema.issueNotifications.createdAt))
      .limit(500);

    if (candidateRows.length === 0) {
      return { recipientsProcessed: 0, emailsEnqueued: 0, notificationsQueued: 0 };
    }

    const byRecipient = new Map<string, string[]>();
    for (const row of candidateRows) {
      const list = byRecipient.get(row.recipientUserId) ?? [];
      if (list.length < DIGEST_BATCH_CAP) {
        list.push(row.id);
      }
      byRecipient.set(row.recipientUserId, list);
    }

    let emailsEnqueued = 0;
    let notificationsQueued = 0;

    await mapWithConcurrency(
      [...byRecipient.entries()],
      DIGEST_USER_CONCURRENCY,
      async ([recipientUserId, notificationIds]) => {
        const prefs = await userNotificationPreferencesService.getForUser(
          recipientUserId,
          database,
        );
        if (!prefs.emailEnabled || prefs.emailFormat !== "digest") {
          return;
        }

        const rows = await this.loadNotificationRows(notificationIds, database);
        const open = rows.filter((row) => row.readAt == null && row.emailedAt == null);
        if (open.length === 0) {
          return;
        }

        const { accessible, inaccessible } = await this.partitionByProjectAccess(open, database);
        await this.suppressEmailForInaccessible(
          inaccessible.map((row) => row.id),
          database,
        );
        if (accessible.length === 0) {
          return;
        }

        // One digest email per organization — never mix tenant content or inbox URLs.
        const byOrganization = new Map<string, NotificationEmailRow[]>();
        for (const row of accessible) {
          const list = byOrganization.get(row.organizationId) ?? [];
          list.push(row);
          byOrganization.set(row.organizationId, list);
        }

        for (const orgRows of byOrganization.values()) {
          const result = await this.enqueueEmailForRows(orgRows, "digest", database);
          if (result.ok) {
            emailsEnqueued += 1;
            notificationsQueued += orgRows.length;
          } else {
            logger.warn(
              {
                notificationCount: orgRows.length,
                code: result.error.code,
                message: result.error.message,
              },
              "digest issue notification email enqueue skipped",
            );
          }
        }
      },
    );

    return {
      recipientsProcessed: byRecipient.size,
      emailsEnqueued,
      notificationsQueued,
    };
  }

  /**
   * Inbox list/get hide notifications for projects the recipient cannot access.
   * Email must apply the same gate — otherwise mention/watch rows leak issue titles
   * and comment excerpts across team boundaries, and inaccessible rows can stall digest.
   */
  private async partitionByProjectAccess(
    rows: NotificationEmailRow[],
    database: DatabaseClient,
  ): Promise<{ accessible: NotificationEmailRow[]; inaccessible: NotificationEmailRow[] }> {
    const accessible: NotificationEmailRow[] = [];
    const inaccessible: NotificationEmailRow[] = [];

    await mapWithConcurrency(rows, DIGEST_USER_CONCURRENCY, async (row) => {
      const hasAccess = await userHasIssueProjectAccess({
        organizationId: row.organizationId,
        projectId: row.projectId,
        userId: row.recipientUserId,
        database,
      });
      if (hasAccess) {
        accessible.push(row);
      } else {
        inaccessible.push(row);
      }
    });

    return { accessible, inaccessible };
  }

  /**
   * Mark inaccessible rows emailed so digest candidates advance. Without this, up to
   * DIGEST_BATCH_CAP inaccessible rows can occupy every tick forever and starve
   * deliverable notifications for that user.
   */
  private async suppressEmailForInaccessible(
    notificationIds: string[],
    database: DatabaseClient,
  ): Promise<void> {
    if (notificationIds.length === 0) {
      return;
    }

    await database
      .update(schema.issueNotifications)
      .set({ emailedAt: new Date() })
      .where(
        and(
          inArray(schema.issueNotifications.id, notificationIds),
          isNull(schema.issueNotifications.readAt),
          isNull(schema.issueNotifications.emailedAt),
        ),
      );

    logger.info(
      { count: notificationIds.length },
      "suppressed issue notification email for recipients without project access",
    );
  }

  private async loadNotificationRows(
    notificationIds: string[],
    database: DatabaseClient,
  ): Promise<NotificationEmailRow[]> {
    if (notificationIds.length === 0) {
      return [];
    }

    const rows = await database
      .select({
        id: schema.issueNotifications.id,
        organizationId: schema.issueNotifications.organizationId,
        organizationSlug: schema.organizations.slug,
        projectId: schema.issueNotifications.projectId,
        issueId: schema.issueNotifications.issueId,
        type: schema.issueNotifications.type,
        payload: schema.issueNotifications.payload,
        recipientUserId: schema.issueNotifications.recipientUserId,
        recipientEmail: recipientUsers.email,
        readAt: schema.issueNotifications.readAt,
        emailedAt: schema.issueNotifications.emailedAt,
        createdAt: schema.issueNotifications.createdAt,
        actorFirstName: actorUsers.firstName,
        actorLastName: actorUsers.lastName,
        actorEmail: actorUsers.email,
        actorAvatarUrl: actorUsers.avatarUrl,
      })
      .from(schema.issueNotifications)
      .innerJoin(
        schema.organizations,
        eq(schema.issueNotifications.organizationId, schema.organizations.id),
      )
      .innerJoin(recipientUsers, eq(schema.issueNotifications.recipientUserId, recipientUsers.id))
      .leftJoin(actorUsers, eq(schema.issueNotifications.actorUserId, actorUsers.id))
      .where(inArray(schema.issueNotifications.id, notificationIds));

    return rows.map((row) => ({
      ...row,
      type: row.type,
      actorFirstName: row.actorFirstName ?? null,
      actorLastName: row.actorLastName ?? null,
      actorEmail: row.actorEmail ?? null,
      actorAvatarUrl: row.actorAvatarUrl ?? null,
    }));
  }

  private async enqueueEmailForRows(
    rows: NotificationEmailRow[],
    emailFormat: "digest" | "immediate",
    database: DatabaseClient,
  ): Promise<Result<{ ids: string[] }, EmailEnqueueError>> {
    if (rows.length === 0) {
      return err({ code: "skipped", message: "No notifications to enqueue." });
    }

    if (!env.RESEND_API_KEY || !env.RESEND_FROM_ADDRESS) {
      return err({
        code: "email_not_configured",
        message: "Email delivery is not configured for this environment.",
      });
    }

    const organizationIds = new Set(rows.map((row) => row.organizationId));
    if (organizationIds.size !== 1) {
      return err({
        code: "skipped",
        message: "Notifications for multiple organizations cannot share one email.",
      });
    }

    const organizationSlug = rows[0]!.organizationSlug;
    if (!organizationSlug) {
      return err({ code: "skipped", message: "Organization slug is missing." });
    }

    const recipientUserIds = new Set(rows.map((row) => row.recipientUserId));
    if (recipientUserIds.size !== 1) {
      return err({
        code: "skipped",
        message: "Notifications for multiple recipients cannot share one email.",
      });
    }

    const recipientEmail = rows[0]!.recipientEmail;
    if (!recipientEmail) {
      return err({ code: "skipped", message: "Recipient email is missing." });
    }

    const ids = rows.map((row) => row.id);
    const fresh = await database
      .select({
        id: schema.issueNotifications.id,
        readAt: schema.issueNotifications.readAt,
        emailedAt: schema.issueNotifications.emailedAt,
      })
      .from(schema.issueNotifications)
      .where(inArray(schema.issueNotifications.id, ids));

    const stillOpen = new Set(
      fresh.filter((row) => row.readAt == null && row.emailedAt == null).map((row) => row.id),
    );
    const sendable = rows.filter((row) => stillOpen.has(row.id));
    if (sendable.length === 0) {
      return err({ code: "skipped", message: "Notifications already read or emailed." });
    }

    const items = sendable.map((row) => toEmailItem(row, organizationSlug));
    const emailProps = {
      unreadCount: items.length,
      notifications: items,
      inboxUrl: inboxUrl(organizationSlug),
      unsubscribeUrl: unsubscribeUrl(organizationSlug),
      brandLogoUrl: brandLogoUrl(),
    };

    try {
      const html = await render(IssueInboxNotificationsEmail(emailProps));
      const text = issueInboxNotificationsPlainText(emailProps);
      const event: IssueNotificationEmailEventData = {
        kind: "issue_notification_email",
        recipientUserId: rows[0]!.recipientUserId,
        emailFormat,
        to: recipientEmail,
        subject: issueInboxNotificationsSubject(items.length),
        html,
        text,
        notificationIds: sendable.map((row) => row.id),
      };

      const enqueued = await this.emailQueue.enqueue(event);
      return ok(enqueued);
    } catch (error) {
      return err({
        code: "enqueue_failed",
        message: error instanceof Error ? error.message : "Email enqueue failed.",
      });
    }
  }
}

export const issueNotificationEmailService = new IssueNotificationEmailService();

/** Exported for tests — digest age gate. */
export const ISSUE_NOTIFICATION_DIGEST_MIN_AGE_MS = DIGEST_MIN_AGE_MS;
