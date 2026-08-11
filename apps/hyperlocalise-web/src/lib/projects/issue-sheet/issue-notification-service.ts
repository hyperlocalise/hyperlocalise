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
import { and, count, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";

import { buildAccessibleProjectsWhere } from "@/api/auth/team-access";
import type { ApiAuthContext } from "@/api/auth/workos";
import { db, schema, type DatabaseClient } from "@/lib/database";
import type {
  IssueNotificationPayload,
  IssueNotificationType,
} from "@/lib/database/schema/issue-sheet";
import { stripMarkdown } from "@/lib/markdown/strip-markdown";
import { ProjectServiceBase } from "@/lib/projects/project-service-base";

import { issueSubscriptionService } from "./issue-subscription-service";

export const ISSUE_NOTIFICATION_ASSIGNED = "assigned" as const;
export const ISSUE_NOTIFICATION_MENTIONED = "mentioned" as const;
export const ISSUE_NOTIFICATION_COMMENT = "comment" as const;
export const ISSUE_NOTIFICATION_STATUS_CHANGED = "status_changed" as const;
export const ISSUE_NOTIFICATION_ASSIGNEE_CHANGED = "assignee_changed" as const;

const STATUS_DEDUPE_WINDOW_MS = 5 * 60 * 1000;
const COMMENT_EXCERPT_MAX_LENGTH = 160;

export type IssueNotificationActor = {
  userId: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
};

export type IssueNotification = {
  id: string;
  organizationId: string;
  projectId: string;
  issueId: string;
  type: IssueNotificationType;
  payload: IssueNotificationPayload;
  actor: IssueNotificationActor | null;
  readAt: string | null;
  createdAt: string;
};

export type IssueNotificationListResult = {
  notifications: IssueNotification[];
  total: number;
};

type IssueContext = {
  id: string;
  organizationId: string;
  projectId: string;
  title: string;
  assigneeUserId: string | null;
  reporterUserId: string | null;
};

function timeBucket(now = new Date(), windowMs = STATUS_DEDUPE_WINDOW_MS): number {
  return Math.floor(now.getTime() / windowMs);
}

function commentExcerpt(body: string): string {
  const trimmed = stripMarkdown(body);
  if (trimmed.length <= COMMENT_EXCERPT_MAX_LENGTH) {
    return trimmed;
  }
  return `${trimmed.slice(0, COMMENT_EXCERPT_MAX_LENGTH - 1)}…`;
}

function formatActorDisplayName(row: {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}): string {
  const name = [row.firstName, row.lastName].filter(Boolean).join(" ");
  return name || row.email || "Unknown";
}

function mapNotificationRow(row: {
  id: string;
  organizationId: string;
  projectId: string;
  issueId: string;
  type: string;
  payload: IssueNotificationPayload;
  readAt: Date | null;
  createdAt: Date;
  actorUserId: string | null;
  actorFirstName: string | null;
  actorLastName: string | null;
  actorEmail: string | null;
  actorAvatarUrl: string | null;
}): IssueNotification {
  return {
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    issueId: row.issueId,
    type: row.type as IssueNotificationType,
    payload: row.payload,
    actor: row.actorUserId
      ? {
          userId: row.actorUserId,
          displayName: formatActorDisplayName({
            firstName: row.actorFirstName,
            lastName: row.actorLastName,
            email: row.actorEmail,
          }),
          email: row.actorEmail,
          avatarUrl: row.actorAvatarUrl,
        }
      : null,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export class IssueNotificationService extends ProjectServiceBase {
  constructor(database: typeof db = db) {
    super(database, "issue-notification-service");
  }

  async resolveWatchers(
    issueId: string,
    database: DatabaseClient = this.database,
  ): Promise<Set<string>> {
    return issueSubscriptionService.resolveWatchers(issueId, database);
  }

  /** @deprecated Use resolveWatchers — subscriptions are persisted explicitly. */
  async resolveImplicitWatchers(
    issueId: string,
    database: DatabaseClient = this.database,
  ): Promise<Set<string>> {
    return this.resolveWatchers(issueId, database);
  }

  private async loadIssueContext(
    input: { organizationId: string; projectId: string; issueId: string },
    database: DatabaseClient = this.database,
  ): Promise<IssueContext | null> {
    const [issue] = await database
      .select({
        id: schema.issueSheetIssues.id,
        organizationId: schema.issueSheetIssues.organizationId,
        projectId: schema.issueSheetIssues.projectId,
        title: schema.issueSheetIssues.title,
        assigneeUserId: schema.issueSheetIssues.assigneeUserId,
        reporterUserId: schema.issueSheetIssues.reporterUserId,
      })
      .from(schema.issueSheetIssues)
      .where(
        and(
          eq(schema.issueSheetIssues.id, input.issueId),
          eq(schema.issueSheetIssues.organizationId, input.organizationId),
          eq(schema.issueSheetIssues.projectId, input.projectId),
        ),
      )
      .limit(1);

    return issue ?? null;
  }

  private async upsertNotifications(
    rows: Array<{
      organizationId: string;
      projectId: string;
      recipientUserId: string;
      actorUserId: string | null;
      issueId: string;
      type: IssueNotificationType;
      dedupeKey: string;
      payload: IssueNotificationPayload;
    }>,
    database: DatabaseClient = this.database,
  ): Promise<string[]> {
    if (rows.length === 0) {
      return [];
    }

    const now = new Date();
    const upserted = await database
      .insert(schema.issueNotifications)
      .values(
        rows.map((row) => ({
          ...row,
          createdAt: now,
          readAt: null,
          emailedAt: null,
        })),
      )
      .onConflictDoUpdate({
        target: [schema.issueNotifications.recipientUserId, schema.issueNotifications.dedupeKey],
        set: {
          type: sql`excluded.type`,
          actorUserId: sql`excluded.actor_user_id`,
          payload: sql`excluded.payload`,
          readAt: null,
          emailedAt: null,
          createdAt: now,
        },
      })
      .returning({ id: schema.issueNotifications.id });

    const notificationIds = upserted.map((row) => row.id);
    const { issueNotificationEmailService } = await import("./issue-notification-email-service");
    await issueNotificationEmailService.scheduleImmediateDelivery(notificationIds);
    return notificationIds;
  }

  private async notifyRecipients(input: {
    organizationId: string;
    projectId: string;
    issueId: string;
    actorUserId: string;
    issueTitle: string;
    recipientUserIds: Iterable<string>;
    type: IssueNotificationType;
    dedupeKeyFor: (recipientUserId: string) => string;
    payloadExtra?: Omit<IssueNotificationPayload, "issueTitle" | "projectId">;
    database?: DatabaseClient;
  }): Promise<void> {
    const recipients = [...new Set(input.recipientUserIds)].filter(
      (userId) => userId !== input.actorUserId,
    );
    if (recipients.length === 0) {
      return;
    }

    const payloadBase: IssueNotificationPayload = {
      issueTitle: input.issueTitle,
      projectId: input.projectId,
      ...input.payloadExtra,
    };

    await this.upsertNotifications(
      recipients.map((recipientUserId) => ({
        organizationId: input.organizationId,
        projectId: input.projectId,
        recipientUserId,
        actorUserId: input.actorUserId,
        issueId: input.issueId,
        type: input.type,
        dedupeKey: input.dedupeKeyFor(recipientUserId),
        payload: payloadBase,
      })),
      input.database ?? this.database,
    );
  }

  async notifyAssigned(input: {
    organizationId: string;
    projectId: string;
    issueId: string;
    actorUserId: string;
    assigneeUserId: string;
    issueTitle?: string;
    database?: DatabaseClient;
  }): Promise<void> {
    const database = input.database ?? this.database;
    const issue =
      input.issueTitle != null
        ? {
            title: input.issueTitle,
            id: input.issueId,
            organizationId: input.organizationId,
            projectId: input.projectId,
          }
        : await this.loadIssueContext(input, database);
    if (!issue) {
      return;
    }

    await this.notifyRecipients({
      organizationId: input.organizationId,
      projectId: input.projectId,
      issueId: input.issueId,
      actorUserId: input.actorUserId,
      issueTitle: issue.title,
      recipientUserIds: [input.assigneeUserId],
      type: ISSUE_NOTIFICATION_ASSIGNED,
      dedupeKeyFor: () => `assigned:${input.issueId}:${input.assigneeUserId}`,
      payloadExtra: {
        nextAssigneeUserId: input.assigneeUserId,
      },
      database,
    });
  }

  async notifyAssigneeChanged(input: {
    organizationId: string;
    projectId: string;
    issueId: string;
    actorUserId: string;
    previousAssigneeUserId: string | null;
    nextAssigneeUserId: string | null;
    database?: DatabaseClient;
  }): Promise<void> {
    const database = input.database ?? this.database;
    const issue = await this.loadIssueContext(input, database);
    if (!issue) {
      return;
    }

    if (input.nextAssigneeUserId) {
      await this.notifyAssigned({
        organizationId: input.organizationId,
        projectId: input.projectId,
        issueId: input.issueId,
        actorUserId: input.actorUserId,
        assigneeUserId: input.nextAssigneeUserId,
        issueTitle: issue.title,
        database,
      });
    }

    const watchers = await this.resolveWatchers(input.issueId, database);
    if (input.previousAssigneeUserId) {
      watchers.add(input.previousAssigneeUserId);
    }
    if (input.nextAssigneeUserId) {
      watchers.delete(input.nextAssigneeUserId);
    }

    const bucket = timeBucket();
    await this.notifyRecipients({
      organizationId: input.organizationId,
      projectId: input.projectId,
      issueId: input.issueId,
      actorUserId: input.actorUserId,
      issueTitle: issue.title,
      recipientUserIds: watchers,
      type: ISSUE_NOTIFICATION_ASSIGNEE_CHANGED,
      dedupeKeyFor: () =>
        `assignee_changed:${input.issueId}:${input.previousAssigneeUserId ?? "none"}:${input.nextAssigneeUserId ?? "none"}:${bucket}`,
      payloadExtra: {
        previousAssigneeUserId: input.previousAssigneeUserId,
        nextAssigneeUserId: input.nextAssigneeUserId,
      },
      database,
    });
  }

  async notifyStatusChanged(input: {
    organizationId: string;
    projectId: string;
    issueId: string;
    actorUserId: string;
    previousStatus: string;
    nextStatus: string;
    database?: DatabaseClient;
  }): Promise<void> {
    const database = input.database ?? this.database;
    const issue = await this.loadIssueContext(input, database);
    if (!issue) {
      return;
    }

    const watchers = await this.resolveWatchers(input.issueId, database);
    const bucket = timeBucket();

    await this.notifyRecipients({
      organizationId: input.organizationId,
      projectId: input.projectId,
      issueId: input.issueId,
      actorUserId: input.actorUserId,
      issueTitle: issue.title,
      recipientUserIds: watchers,
      type: ISSUE_NOTIFICATION_STATUS_CHANGED,
      dedupeKeyFor: () => `status:${input.issueId}:${input.nextStatus}:${bucket}`,
      payloadExtra: {
        previousStatus: input.previousStatus,
        nextStatus: input.nextStatus,
      },
      database,
    });
  }

  async notifyCommentCreated(input: {
    organizationId: string;
    projectId: string;
    issueId: string;
    actorUserId: string;
    commentId: string;
    commentBody: string;
    mentionedUserIds: string[];
    database?: DatabaseClient;
  }): Promise<void> {
    const database = input.database ?? this.database;
    const issue = await this.loadIssueContext(input, database);
    if (!issue) {
      return;
    }

    const excerpt = commentExcerpt(input.commentBody);
    const mentioned = [...new Set(input.mentionedUserIds)];

    await this.notifyRecipients({
      organizationId: input.organizationId,
      projectId: input.projectId,
      issueId: input.issueId,
      actorUserId: input.actorUserId,
      issueTitle: issue.title,
      recipientUserIds: mentioned,
      type: ISSUE_NOTIFICATION_MENTIONED,
      dedupeKeyFor: (recipientUserId) => `mentioned:${input.commentId}:${recipientUserId}`,
      payloadExtra: {
        commentId: input.commentId,
        commentExcerpt: excerpt,
      },
      database,
    });

    const watchers = await this.resolveWatchers(input.issueId, database);
    const mentionedSet = new Set(mentioned);
    const commentRecipients = [...watchers].filter((userId) => !mentionedSet.has(userId));

    await this.notifyRecipients({
      organizationId: input.organizationId,
      projectId: input.projectId,
      issueId: input.issueId,
      actorUserId: input.actorUserId,
      issueTitle: issue.title,
      recipientUserIds: commentRecipients,
      type: ISSUE_NOTIFICATION_COMMENT,
      dedupeKeyFor: (recipientUserId) => `comment:${input.commentId}:${recipientUserId}`,
      payloadExtra: {
        commentId: input.commentId,
        commentExcerpt: excerpt,
      },
      database,
    });
  }

  private async recipientScopeWhere(auth: ApiAuthContext): Promise<{
    recipientWhere: SQL;
    accessibleProjectsWhere: SQL;
  }> {
    const accessibleProjectsWhere = await buildAccessibleProjectsWhere(auth);
    return {
      recipientWhere: and(
        eq(schema.issueNotifications.organizationId, auth.organization.localOrganizationId),
        eq(schema.issueNotifications.recipientUserId, auth.user.localUserId),
      )!,
      accessibleProjectsWhere,
    };
  }

  async list(
    auth: ApiAuthContext,
    query: { unreadOnly?: boolean; limit?: number; offset?: number },
  ): Promise<IssueNotificationListResult> {
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;
    const { recipientWhere, accessibleProjectsWhere } = await this.recipientScopeWhere(auth);
    const filters: SQL[] = [recipientWhere, accessibleProjectsWhere];
    if (query.unreadOnly) {
      filters.push(isNull(schema.issueNotifications.readAt));
    }
    const where = and(...filters)!;

    const [totalRow] = await this.database
      .select({ total: count() })
      .from(schema.issueNotifications)
      .innerJoin(schema.projects, eq(schema.issueNotifications.projectId, schema.projects.id))
      .where(where);

    const rows = await this.database
      .select({
        id: schema.issueNotifications.id,
        organizationId: schema.issueNotifications.organizationId,
        projectId: schema.issueNotifications.projectId,
        issueId: schema.issueNotifications.issueId,
        type: schema.issueNotifications.type,
        payload: schema.issueNotifications.payload,
        readAt: schema.issueNotifications.readAt,
        createdAt: schema.issueNotifications.createdAt,
        actorUserId: schema.issueNotifications.actorUserId,
        actorFirstName: schema.users.firstName,
        actorLastName: schema.users.lastName,
        actorEmail: schema.users.email,
        actorAvatarUrl: schema.users.avatarUrl,
      })
      .from(schema.issueNotifications)
      .innerJoin(schema.projects, eq(schema.issueNotifications.projectId, schema.projects.id))
      .leftJoin(schema.users, eq(schema.issueNotifications.actorUserId, schema.users.id))
      .where(where)
      .orderBy(desc(schema.issueNotifications.createdAt), desc(schema.issueNotifications.id))
      .limit(limit)
      .offset(offset);

    return {
      notifications: rows.map(mapNotificationRow),
      total: totalRow?.total ?? 0,
    };
  }

  async unreadCount(auth: ApiAuthContext): Promise<number> {
    const { recipientWhere, accessibleProjectsWhere } = await this.recipientScopeWhere(auth);
    const [row] = await this.database
      .select({ total: count() })
      .from(schema.issueNotifications)
      .innerJoin(schema.projects, eq(schema.issueNotifications.projectId, schema.projects.id))
      .where(
        and(recipientWhere, accessibleProjectsWhere, isNull(schema.issueNotifications.readAt)),
      );

    return row?.total ?? 0;
  }

  async getById(auth: ApiAuthContext, notificationId: string): Promise<IssueNotification | null> {
    const { recipientWhere, accessibleProjectsWhere } = await this.recipientScopeWhere(auth);
    const [row] = await this.database
      .select({
        id: schema.issueNotifications.id,
        organizationId: schema.issueNotifications.organizationId,
        projectId: schema.issueNotifications.projectId,
        issueId: schema.issueNotifications.issueId,
        type: schema.issueNotifications.type,
        payload: schema.issueNotifications.payload,
        readAt: schema.issueNotifications.readAt,
        createdAt: schema.issueNotifications.createdAt,
        actorUserId: schema.issueNotifications.actorUserId,
        actorFirstName: schema.users.firstName,
        actorLastName: schema.users.lastName,
        actorEmail: schema.users.email,
        actorAvatarUrl: schema.users.avatarUrl,
      })
      .from(schema.issueNotifications)
      .innerJoin(schema.projects, eq(schema.issueNotifications.projectId, schema.projects.id))
      .leftJoin(schema.users, eq(schema.issueNotifications.actorUserId, schema.users.id))
      .where(
        and(
          recipientWhere,
          accessibleProjectsWhere,
          eq(schema.issueNotifications.id, notificationId),
        ),
      )
      .limit(1);

    return row ? mapNotificationRow(row) : null;
  }

  async markRead(
    auth: ApiAuthContext,
    notificationId: string,
  ): Promise<"marked" | "already_read" | "not_found"> {
    const existing = await this.getById(auth, notificationId);
    if (!existing) {
      return "not_found";
    }
    if (existing.readAt) {
      return "already_read";
    }

    await this.database
      .update(schema.issueNotifications)
      .set({ readAt: new Date() })
      .where(eq(schema.issueNotifications.id, existing.id));

    return "marked";
  }

  async markAllRead(auth: ApiAuthContext): Promise<number> {
    const { recipientWhere, accessibleProjectsWhere } = await this.recipientScopeWhere(auth);
    const accessibleIds = await this.database
      .select({ id: schema.issueNotifications.id })
      .from(schema.issueNotifications)
      .innerJoin(schema.projects, eq(schema.issueNotifications.projectId, schema.projects.id))
      .where(
        and(recipientWhere, accessibleProjectsWhere, isNull(schema.issueNotifications.readAt)),
      );

    if (accessibleIds.length === 0) {
      return 0;
    }

    const ids = accessibleIds.map((row) => row.id);
    const updated = await this.database
      .update(schema.issueNotifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(schema.issueNotifications.recipientUserId, auth.user.localUserId),
          inArray(schema.issueNotifications.id, ids),
        ),
      )
      .returning({ id: schema.issueNotifications.id });

    return updated.length;
  }

  async safeFanOut(label: string, work: () => Promise<void>): Promise<void> {
    try {
      await work();
    } catch (error) {
      this.log.warn(
        {
          label,
          errorName: error instanceof Error ? error.name : "unknown",
        },
        "issue notification fan-out failed",
      );
    }
  }
}

export const issueNotificationService = new IssueNotificationService();
