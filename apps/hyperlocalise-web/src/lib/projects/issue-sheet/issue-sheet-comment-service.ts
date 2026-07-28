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
import { and, asc, count, eq, gt, inArray, sql } from "drizzle-orm";

import { isOrganizationAdminRole } from "@/api/auth/policy";
import { db, schema } from "@/lib/database";
import type { OrganizationMembershipRole } from "@/lib/database/types";
import { ProjectServiceBase } from "@/lib/projects/project-service-base";

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

export type IssueSheetCommentListQuery = {
  limit: number;
  offset: number;
  cursor?: string;
  sort: "thread" | "created_at";
  parentId?: string;
};

export type IssueSheetCommentListResult = {
  issueComments: IssueSheetComment[];
  total: number;
  nextCursor: string | null;
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

function toComment(
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

const commentSelect = {
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
    organizationId: string;
    mentionedUserIds: string[];
    mentionedIssueIds: string[];
  }): Promise<IssueSheetCommentServiceError | null> {
    if (input.mentionedUserIds.length > 0) {
      const members = await this.database
        .select({ userId: schema.organizationMemberships.userId })
        .from(schema.organizationMemberships)
        .where(
          and(
            eq(schema.organizationMemberships.organizationId, input.organizationId),
            inArray(schema.organizationMemberships.userId, input.mentionedUserIds),
          ),
        );
      if (members.length !== new Set(input.mentionedUserIds).size) {
        return { code: "invalid_mentioned_users" };
      }
    }

    if (input.mentionedIssueIds.length > 0) {
      const issues = await this.database
        .select({ id: schema.issueSheetIssues.id })
        .from(schema.issueSheetIssues)
        .where(
          and(
            eq(schema.issueSheetIssues.organizationId, input.organizationId),
            inArray(schema.issueSheetIssues.id, input.mentionedIssueIds),
          ),
        );
      if (issues.length !== new Set(input.mentionedIssueIds).size) {
        return { code: "invalid_mentioned_issues" };
      }
    }

    return null;
  }

  async list(input: {
    organizationId: string;
    projectId: string;
    issueId: string;
    actorUserId: string;
    role: OrganizationMembershipRole;
    query: IssueSheetCommentListQuery;
  }): Promise<
    | { ok: true; value: IssueSheetCommentListResult }
    | { ok: false; error: IssueSheetCommentServiceError }
  > {
    const issue = await this.findIssue(input);
    if (!issue) {
      return { ok: false, error: { code: "issue_not_found" } };
    }

    const conditions = [
      eq(schema.issueSheetComments.organizationId, input.organizationId),
      eq(schema.issueSheetComments.projectId, input.projectId),
      eq(schema.issueSheetComments.issueId, input.issueId),
    ];

    if (input.query.parentId !== undefined) {
      conditions.push(eq(schema.issueSheetComments.parentId, input.query.parentId));
    }

    if (input.query.cursor) {
      if (input.query.sort === "thread") {
        conditions.push(gt(schema.issueSheetComments.path, input.query.cursor));
      } else {
        const [cursorCreatedAt, cursorId] = input.query.cursor.split("|");
        if (cursorCreatedAt && cursorId) {
          conditions.push(
            sql`(${schema.issueSheetComments.createdAt}, ${schema.issueSheetComments.id}) > (${cursorCreatedAt}::timestamptz, ${cursorId}::uuid)`,
          );
        }
      }
    }

    const where = and(...conditions);
    const orderBy =
      input.query.sort === "thread"
        ? [asc(schema.issueSheetComments.path)]
        : [asc(schema.issueSheetComments.createdAt), asc(schema.issueSheetComments.id)];

    const useCursor = Boolean(input.query.cursor);
    const fetchLimit = useCursor ? input.query.limit + 1 : input.query.limit;

    const [rows, totalRow] = await Promise.all([
      this.database
        .select(commentSelect)
        .from(schema.issueSheetComments)
        .leftJoin(schema.users, eq(schema.issueSheetComments.authorUserId, schema.users.id))
        .where(where)
        .orderBy(...orderBy)
        .limit(fetchLimit)
        .offset(useCursor ? 0 : input.query.offset),
      this.database
        .select({ total: count() })
        .from(schema.issueSheetComments)
        .where(
          and(
            eq(schema.issueSheetComments.organizationId, input.organizationId),
            eq(schema.issueSheetComments.projectId, input.projectId),
            eq(schema.issueSheetComments.issueId, input.issueId),
            input.query.parentId !== undefined
              ? eq(schema.issueSheetComments.parentId, input.query.parentId)
              : undefined,
          ),
        ),
    ]);

    const hasMore = useCursor && rows.length > input.query.limit;
    const pageRows = hasMore ? rows.slice(0, input.query.limit) : rows;
    const actor = { userId: input.actorUserId, role: input.role };
    const issueComments = pageRows.map((row) => toComment(row, actor));

    let nextCursor: string | null = null;
    if (hasMore && pageRows.length > 0) {
      const last = pageRows[pageRows.length - 1]!;
      nextCursor =
        input.query.sort === "thread" ? last.path : `${last.createdAt.toISOString()}|${last.id}`;
    }

    return {
      ok: true,
      value: {
        issueComments,
        total: Number(totalRow[0]?.total ?? 0),
        nextCursor,
      },
    };
  }

  async create(input: {
    organizationId: string;
    projectId: string;
    issueId: string;
    actorUserId: string;
    role: OrganizationMembershipRole;
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
      organizationId: input.organizationId,
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
        .returning({ id: schema.issueSheetComments.id });

      if (!inserted) {
        throw new Error("failed_to_insert_comment");
      }

      const path = parentPath ? `${parentPath}.${inserted.id}` : inserted.id;

      await tx
        .update(schema.issueSheetComments)
        .set({ path })
        .where(eq(schema.issueSheetComments.id, inserted.id));

      const [row] = await tx
        .select(commentSelect)
        .from(schema.issueSheetComments)
        .leftJoin(schema.users, eq(schema.issueSheetComments.authorUserId, schema.users.id))
        .where(eq(schema.issueSheetComments.id, inserted.id))
        .limit(1);

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

    return {
      ok: true,
      value: toComment(comment, { userId: input.actorUserId, role: input.role }),
    };
  }

  async update(input: {
    organizationId: string;
    projectId: string;
    issueId: string;
    commentId: string;
    actorUserId: string;
    role: OrganizationMembershipRole;
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
      organizationId: input.organizationId,
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
      .select(commentSelect)
      .from(schema.issueSheetComments)
      .leftJoin(schema.users, eq(schema.issueSheetComments.authorUserId, schema.users.id))
      .where(eq(schema.issueSheetComments.id, existing.id))
      .limit(1);

    if (!row) {
      return { ok: false, error: { code: "comment_not_found" } };
    }

    return {
      ok: true,
      value: toComment(row, { userId: input.actorUserId, role: input.role }),
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
