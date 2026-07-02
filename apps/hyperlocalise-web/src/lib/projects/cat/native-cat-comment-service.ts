import { and, asc, eq, inArray, sql } from "drizzle-orm";

import type { ProjectFileCatComment } from "@/api/routes/project/project.schema";
import { db, schema } from "@/lib/database";
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
}): ProjectFileCatComment {
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

export class NativeCatCommentService extends ProjectServiceBase {
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
      return new Map<string, ProjectFileCatComment[]>();
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
          inArray(schema.projectTranslationComments.translationKeyId, input.translationKeyIds),
        ),
      )
      .orderBy(asc(schema.projectTranslationComments.createdAt));

    const commentsByKeyId = new Map<string, ProjectFileCatComment[]>();
    for (const row of rows) {
      const comment = toCatComment(row);
      const existing = commentsByKeyId.get(row.translationKeyId) ?? [];
      existing.push(comment);
      commentsByKeyId.set(row.translationKeyId, existing);
    }

    return commentsByKeyId;
  }

  async countByKeyIds(input: {
    organizationId: string;
    projectId: string;
    translationKeyIds: string[];
    targetLocale: string;
  }) {
    if (input.translationKeyIds.length === 0) {
      return new Map<string, { commentCount: number; unresolvedIssueCount: number }>();
    }

    const rows = await this.database
      .select({
        translationKeyId: schema.projectTranslationComments.translationKeyId,
        type: schema.projectTranslationComments.type,
        status: schema.projectTranslationComments.status,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.projectTranslationComments)
      .where(
        and(
          eq(schema.projectTranslationComments.organizationId, input.organizationId),
          eq(schema.projectTranslationComments.projectId, input.projectId),
          eq(schema.projectTranslationComments.targetLocale, input.targetLocale),
          inArray(schema.projectTranslationComments.translationKeyId, input.translationKeyIds),
        ),
      )
      .groupBy(
        schema.projectTranslationComments.translationKeyId,
        schema.projectTranslationComments.type,
        schema.projectTranslationComments.status,
      );

    const countsByKeyId = new Map<string, { commentCount: number; unresolvedIssueCount: number }>();

    for (const row of rows) {
      const existing = countsByKeyId.get(row.translationKeyId) ?? {
        commentCount: 0,
        unresolvedIssueCount: 0,
      };
      existing.commentCount += row.count;

      if (
        row.type === "issue" &&
        (row.status === "open" || row.status === "unresolved" || row.status === null)
      ) {
        existing.unresolvedIssueCount += row.count;
      }

      countsByKeyId.set(row.translationKeyId, existing);
    }

    return countsByKeyId;
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
  }): Promise<ProjectFileCatComment | null> {
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

    const commentType = input.type ?? "comment";
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
        type: commentType,
        status: commentType === "issue" ? "unresolved" : null,
        text: input.text,
        issueType: commentType === "issue" ? (input.issueType ?? "general_question") : null,
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
        commentType,
      },
      "saved native CAT comment",
    );

    return toCatComment({
      ...saved,
      ...authorFields,
    });
  }

  async resolve(input: {
    organizationId: string;
    projectId: string;
    commentId: string;
    actorUserId?: string;
    canResolveOthersIssues?: boolean;
  }): Promise<ProjectFileCatComment | null> {
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
      "resolved native CAT issue comment",
    );

    return toCatComment({
      ...updated,
      authorFirstName: existing.authorFirstName,
      authorLastName: existing.authorLastName,
      authorEmail: existing.authorEmail,
    });
  }
}
