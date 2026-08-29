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
import { and, asc, eq, inArray, notExists, or } from "drizzle-orm";

import type { ProjectFileContentEditorComment } from "@/api/routes/project/project.schema";
import { db, schema } from "@/lib/database/client";
import { ProjectServiceBase } from "@/lib/projects/project-service-base";
import type { ProjectTranslationService } from "@/lib/projects/translations/project-translation-service";

function formatCommentAuthor(
  user: {
    firstName: string | null;
    lastName: string | null;
    email: string;
  } | null,
) {
  if (!user) {
    return null;
  }

  const name = [user.firstName, user.lastName].filter(Boolean).join(" ");
  return name || user.email;
}

type CommentAuthorFields = {
  authorFirstName: string | null;
  authorLastName: string | null;
  authorEmail: string | null;
};

async function fetchCommentAuthorFields(
  database: typeof db,
  userId: string,
): Promise<CommentAuthorFields> {
  const [author] = await database
    .select({
      authorFirstName: schema.users.firstName,
      authorLastName: schema.users.lastName,
      authorEmail: schema.users.email,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  return {
    authorFirstName: author?.authorFirstName ?? null,
    authorLastName: author?.authorLastName ?? null,
    authorEmail: author?.authorEmail ?? null,
  };
}

function toCatComment(row: {
  id: string;
  type: "comment" | "issue";
  status: string | null;
  text: string;
  createdAt: Date;
  targetLocale: string;
  authorFirstName: string | null;
  authorLastName: string | null;
  authorEmail: string | null;
}): ProjectFileContentEditorComment {
  return {
    externalCommentId: row.id,
    type: row.type,
    status: row.status,
    text: row.text,
    createdAt: row.createdAt.toISOString(),
    locale: row.targetLocale,
    author: formatCommentAuthor(
      row.authorEmail
        ? {
            firstName: row.authorFirstName,
            lastName: row.authorLastName,
            email: row.authorEmail,
          }
        : null,
    ),
  };
}

/**
 * Native issues are created in the issue sheet, so `type = 'issue'` rows only
 * exist for segments commented on before that change. Keep the ones that were
 * never mirrored into a sheet issue visible and resolvable; hide the rest so
 * they do not appear twice alongside their sheet issue.
 */
function legacyIssueOrCommentCondition(database: typeof db) {
  return or(
    eq(schema.projectTranslationComments.type, "comment"),
    and(
      eq(schema.projectTranslationComments.type, "issue"),
      notExists(
        database
          .select({ id: schema.issueSheetIssues.id })
          .from(schema.issueSheetIssues)
          .where(eq(schema.issueSheetIssues.linkedCommentId, schema.projectTranslationComments.id)),
      ),
    ),
  );
}

export class NativeContentEditorCommentService extends ProjectServiceBase {
  constructor(
    database: typeof db = db,
    private readonly translations: ProjectTranslationService,
  ) {
    super(database, "projects.cat.comments");
  }

  async listByKeyIds(input: {
    organizationId: string;
    projectId: string;
    translationKeyIds: string[];
    targetLocale: string;
  }) {
    if (input.translationKeyIds.length === 0) {
      return new Map<string, ProjectFileContentEditorComment[]>();
    }

    const rows = await this.database
      .select({
        id: schema.projectTranslationComments.id,
        translationKeyId: schema.projectTranslationComments.translationKeyId,
        type: schema.projectTranslationComments.type,
        status: schema.projectTranslationComments.status,
        text: schema.projectTranslationComments.text,
        createdAt: schema.projectTranslationComments.createdAt,
        targetLocale: schema.projectTranslationComments.targetLocale,
        authorFirstName: schema.users.firstName,
        authorLastName: schema.users.lastName,
        authorEmail: schema.users.email,
      })
      .from(schema.projectTranslationComments)
      .leftJoin(schema.users, eq(schema.projectTranslationComments.authorUserId, schema.users.id))
      .where(
        and(
          eq(schema.projectTranslationComments.organizationId, input.organizationId),
          eq(schema.projectTranslationComments.projectId, input.projectId),
          eq(schema.projectTranslationComments.targetLocale, input.targetLocale),
          legacyIssueOrCommentCondition(this.database),
          inArray(schema.projectTranslationComments.translationKeyId, input.translationKeyIds),
        ),
      )
      .orderBy(asc(schema.projectTranslationComments.createdAt));

    const commentsByKeyId = new Map<string, ProjectFileContentEditorComment[]>();
    for (const row of rows) {
      const comment = toCatComment(row);
      const existing = commentsByKeyId.get(row.translationKeyId) ?? [];
      existing.push(comment);
      commentsByKeyId.set(row.translationKeyId, existing);
    }

    return commentsByKeyId;
  }

  async save(input: {
    organizationId: string;
    projectId: string;
    sourcePath: string;
    targetLocale: string;
    translationKeyId: string;
    text: string;
    type?: "comment" | "issue";
    issueType?: string;
    actorUserId?: string;
  }): Promise<ProjectFileContentEditorComment | null> {
    if (input.type === "issue") {
      return null;
    }

    const sourceFile = await this.translations.getRepositorySourceFileByPath({
      organizationId: input.organizationId,
      projectId: input.projectId,
      sourcePath: input.sourcePath,
    });

    if (!sourceFile) {
      return null;
    }

    const [key] = await this.database
      .select({ id: schema.projectTranslationKeys.id })
      .from(schema.projectTranslationKeys)
      .where(
        and(
          eq(schema.projectTranslationKeys.id, input.translationKeyId),
          eq(schema.projectTranslationKeys.organizationId, input.organizationId),
          eq(schema.projectTranslationKeys.projectId, input.projectId),
          eq(schema.projectTranslationKeys.repositorySourceFileId, sourceFile.id),
        ),
      )
      .limit(1);

    if (!key) {
      return null;
    }

    const authorFields = input.actorUserId
      ? await fetchCommentAuthorFields(this.database, input.actorUserId)
      : {
          authorFirstName: null,
          authorLastName: null,
          authorEmail: null,
        };

    const [saved] = await this.database
      .insert(schema.projectTranslationComments)
      .values({
        organizationId: input.organizationId,
        projectId: input.projectId,
        translationKeyId: key.id,
        targetLocale: input.targetLocale,
        type: "comment",
        status: null,
        text: input.text,
        issueType: null,
        authorUserId: input.actorUserId ?? null,
      })
      .returning({
        id: schema.projectTranslationComments.id,
        type: schema.projectTranslationComments.type,
        status: schema.projectTranslationComments.status,
        text: schema.projectTranslationComments.text,
        createdAt: schema.projectTranslationComments.createdAt,
        targetLocale: schema.projectTranslationComments.targetLocale,
      });

    if (!saved) {
      return null;
    }

    this.log.debug(
      {
        organizationId: input.organizationId,
        projectId: input.projectId,
        translationKeyId: input.translationKeyId,
        commentType: "comment",
      },
      "saved native CAT comment",
    );

    return toCatComment({
      ...saved,
      ...authorFields,
    });
  }

  /**
   * Resolves a legacy `type = 'issue'` comment. New native issues live in the
   * issue sheet and are resolved there; this only keeps pre-existing rows
   * actionable.
   */
  async resolveLegacyIssue(input: {
    organizationId: string;
    projectId: string;
    commentId: string;
    actorUserId?: string;
    canResolveOthersIssues?: boolean;
  }): Promise<ProjectFileContentEditorComment | null> {
    const [existing] = await this.database
      .select({
        id: schema.projectTranslationComments.id,
        type: schema.projectTranslationComments.type,
        status: schema.projectTranslationComments.status,
        text: schema.projectTranslationComments.text,
        createdAt: schema.projectTranslationComments.createdAt,
        targetLocale: schema.projectTranslationComments.targetLocale,
        authorUserId: schema.projectTranslationComments.authorUserId,
        authorFirstName: schema.users.firstName,
        authorLastName: schema.users.lastName,
        authorEmail: schema.users.email,
      })
      .from(schema.projectTranslationComments)
      .leftJoin(schema.users, eq(schema.projectTranslationComments.authorUserId, schema.users.id))
      .where(
        and(
          eq(schema.projectTranslationComments.id, input.commentId),
          eq(schema.projectTranslationComments.organizationId, input.organizationId),
          eq(schema.projectTranslationComments.projectId, input.projectId),
        ),
      )
      .limit(1);

    if (!existing || existing.type !== "issue" || existing.status === "resolved") {
      return null;
    }

    if (
      input.actorUserId &&
      existing.authorUserId &&
      existing.authorUserId !== input.actorUserId &&
      !input.canResolveOthersIssues
    ) {
      return null;
    }

    const [updated] = await this.database
      .update(schema.projectTranslationComments)
      .set({
        status: "resolved",
        updatedAt: new Date(),
      })
      .where(eq(schema.projectTranslationComments.id, existing.id))
      .returning({
        id: schema.projectTranslationComments.id,
        type: schema.projectTranslationComments.type,
        status: schema.projectTranslationComments.status,
        text: schema.projectTranslationComments.text,
        createdAt: schema.projectTranslationComments.createdAt,
        targetLocale: schema.projectTranslationComments.targetLocale,
      });

    if (!updated) {
      return null;
    }

    this.log.debug(
      {
        organizationId: input.organizationId,
        projectId: input.projectId,
        commentId: input.commentId,
        actorUserId: input.actorUserId ?? null,
      },
      "resolved legacy native CAT issue comment",
    );

    return toCatComment({
      ...updated,
      authorFirstName: existing.authorFirstName,
      authorLastName: existing.authorLastName,
      authorEmail: existing.authorEmail,
    });
  }
}
