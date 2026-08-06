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
import { and, eq, inArray, sql } from "drizzle-orm";

import { isOrganizationAdminRole } from "@/api/auth/policy";
import { buildAccessibleProjectsWhere } from "@/api/auth/team-access";
import type { ApiAuthContext } from "@/api/auth/workos";
import { db, schema } from "@/lib/database";
import type { OrganizationMembershipRole } from "@/lib/database/types";
import { ProjectServiceBase } from "@/lib/projects/project-service-base";

import { issueNotificationService } from "./issue-notification-service";
import { issueSubscriptionService } from "./issue-subscription-service";

export type IssueSheetCommentAuthor = {
  userId: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
};

export type IssueSheetComment = {
  id: string;
  issueId: string;
  projectId: string;
  organizationId: string;
  parentId: string | null;
  path: string;
  depth: number;
  body: string;
  author: IssueSheetCommentAuthor | null;
  mentionedUserIds: string[];
  mentionedIssueIds: string[];
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
  canDelete: boolean;
};

export type IssueSheetCommentCreateInput = {
  body: string;
  parentId?: string;
  mentionedUserIds?: string[];
  mentionedIssueIds?: string[];
};

export type IssueSheetCommentUpdateInput = {
  body: string;
  mentionedUserIds?: string[];
  mentionedIssueIds?: string[];
};

export type IssueSheetCommentServiceError =
  | { code: "issue_not_found" }
  | { code: "comment_not_found" }
  | { code: "parent_not_found" }
  | { code: "forbidden" }
  | { code: "invalid_mentioned_users" }
  | { code: "invalid_mentioned_issues" };

export function canMutateComment(input: {
  authorUserId: string | null;
  actorUserId: string;
  role: OrganizationMembershipRole;
}): boolean {
  return input.authorUserId === input.actorUserId || isOrganizationAdminRole(input.role);
}

function formatDisplayName(row: {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}) {
  const name = [row.firstName, row.lastName].filter(Boolean).join(" ").trim();
  return name || row.email || "Unknown";
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

type CommentRow = {
  id: string;
  organizationId: string;
  projectId: string;
  issueId: string;
  parentId: string | null;
  path: string;
  depth: number;
  body: string;
  authorUserId: string | null;
  mentionedUserIds: unknown;
  mentionedIssueIds: unknown;
  createdAt: Date;
  updatedAt: Date;
  authorFirstName: string | null;
  authorLastName: string | null;
  authorEmail: string | null;
  authorAvatarUrl: string | null;
};

export function mapIssueSheetCommentRow(
  row: CommentRow,
  actor: { userId: string; role: OrganizationMembershipRole },
): IssueSheetComment {
  const authorUserId = row.authorUserId;
  return {
    id: row.id,
    issueId: row.issueId,
    projectId: row.projectId,
    organizationId: row.organizationId,
    parentId: row.parentId,
    path: row.path,
    depth: row.depth,
    body: row.body,
    author: authorUserId
      ? {
          userId: authorUserId,
          displayName: formatDisplayName({
            firstName: row.authorFirstName,
            lastName: row.authorLastName,
            email: row.authorEmail,
          }),
          email: row.authorEmail,
          avatarUrl: row.authorAvatarUrl,
        }
      : null,
    mentionedUserIds: toStringArray(row.mentionedUserIds),
    mentionedIssueIds: toStringArray(row.mentionedIssueIds),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    canEdit: canMutateComment({
      authorUserId,
      actorUserId: actor.userId,
      role: actor.role,
    }),
    canDelete: canMutateComment({
      authorUserId,
      actorUserId: actor.userId,
      role: actor.role,
    }),
  };
}

export const issueSheetCommentSelect = {
  id: schema.issueSheetComments.id,
  organizationId: schema.issueSheetComments.organizationId,
  projectId: schema.issueSheetComments.projectId,
  issueId: schema.issueSheetComments.issueId,
  parentId: schema.issueSheetComments.parentId,
  path: schema.issueSheetComments.path,
  depth: schema.issueSheetComments.depth,
  body: schema.issueSheetComments.body,
  authorUserId: schema.issueSheetComments.authorUserId,
  mentionedUserIds: schema.issueSheetComments.mentionedUserIds,
  mentionedIssueIds: schema.issueSheetComments.mentionedIssueIds,
  createdAt: schema.issueSheetComments.createdAt,
  updatedAt: schema.issueSheetComments.updatedAt,
  authorFirstName: schema.users.firstName,
  authorLastName: schema.users.lastName,
  authorEmail: schema.users.email,
  authorAvatarUrl: schema.users.avatarUrl,
};

export class IssueSheetCommentService extends ProjectServiceBase {
  constructor(database: typeof db = db) {
    super(database, "projects.issue-sheet.comments");
  }

  private async findIssue(input: { organizationId: string; projectId: string; issueId: string }) {
    const [issue] = await this.database
      .select({
        id: schema.issueSheetIssues.id,
        organizationId: schema.issueSheetIssues.organizationId,
        projectId: schema.issueSheetIssues.projectId,
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

  private async validateMentions(input: {
    auth: ApiAuthContext;
    mentionedUserIds: string[];
    mentionedIssueIds: string[];
  }): Promise<IssueSheetCommentServiceError | null> {
    const organizationId = input.auth.organization.localOrganizationId;

    if (input.mentionedUserIds.length > 0) {
      const members = await this.database
        .select({ userId: schema.organizationMemberships.userId })
        .from(schema.organizationMemberships)
        .where(
          and(
            eq(schema.organizationMemberships.organizationId, organizationId),
            inArray(schema.organizationMemberships.userId, input.mentionedUserIds),
          ),
        );
      if (members.length !== new Set(input.mentionedUserIds).size) {
        return { code: "invalid_mentioned_users" };
      }
    }

    if (input.mentionedIssueIds.length > 0) {
      // Match mention-suggestions: only issues in projects the actor can access.
      const accessibleProjectsWhere = await buildAccessibleProjectsWhere(input.auth);
      const issues = await this.database
        .select({ id: schema.issueSheetIssues.id })
        .from(schema.issueSheetIssues)
        .innerJoin(schema.projects, eq(schema.issueSheetIssues.projectId, schema.projects.id))
        .where(
          and(
            eq(schema.issueSheetIssues.organizationId, organizationId),
            inArray(schema.issueSheetIssues.id, input.mentionedIssueIds),
            accessibleProjectsWhere,
          ),
        );
      if (issues.length !== new Set(input.mentionedIssueIds).size) {
        return { code: "invalid_mentioned_issues" };
      }
    }

    return null;
  }

  async create(input: {
    organizationId: string;
    projectId: string;
    issueId: string;
    actorUserId: string;
    role: OrganizationMembershipRole;
    auth: ApiAuthContext;
    body: IssueSheetCommentCreateInput;
  }): Promise<
    { ok: true; value: IssueSheetComment } | { ok: false; error: IssueSheetCommentServiceError }
  > {
    const issue = await this.findIssue(input);
    if (!issue) {
      return { ok: false, error: { code: "issue_not_found" } };
    }

    const mentionedUserIds = [...new Set(input.body.mentionedUserIds ?? [])];
    const mentionedIssueIds = [...new Set(input.body.mentionedIssueIds ?? [])];
    const mentionError = await this.validateMentions({
      auth: input.auth,
      mentionedUserIds,
      mentionedIssueIds,
    });
    if (mentionError) {
      return { ok: false, error: mentionError };
    }

    let parentPath: string | null = null;
    let depth = 0;

    if (input.body.parentId) {
      const [parent] = await this.database
        .select({
          id: schema.issueSheetComments.id,
          path: schema.issueSheetComments.path,
          depth: schema.issueSheetComments.depth,
        })
        .from(schema.issueSheetComments)
        .where(
          and(
            eq(schema.issueSheetComments.id, input.body.parentId),
            eq(schema.issueSheetComments.issueId, input.issueId),
            eq(schema.issueSheetComments.organizationId, input.organizationId),
            eq(schema.issueSheetComments.projectId, input.projectId),
          ),
        )
        .limit(1);

      if (!parent) {
        return { ok: false, error: { code: "parent_not_found" } };
      }
      parentPath = parent.path;
      depth = parent.depth + 1;
    }

    const comment = await this.database.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(schema.issueSheetComments)
        .values({
          organizationId: input.organizationId,
          projectId: input.projectId,
          issueId: input.issueId,
          parentId: input.body.parentId ?? null,
          path: "pending",
          depth,
          authorUserId: input.actorUserId,
          body: input.body.body,
          mentionedUserIds,
          mentionedIssueIds,
        })
        .returning({
          id: schema.issueSheetComments.id,
        });

      if (!inserted) {
        throw new Error("failed_to_insert_comment");
      }

      // Microsecond epoch from Postgres keeps lexicographic order when inserts
      // share the same JavaScript millisecond.
      const segmentSql = sql`lpad(((extract(epoch from ${schema.issueSheetComments.createdAt}) * 1000000)::bigint)::text, 20, '0') || '_' || ${schema.issueSheetComments.id}::text`;
      await tx
        .update(schema.issueSheetComments)
        .set({
          path: parentPath ? sql`${parentPath} || '.' || ${segmentSql}` : segmentSql,
        })
        .where(eq(schema.issueSheetComments.id, inserted.id));

      const [row] = await tx
        .select(issueSheetCommentSelect)
        .from(schema.issueSheetComments)
        .leftJoin(schema.users, eq(schema.issueSheetComments.authorUserId, schema.users.id))
        .where(eq(schema.issueSheetComments.id, inserted.id))
        .limit(1);

      await issueSubscriptionService.subscribe({
        organizationId: input.organizationId,
        projectId: input.projectId,
        issueId: input.issueId,
        userId: input.actorUserId,
        database: tx,
      });
      await issueSubscriptionService.subscribeMany({
        organizationId: input.organizationId,
        projectId: input.projectId,
        issueId: input.issueId,
        userIds: mentionedUserIds,
        requireProjectAccess: true,
        database: tx,
      });

      return row;
    });

    if (!comment) {
      return { ok: false, error: { code: "comment_not_found" } };
    }

    this.log.debug(
      {
        organizationId: input.organizationId,
        projectId: input.projectId,
        issueId: input.issueId,
        commentId: comment.id,
        depth: comment.depth,
      },
      "created issue sheet comment",
    );

    await issueNotificationService.safeFanOut("comment_created", () =>
      issueNotificationService.notifyCommentCreated({
        organizationId: input.organizationId,
        projectId: input.projectId,
        issueId: input.issueId,
        actorUserId: input.actorUserId,
        commentId: comment.id,
        commentBody: input.body.body,
        mentionedUserIds,
      }),
    );

    return {
      ok: true,
      value: mapIssueSheetCommentRow(comment, { userId: input.actorUserId, role: input.role }),
    };
  }

  async update(input: {
    organizationId: string;
    projectId: string;
    issueId: string;
    commentId: string;
    actorUserId: string;
    role: OrganizationMembershipRole;
    auth: ApiAuthContext;
    body: IssueSheetCommentUpdateInput;
  }): Promise<
    { ok: true; value: IssueSheetComment } | { ok: false; error: IssueSheetCommentServiceError }
  > {
    const [existing] = await this.database
      .select({
        id: schema.issueSheetComments.id,
        authorUserId: schema.issueSheetComments.authorUserId,
      })
      .from(schema.issueSheetComments)
      .where(
        and(
          eq(schema.issueSheetComments.id, input.commentId),
          eq(schema.issueSheetComments.issueId, input.issueId),
          eq(schema.issueSheetComments.organizationId, input.organizationId),
          eq(schema.issueSheetComments.projectId, input.projectId),
        ),
      )
      .limit(1);

    if (!existing) {
      return { ok: false, error: { code: "comment_not_found" } };
    }

    if (
      !canMutateComment({
        authorUserId: existing.authorUserId,
        actorUserId: input.actorUserId,
        role: input.role,
      })
    ) {
      return { ok: false, error: { code: "forbidden" } };
    }

    const mentionedUserIds = [...new Set(input.body.mentionedUserIds ?? [])];
    const mentionedIssueIds = [...new Set(input.body.mentionedIssueIds ?? [])];
    const mentionError = await this.validateMentions({
      auth: input.auth,
      mentionedUserIds,
      mentionedIssueIds,
    });
    if (mentionError) {
      return { ok: false, error: mentionError };
    }

    await this.database
      .update(schema.issueSheetComments)
      .set({
        body: input.body.body,
        mentionedUserIds,
        mentionedIssueIds,
        updatedAt: new Date(),
      })
      .where(eq(schema.issueSheetComments.id, existing.id));

    const [row] = await this.database
      .select(issueSheetCommentSelect)
      .from(schema.issueSheetComments)
      .leftJoin(schema.users, eq(schema.issueSheetComments.authorUserId, schema.users.id))
      .where(eq(schema.issueSheetComments.id, existing.id))
      .limit(1);

    if (!row) {
      return { ok: false, error: { code: "comment_not_found" } };
    }

    return {
      ok: true,
      value: mapIssueSheetCommentRow(row, { userId: input.actorUserId, role: input.role }),
    };
  }

  async delete(input: {
    organizationId: string;
    projectId: string;
    issueId: string;
    commentId: string;
    actorUserId: string;
    role: OrganizationMembershipRole;
  }): Promise<{ ok: true } | { ok: false; error: IssueSheetCommentServiceError }> {
    const [existing] = await this.database
      .select({
        id: schema.issueSheetComments.id,
        authorUserId: schema.issueSheetComments.authorUserId,
      })
      .from(schema.issueSheetComments)
      .where(
        and(
          eq(schema.issueSheetComments.id, input.commentId),
          eq(schema.issueSheetComments.issueId, input.issueId),
          eq(schema.issueSheetComments.organizationId, input.organizationId),
          eq(schema.issueSheetComments.projectId, input.projectId),
        ),
      )
      .limit(1);

    if (!existing) {
      return { ok: false, error: { code: "comment_not_found" } };
    }

    if (
      !canMutateComment({
        authorUserId: existing.authorUserId,
        actorUserId: input.actorUserId,
        role: input.role,
      })
    ) {
      return { ok: false, error: { code: "forbidden" } };
    }

    await this.database
      .delete(schema.issueSheetComments)
      .where(eq(schema.issueSheetComments.id, existing.id));

    this.log.debug(
      {
        organizationId: input.organizationId,
        projectId: input.projectId,
        issueId: input.issueId,
        commentId: input.commentId,
      },
      "deleted issue sheet comment",
    );

    return { ok: true };
  }
}
