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
import type { ProjectFileContentEditorQueueFilter } from "@/api/routes/project/project.schema";
import { countProjectTranslationKeysForProject } from "@/lib/projects/translations/project-translation-service";

export const MCP_PROJECT_STATUS_COVERAGE_SOURCE = "native_overlay" as const;

export type McpProjectLocaleStatus = {
  locale: string;
  total: number;
  translated: number;
  untranslated: number;
  needsReview: number;
  approved: number;
  hidden: number;
};

export type McpProjectStatus = {
  projectId: string;
  sourceLocale: string | null;
  targetLocales: string[];
  coverageSource: typeof MCP_PROJECT_STATUS_COVERAGE_SOURCE;
  locales: McpProjectLocaleStatus[];
  files?: Array<{
    sourcePath: string;
    locales: McpProjectLocaleStatus[];
  }>;
};

const localeQueueFilters = [
  "untranslated",
  "needs_review",
  "reviewed",
  "hidden",
] as const satisfies readonly ProjectFileContentEditorQueueFilter[];

async function countLocaleStatus(input: {
  organizationId: string;
  projectId: string;
  locale: string;
  sourcePaths?: readonly string[] | null;
}): Promise<McpProjectLocaleStatus> {
  const countInput = {
    organizationId: input.organizationId,
    projectId: input.projectId,
    targetLocale: input.locale,
    sourcePaths: input.sourcePaths,
  };

  const [total, untranslated, needsReview, approved, hidden] = await Promise.all([
    countProjectTranslationKeysForProject(countInput),
    ...localeQueueFilters.map((queueFilter) =>
      countProjectTranslationKeysForProject({
        ...countInput,
        queueFilter,
      }),
    ),
  ]);

  return {
    locale: input.locale,
    total,
    translated: total - untranslated,
    untranslated,
    needsReview,
    approved,
    hidden,
  };
}

async function countLocales(input: {
  organizationId: string;
  projectId: string;
  targetLocales: string[];
  sourcePaths?: readonly string[] | null;
}): Promise<McpProjectLocaleStatus[]> {
  return Promise.all(
    input.targetLocales.map((locale) =>
      countLocaleStatus({
        organizationId: input.organizationId,
        projectId: input.projectId,
        locale,
        sourcePaths: input.sourcePaths,
      }),
    ),
  );
}

export async function loadMcpProjectStatus(input: {
  organizationId: string;
  projectId: string;
  sourceLocale: string | null;
  targetLocales: string[];
  sourcePath?: string;
}): Promise<McpProjectStatus> {
  const locales = await countLocales({
    organizationId: input.organizationId,
    projectId: input.projectId,
    targetLocales: input.targetLocales,
  });

  const status: McpProjectStatus = {
    projectId: input.projectId,
    sourceLocale: input.sourceLocale,
    targetLocales: input.targetLocales,
    coverageSource: MCP_PROJECT_STATUS_COVERAGE_SOURCE,
    locales,
  };

  if (!input.sourcePath) {
    return status;
  }

  return {
    ...status,
    files: [
      {
        sourcePath: input.sourcePath,
        locales: await countLocales({
          organizationId: input.organizationId,
          projectId: input.projectId,
          targetLocales: input.targetLocales,
          sourcePaths: [input.sourcePath],
        }),
      },
    ],
  };
}
