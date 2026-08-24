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
import { createHash } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";

import type {
  ProjectFileCatQueueFilter,
  ProjectFileCatQueueSort,
} from "@/api/routes/project/project.schema";
import { db, type DatabaseClient } from "@/lib/database";

export type NativeCatGroupingExceptionResolver = (input: {
  organizationId: string;
  projectId: string;
  targetLocale: string;
}) => Promise<readonly string[]> | readonly string[];

export type NativeCatLogicalRow = {
  kind: "segment" | "group";
  externalStringId: string;
  translationKeyId: string | null;
  groupId?: string;
  sourceTextHash?: string;
  key: string;
  sourceText: string;
  context: string | null;
  type: string | null;
  maxLength: number | null;
  metadata: Record<string, unknown> | null;
  isHidden: boolean;
  sourcePath: string;
  projectOccurrenceCount: number;
  fileOccurrenceCount: number;
};

type GroupedRow = {
  representativeId: string;
  representativeKey: string;
  sourceText: string;
  sourceTextHash: string;
  representativeContext: string | null;
  representativeType: string | null;
  representativeMaxLength: number | null;
  representativeMetadata: Record<string, unknown> | null;
  representativeHidden: boolean;
  representativeSourcePath: string;
  projectOccurrenceCount: number;
  fileOccurrenceCount: number;
  totalLogicalRows: number;
  totalSourceOccurrences: number;
};

export function nativeCatGroupId(input: {
  projectId: string;
  targetLocale: string;
  sourceText: string;
}) {
  return createHash("sha256")
    .update(input.projectId, "utf8")
    .update("\0")
    .update(input.targetLocale, "utf8")
    .update("\0")
    .update(input.sourceText, "utf8")
    .digest("hex");
}

function escapeLike(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function groupFilter(filter: ProjectFileCatQueueFilter): SQL {
  switch (filter) {
    case "untranslated":
      return sql`bool_or(coalesce(trim(target_text), '') = '')`;
    case "reviewed":
      return sql`bool_and(target_status = 'approved')`;
    case "needs_review":
      return sql`bool_or(coalesce(trim(target_text), '') != '' and target_status != 'approved')`;
    case "has_issues":
      return sql`bool_or(has_issues)`;
    case "hidden":
      return sql`bool_or(is_hidden)`;
    case "all":
      return sql`true`;
    default:
      return sql`true`;
  }
}

/**
 * Resolves native CAT logical rows in PostgreSQL. The exception resolver returns
 * translation key IDs to subtract from automatic groups for HL-622.
 */
export async function resolveNativeCatLogicalRows(
  input: {
    organizationId: string;
    projectId: string;
    targetLocale: string;
    sourcePath: string;
    sourcePaths?: readonly string[] | null;
    limit: number;
    offset: number;
    search?: string;
    queueFilter: ProjectFileCatQueueFilter;
    queueSort: ProjectFileCatQueueSort;
  },
  options: {
    database?: DatabaseClient;
    resolveExceptionPredicate?: NativeCatGroupingExceptionResolver;
  } = {},
) {
  const database = options.database ?? db;
  const excludedTranslationKeyIds =
    (await options.resolveExceptionPredicate?.({
      organizationId: input.organizationId,
      projectId: input.projectId,
      targetLocale: input.targetLocale,
    })) ?? [];
  const groupingKey =
    excludedTranslationKeyIds.length > 0
      ? sql`case when k.id in (${sql.join(
          excludedTranslationKeyIds.map((id) => sql`${id}`),
          sql`, `,
        )}) then k.id::text else k.source_text_hash end`
      : sql`k.source_text_hash`;
  const requestedPaths = input.sourcePath === "*" ? input.sourcePaths : [input.sourcePath];
  const pathPredicate =
    requestedPaths && requestedPaths.length > 0
      ? sql`source_path in (${sql.join(
          requestedPaths.map((path) => sql`${path}`),
          sql`, `,
        )})`
      : sql`true`;
  const search = input.search?.trim();
  const searchPredicate = search
    ? sql`bool_or(
        key ilike ${`%${escapeLike(search)}%`} escape '\\'
        or source_text ilike ${`%${escapeLike(search)}%`} escape '\\'
        or context ilike ${`%${escapeLike(search)}%`} escape '\\'
        or target_text ilike ${`%${escapeLike(search)}%`} escape '\\'
      )`
    : sql`true`;
  const filterPredicate = groupFilter(input.queueFilter);
  const order =
    input.queueSort === "untranslated_first"
      ? sql`untranslated_rank, representative_source_path, representative_key, representative_id`
      : sql`representative_source_path, representative_key, representative_id`;

  const rows = await database.execute<GroupedRow>(sql`
    with scoped as (
      select
        k.id,
        k.key,
        k.source_text,
        k.source_text_hash,
        ${groupingKey} as grouping_key,
        k.context,
        k.type,
        k.max_length,
        k.metadata,
        k.is_hidden,
        f.source_path,
        t.text as target_text,
        t.status as target_status,
        (
          exists (
            select 1 from issue_sheet_issues i
            where i.translation_key_id = k.id
              and i.organization_id = ${input.organizationId}
              and i.project_id = ${input.projectId}
              and i.target_locale = ${input.targetLocale}
              and i.status in ('open', 'in_progress')
          )
          or exists (
            select 1 from project_translation_comments c
            where c.translation_key_id = k.id
              and c.organization_id = ${input.organizationId}
              and c.project_id = ${input.projectId}
              and c.target_locale = ${input.targetLocale}
              and c.type = 'issue'
              and c.status = 'unresolved'
          )
        ) as has_issues
      from project_translation_keys k
      inner join repository_source_files f on f.id = k.repository_source_file_id
      left join project_translations t
        on t.translation_key_id = k.id
        and t.target_locale = ${input.targetLocale}
      where k.organization_id = ${input.organizationId}
        and k.project_id = ${input.projectId}
    ), grouped as (
      select
        (array_agg(id order by source_path, key, id))[1] as representative_id,
        (array_agg(key order by source_path, key, id))[1] as representative_key,
        source_text,
        source_text_hash,
        (array_agg(context order by source_path, key, id))[1] as representative_context,
        (array_agg(type order by source_path, key, id))[1] as representative_type,
        (array_agg(max_length order by source_path, key, id))[1] as representative_max_length,
        (array_agg(metadata order by source_path, key, id))[1] as representative_metadata,
        (array_agg(is_hidden order by source_path, key, id))[1] as representative_hidden,
        (array_agg(source_path order by source_path, key, id))[1] as representative_source_path,
        count(*)::int as project_occurrence_count,
        count(*) filter (where ${pathPredicate})::int as file_occurrence_count,
        case
          when bool_or(coalesce(trim(target_text), '') = '') then 0
          when bool_or(target_status != 'approved') then 1
          else 2
        end as untranslated_rank
      from scoped
      group by grouping_key, source_text_hash, source_text
      having count(*) filter (where ${pathPredicate}) > 0
        and ${searchPredicate}
        and ${filterPredicate}
    ), counted as (
      select
        *,
        count(*) over ()::int as total_logical_rows,
        sum(project_occurrence_count) over ()::int as total_source_occurrences
      from grouped
    )
    select
      representative_id as "representativeId",
      representative_key as "representativeKey",
      source_text as "sourceText",
      source_text_hash as "sourceTextHash",
      representative_context as "representativeContext",
      representative_type as "representativeType",
      representative_max_length as "representativeMaxLength",
      representative_metadata as "representativeMetadata",
      representative_hidden as "representativeHidden",
      representative_source_path as "representativeSourcePath",
      project_occurrence_count as "projectOccurrenceCount",
      file_occurrence_count as "fileOccurrenceCount",
      total_logical_rows as "totalLogicalRows",
      total_source_occurrences as "totalSourceOccurrences"
    from counted
    order by ${order}
    limit ${input.limit}
    offset ${input.offset}
  `);

  const logicalRows: NativeCatLogicalRow[] = rows.map((row) => {
    const projectOccurrenceCount = Number(row.projectOccurrenceCount);
    if (projectOccurrenceCount === 1) {
      return {
        kind: "segment",
        externalStringId: row.representativeId,
        translationKeyId: row.representativeId,
        key: row.representativeKey,
        sourceText: row.sourceText,
        context: row.representativeContext,
        type: row.representativeType,
        maxLength: row.representativeMaxLength,
        metadata: row.representativeMetadata,
        isHidden: row.representativeHidden,
        sourcePath: row.representativeSourcePath,
        projectOccurrenceCount,
        fileOccurrenceCount: Number(row.fileOccurrenceCount),
      };
    }

    const groupId = nativeCatGroupId({
      projectId: input.projectId,
      targetLocale: input.targetLocale,
      sourceText: row.sourceText,
    });
    return {
      kind: "group",
      externalStringId: groupId,
      translationKeyId: null,
      groupId,
      sourceTextHash: row.sourceTextHash,
      key: row.representativeKey,
      sourceText: row.sourceText,
      context: row.representativeContext,
      type: row.representativeType,
      maxLength: row.representativeMaxLength,
      metadata: row.representativeMetadata,
      isHidden: row.representativeHidden,
      sourcePath: row.representativeSourcePath,
      projectOccurrenceCount,
      fileOccurrenceCount: Number(row.fileOccurrenceCount),
    };
  });

  return {
    rows: logicalRows,
    totalLogicalRows: Number(rows[0]?.totalLogicalRows ?? 0),
    totalSourceOccurrences: Number(rows[0]?.totalSourceOccurrences ?? 0),
  };
}
