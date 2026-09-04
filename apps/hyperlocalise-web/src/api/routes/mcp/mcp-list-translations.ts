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
import type {
  ProjectFileContentEditorQueueFilter,
  ProjectFileContentEditorQueueSort,
} from "@/api/routes/project/project.schema";
import { isContentEditorAllFilesSourcePath } from "@/lib/projects/content-editor-all-files";
import {
  countProjectTranslationKeysForFile,
  countProjectTranslationKeysForProject,
  getProjectTranslationsByKeyIds,
  getRepositorySourceFileByPath,
  listProjectTranslationKeysForFile,
  listProjectTranslationKeysForProject,
} from "@/lib/projects/translations/project-translation-service";

export const MCP_LIST_TRANSLATIONS_COVERAGE_SOURCE = "native_overlay" as const;

export const mcpListTranslationsQueueFilters = [
  "all",
  "untranslated",
  "needs_review",
  "approved",
  "reviewed",
  "has_issues",
  "hidden",
  "qa_issues",
  "machine_translated",
  "with_comments",
] as const;

export type McpListTranslationsQueueFilter = (typeof mcpListTranslationsQueueFilters)[number];

export type McpTranslationRow = {
  id: string;
  key: string;
  sourcePath: string;
  sourceText: string;
  targetLocale: string | null;
  targetText: string | null;
  status: string | null;
  maxLength: number | null;
  isHidden: boolean;
};

export type McpListTranslationsResult = {
  total: number;
  coverageSource: typeof MCP_LIST_TRANSLATIONS_COVERAGE_SOURCE;
  pagination: {
    limit: number;
    offset: number;
    hasMore: boolean;
    nextOffset: number | null;
  };
  translations: McpTranslationRow[];
};

type ListedKey = {
  id: string;
  key: string;
  sourceText: string;
  sourcePath: string;
  maxLength: number | null;
  isHidden: boolean;
};

export function toCatQueueFilter(
  queueFilter?: McpListTranslationsQueueFilter,
): ProjectFileContentEditorQueueFilter | undefined {
  if (!queueFilter || queueFilter === "approved") {
    return queueFilter === "approved" ? "reviewed" : undefined;
  }

  return queueFilter;
}

function scopedSourcePath(sourcePath?: string) {
  if (!sourcePath || isContentEditorAllFilesSourcePath(sourcePath)) {
    return undefined;
  }

  return sourcePath;
}

async function countKeysForLocale(input: {
  organizationId: string;
  projectId: string;
  targetLocale?: string;
  search?: string;
  queueFilter?: ProjectFileContentEditorQueueFilter;
  sourcePath?: string;
}) {
  const sourcePath = scopedSourcePath(input.sourcePath);
  if (sourcePath) {
    const sourceFile = await getRepositorySourceFileByPath({
      organizationId: input.organizationId,
      projectId: input.projectId,
      sourcePath,
    });

    if (!sourceFile) {
      return 0;
    }

    return countProjectTranslationKeysForFile({
      organizationId: input.organizationId,
      projectId: input.projectId,
      repositorySourceFileId: sourceFile.id,
      targetLocale: input.targetLocale,
      search: input.search,
      queueFilter: input.queueFilter,
    });
  }

  return countProjectTranslationKeysForProject({
    organizationId: input.organizationId,
    projectId: input.projectId,
    targetLocale: input.targetLocale,
    search: input.search,
    queueFilter: input.queueFilter,
    sourcePaths: undefined,
  });
}

async function listKeysForLocale(input: {
  organizationId: string;
  projectId: string;
  targetLocale?: string;
  search?: string;
  queueFilter?: ProjectFileContentEditorQueueFilter;
  queueSort?: ProjectFileContentEditorQueueSort;
  sourcePath?: string;
  limit: number;
  offset: number;
}): Promise<ListedKey[]> {
  const sourcePath = scopedSourcePath(input.sourcePath);
  if (sourcePath) {
    const sourceFile = await getRepositorySourceFileByPath({
      organizationId: input.organizationId,
      projectId: input.projectId,
      sourcePath,
    });

    if (!sourceFile) {
      return [];
    }

    const keys = await listProjectTranslationKeysForFile({
      organizationId: input.organizationId,
      projectId: input.projectId,
      repositorySourceFileId: sourceFile.id,
      targetLocale: input.targetLocale,
      search: input.search,
      queueFilter: input.queueFilter,
      queueSort: input.queueSort,
      limit: input.limit,
      offset: input.offset,
    });

    return keys.map((key) => ({
      id: key.id,
      key: key.key,
      sourceText: key.sourceText,
      sourcePath,
      maxLength: key.maxLength,
      isHidden: key.isHidden,
    }));
  }

  const keys = await listProjectTranslationKeysForProject({
    organizationId: input.organizationId,
    projectId: input.projectId,
    targetLocale: input.targetLocale,
    search: input.search,
    queueFilter: input.queueFilter,
    queueSort: input.queueSort,
    limit: input.limit,
    offset: input.offset,
  });

  return keys.map((key) => ({
    id: key.id,
    key: key.key,
    sourceText: key.sourceText,
    sourcePath: key.sourcePath,
    maxLength: key.maxLength,
    isHidden: key.isHidden,
  }));
}

async function attachTranslations(input: {
  organizationId: string;
  projectId: string;
  targetLocale?: string;
  keys: ListedKey[];
}): Promise<McpTranslationRow[]> {
  if (!input.targetLocale || input.keys.length === 0) {
    return input.keys.map((key) => ({
      id: key.id,
      key: key.key,
      sourcePath: key.sourcePath,
      sourceText: key.sourceText,
      targetLocale: input.targetLocale ?? null,
      targetText: null,
      status: null,
      maxLength: key.maxLength,
      isHidden: key.isHidden,
    }));
  }

  const translations = await getProjectTranslationsByKeyIds({
    organizationId: input.organizationId,
    projectId: input.projectId,
    translationKeyIds: input.keys.map((key) => key.id),
    targetLocale: input.targetLocale,
  });
  const translationByKeyId = new Map(
    translations.map((translation) => [translation.translationKeyId, translation]),
  );

  return input.keys.map((key) => {
    const translation = translationByKeyId.get(key.id);

    return {
      id: key.id,
      key: key.key,
      sourcePath: key.sourcePath,
      sourceText: key.sourceText,
      targetLocale: input.targetLocale ?? null,
      targetText: translation?.text ?? null,
      status: translation?.status ?? null,
      maxLength: key.maxLength,
      isHidden: key.isHidden,
    };
  });
}

export async function loadMcpListTranslations(input: {
  organizationId: string;
  projectId: string;
  projectTargetLocales: readonly string[];
  sourcePath?: string;
  targetLocale?: string;
  search?: string;
  queueFilter?: McpListTranslationsQueueFilter;
  queueSort?: ProjectFileContentEditorQueueSort;
  limit: number;
  offset: number;
}): Promise<McpListTranslationsResult> {
  const queueFilter = toCatQueueFilter(input.queueFilter);
  const locales = input.targetLocale
    ? [input.targetLocale]
    : input.projectTargetLocales.length > 0
      ? [...input.projectTargetLocales]
      : [undefined];

  const counts = await Promise.all(
    locales.map((targetLocale) =>
      countKeysForLocale({
        organizationId: input.organizationId,
        projectId: input.projectId,
        targetLocale,
        search: input.search,
        queueFilter,
        sourcePath: input.sourcePath,
      }),
    ),
  );
  const total = counts.reduce((sum, count) => sum + count, 0);

  let skip = input.offset;
  let remaining = input.limit;
  const translations: McpTranslationRow[] = [];

  for (let index = 0; index < locales.length; index += 1) {
    const localeTotal = counts[index] ?? 0;
    if (remaining <= 0) {
      break;
    }

    if (skip >= localeTotal) {
      skip -= localeTotal;
      continue;
    }

    const keys = await listKeysForLocale({
      organizationId: input.organizationId,
      projectId: input.projectId,
      targetLocale: locales[index],
      search: input.search,
      queueFilter,
      queueSort: input.queueSort,
      sourcePath: input.sourcePath,
      limit: remaining,
      offset: skip,
    });

    translations.push(
      ...(await attachTranslations({
        organizationId: input.organizationId,
        projectId: input.projectId,
        targetLocale: locales[index],
        keys,
      })),
    );
    remaining -= keys.length;
    skip = 0;
  }

  const nextOffset = input.offset + translations.length;
  const hasMore = nextOffset < total;

  return {
    total,
    coverageSource: MCP_LIST_TRANSLATIONS_COVERAGE_SOURCE,
    pagination: {
      limit: input.limit,
      offset: input.offset,
      hasMore,
      nextOffset: hasMore ? nextOffset : null,
    },
    translations,
  };
}
