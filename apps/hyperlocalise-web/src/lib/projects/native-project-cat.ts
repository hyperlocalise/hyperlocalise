import { and, eq } from "drizzle-orm";

import type {
  ProjectFileCatResponse,
  ProjectFileCatTranslation,
} from "@/api/routes/project/project.schema";
import { db, schema } from "@/lib/database";
import {
  getRepositorySourceFileByPath,
  getProjectTranslationsByKeyIds,
  listProjectTranslationKeysForFile,
} from "@/lib/projects/project-translation-keys";

const maxCatSegments = 500;

function filenameFromSourcePath(sourcePath: string) {
  return sourcePath.split("/").at(-1) ?? sourcePath;
}

function toCatTranslation(row: {
  id: string;
  text: string;
  status: "draft" | "needs_review" | "approved" | "rejected";
}): ProjectFileCatTranslation {
  return {
    text: row.text,
    externalTranslationId: row.id,
    isApproved: row.status === "approved",
  };
}

export async function getNativeProjectCatFile(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  targetLocale: string;
  canEditTranslations: boolean;
}): Promise<ProjectFileCatResponse["catFile"] | null> {
  const sourceFile = await getRepositorySourceFileByPath({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePath: input.sourcePath,
  });

  if (!sourceFile) {
    return null;
  }

  const keys = await listProjectTranslationKeysForFile({
    organizationId: input.organizationId,
    projectId: input.projectId,
    repositorySourceFileId: sourceFile.id,
    limit: maxCatSegments + 1,
  });

  const truncated = keys.length > maxCatSegments;
  const visibleKeys = truncated ? keys.slice(0, maxCatSegments) : keys;
  const translations = await getProjectTranslationsByKeyIds({
    organizationId: input.organizationId,
    projectId: input.projectId,
    translationKeyIds: visibleKeys.map((key) => key.id),
    targetLocale: input.targetLocale,
  });
  const translationByKeyId = new Map(
    translations.map((translation) => [translation.translationKeyId, translation]),
  );

  return {
    sourcePath: input.sourcePath,
    filename: filenameFromSourcePath(input.sourcePath),
    provider: null,
    targetLocale: input.targetLocale,
    canEditTranslations: input.canEditTranslations,
    truncated,
    segments: visibleKeys.map((key) => {
      const translation = translationByKeyId.get(key.id);
      return {
        externalStringId: key.id,
        key: key.key,
        sourceText: key.sourceText,
        context: key.context,
        type: key.type,
        target: translation ? toCatTranslation(translation) : null,
        comments: [],
      };
    }),
  };
}

export async function saveNativeProjectCatTranslation(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  targetLocale: string;
  translationKeyId: string;
  text: string;
  approve?: boolean;
  actorUserId?: string;
  provenance?: "manual" | "translation_job" | "import" | "agent";
  sourceJobId?: string;
}): Promise<ProjectFileCatTranslation | null> {
  const sourceFile = await getRepositorySourceFileByPath({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePath: input.sourcePath,
  });

  if (!sourceFile) {
    return null;
  }

  const [key] = await db
    .select({ id: schema.projectTranslationKeys.id })
    .from(schema.projectTranslationKeys)
    .where(
      and(
        eq(schema.projectTranslationKeys.id, input.translationKeyId),
        eq(schema.projectTranslationKeys.projectId, input.projectId),
        eq(schema.projectTranslationKeys.repositorySourceFileId, sourceFile.id),
      ),
    )
    .limit(1);

  if (!key) {
    return null;
  }

  const status = input.approve ? "approved" : "draft";
  const provenance = input.provenance ?? "manual";
  const reviewedAt = input.approve ? new Date() : null;
  const reviewedByUserId = input.approve ? (input.actorUserId ?? null) : null;

  const [saved] = await db
    .insert(schema.projectTranslations)
    .values({
      organizationId: input.organizationId,
      projectId: input.projectId,
      translationKeyId: key.id,
      targetLocale: input.targetLocale,
      text: input.text,
      status,
      provenance,
      sourceJobId: input.sourceJobId ?? null,
      reviewedByUserId,
      reviewedAt,
    })
    .onConflictDoUpdate({
      target: [
        schema.projectTranslations.translationKeyId,
        schema.projectTranslations.targetLocale,
      ],
      set: {
        text: input.text,
        status,
        provenance,
        sourceJobId: input.sourceJobId ?? null,
        reviewedByUserId,
        reviewedAt,
        updatedAt: new Date(),
      },
    })
    .returning({
      id: schema.projectTranslations.id,
      text: schema.projectTranslations.text,
      status: schema.projectTranslations.status,
    });

  if (!saved) {
    return null;
  }

  return toCatTranslation(saved);
}

export async function updateNativeProjectTranslationStatus(input: {
  organizationId: string;
  projectId: string;
  translationKeyId: string;
  targetLocale: string;
  status: "needs_review" | "approved" | "rejected";
  actorUserId?: string;
}) {
  const reviewedAt = input.status === "approved" || input.status === "rejected" ? new Date() : null;
  const reviewedByUserId =
    input.status === "approved" || input.status === "rejected" ? (input.actorUserId ?? null) : null;

  const [updated] = await db
    .update(schema.projectTranslations)
    .set({
      status: input.status,
      reviewedAt,
      reviewedByUserId,
    })
    .where(
      and(
        eq(schema.projectTranslations.organizationId, input.organizationId),
        eq(schema.projectTranslations.projectId, input.projectId),
        eq(schema.projectTranslations.translationKeyId, input.translationKeyId),
        eq(schema.projectTranslations.targetLocale, input.targetLocale),
      ),
    )
    .returning({
      id: schema.projectTranslations.id,
      text: schema.projectTranslations.text,
      status: schema.projectTranslations.status,
    });

  return updated ? toCatTranslation(updated) : null;
}
