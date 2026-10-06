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
import { sql, type SQL } from "drizzle-orm";

import type { ProjectFileContentEditorQueueFilter } from "@/api/routes/project/project.schema";
import { schema } from "@/lib/database/client";
import type { ContentEditorAdvancedQueueFilter } from "@/lib/projects/content-editor/content-editor-advanced-queue-filter";
import { translationQaCheckTypes } from "@/lib/qa/types";

const nativeMachineTranslationProvenances = ["translation_job", "agent", "import"] as const;

function translationMatchSql(input: {
  organizationId: string;
  projectId: string;
  targetLocale: string;
}) {
  return sql`
    ${schema.projectTranslations.translationKeyId} = ${schema.projectTranslationKeys.id}
    and ${schema.projectTranslations.organizationId} = ${input.organizationId}
    and ${schema.projectTranslations.projectId} = ${input.projectId}
    and ${schema.projectTranslations.targetLocale} = ${input.targetLocale}
  `;
}

function latestQaRunSql(input: { organizationId: string; projectId: string }) {
  return sql`
    select ${schema.translationQaRuns.id}
    from ${schema.translationQaRuns}
    where ${schema.translationQaRuns.organizationId} = ${input.organizationId}
      and ${schema.translationQaRuns.projectId} = ${input.projectId}
      and ${schema.translationQaRuns.status} = 'succeeded'
    order by ${schema.translationQaRuns.completedAt} desc nulls last,
      ${schema.translationQaRuns.createdAt} desc
    limit 1
  `;
}

function nativeQaIssuesSql(
  input: { organizationId: string; projectId: string; targetLocale: string },
  checkType?: string,
) {
  const checkTypeSql =
    checkType && (translationQaCheckTypes as readonly string[]).includes(checkType)
      ? sql`and ${schema.translationQaFindings.checkType} = ${checkType}`
      : sql``;

  return sql`exists (
    select 1
    from ${schema.translationQaFindings}
    where ${schema.translationQaFindings.translationKeyId} = ${schema.projectTranslationKeys.id}
      and ${schema.translationQaFindings.organizationId} = ${input.organizationId}
      and ${schema.translationQaFindings.projectId} = ${input.projectId}
      and ${schema.translationQaFindings.targetLocale} = ${input.targetLocale}
      and ${schema.translationQaFindings.status} = 'open'
      ${checkTypeSql}
      and ${schema.translationQaFindings.runId} = (${latestQaRunSql(input)})
  )`;
}

function nativeCommentsSql(
  input: { organizationId: string; projectId: string; targetLocale: string },
  presence: "with" | "without",
) {
  const existsSql = sql`exists (
    select 1
    from ${schema.projectTranslationComments}
    where ${schema.projectTranslationComments.translationKeyId} = ${schema.projectTranslationKeys.id}
      and ${schema.projectTranslationComments.organizationId} = ${input.organizationId}
      and ${schema.projectTranslationComments.projectId} = ${input.projectId}
      and ${schema.projectTranslationComments.targetLocale} = ${input.targetLocale}
  )`;
  return presence === "without" ? sql`not ${existsSql}` : existsSql;
}

function nativeHasIssuesSql(
  input: { organizationId: string; projectId: string; targetLocale: string },
  issueType?: string,
) {
  const issueTypeSql = issueType ? sql`and ${schema.issueSheetIssues.issueType} = ${issueType}` : sql``;
  const commentIssueTypeSql = issueType
    ? sql`and ${schema.projectTranslationComments.issueType} = ${issueType}`
    : sql``;

  return sql`(
    exists (
      select 1
      from ${schema.issueSheetIssues}
      where ${schema.issueSheetIssues.translationKeyId} = ${schema.projectTranslationKeys.id}
        and ${schema.issueSheetIssues.organizationId} = ${input.organizationId}
        and ${schema.issueSheetIssues.projectId} = ${input.projectId}
        and ${schema.issueSheetIssues.targetLocale} = ${input.targetLocale}
        and ${schema.issueSheetIssues.status} in ('open', 'in_progress')
        ${issueTypeSql}
    )
    or exists (
      select 1
      from ${schema.projectTranslationComments}
      where ${schema.projectTranslationComments.translationKeyId} = ${schema.projectTranslationKeys.id}
        and ${schema.projectTranslationComments.organizationId} = ${input.organizationId}
        and ${schema.projectTranslationComments.projectId} = ${input.projectId}
        and ${schema.projectTranslationComments.targetLocale} = ${input.targetLocale}
        and ${schema.projectTranslationComments.type} = 'issue'
        and ${schema.projectTranslationComments.status} = 'unresolved'
        ${commentIssueTypeSql}
        and not exists (
          select 1
          from ${schema.issueSheetIssues}
          where ${schema.issueSheetIssues.linkedCommentId} = ${schema.projectTranslationComments.id}
        )
    )
  )`;
}

function nativeMachineTranslatedSql(
  input: { organizationId: string; projectId: string; targetLocale: string },
  qualifier?: string,
) {
  const provenances =
    qualifier && (nativeMachineTranslationProvenances as readonly string[]).includes(qualifier)
      ? [qualifier]
      : [...nativeMachineTranslationProvenances];

  return sql`exists (
    select 1
    from ${schema.projectTranslations}
    where ${translationMatchSql(input)}
      and trim(${schema.projectTranslations.text}) != ''
      and ${schema.projectTranslations.provenance} in (${sql.join(
        provenances.map((value) => sql`${value}`),
        sql`, `,
      )})
  )`;
}

function nativeDateBoundSql(
  column: typeof schema.projectTranslationKeys.createdAt,
  from?: string,
  to?: string,
) {
  const parts: SQL[] = [];
  if (from) {
    parts.push(sql`${column} >= CAST(${from} AS date)`);
  }
  if (to) {
    parts.push(sql`${column} < (CAST(${to} AS date) + interval '1 day')`);
  }
  if (parts.length === 0) {
    return undefined;
  }
  return sql.join(parts, sql` and `);
}

function nativeStringTypeSql(stringType: ContentEditorAdvancedQueueFilter["stringType"]) {
  if (stringType === "plain") {
    return sql`(
      ${schema.projectTranslationKeys.type} is null
      or ${schema.projectTranslationKeys.type} = ''
      or ${schema.projectTranslationKeys.type} in ('text', 'plain')
    )`;
  }
  if (stringType === "plural") {
    return sql`${schema.projectTranslationKeys.type} = 'plural'`;
  }
  if (stringType === "icu") {
    return sql`${schema.projectTranslationKeys.type} = 'icu'`;
  }
  if (stringType === "asset") {
    return sql`${schema.projectTranslationKeys.type} in ('asset', 'image', 'video')`;
  }
  return undefined;
}

export function nativeQueueFilterCondition(input: {
  organizationId: string;
  projectId: string;
  targetLocale: string;
  queueFilter?: ProjectFileContentEditorQueueFilter;
  queueFilterQualifier?: string;
  advancedFilter?: ContentEditorAdvancedQueueFilter;
}) {
  const fragments: SQL[] = [];
  const filter = input.queueFilter;
  const translationMatch = translationMatchSql(input);

  if (filter && filter !== "all") {
    switch (filter) {
      case "untranslated":
        fragments.push(sql`not exists (
          select 1
          from ${schema.projectTranslations}
          where ${translationMatch}
            and trim(${schema.projectTranslations.text}) != ''
        )`);
        break;
      case "reviewed":
        fragments.push(sql`exists (
          select 1
          from ${schema.projectTranslations}
          where ${translationMatch}
            and ${schema.projectTranslations.status} = 'approved'
        )`);
        break;
      case "needs_review":
        fragments.push(sql`exists (
          select 1
          from ${schema.projectTranslations}
          where ${translationMatch}
            and trim(${schema.projectTranslations.text}) != ''
            and ${schema.projectTranslations.status} != 'approved'
        )`);
        break;
      case "has_issues":
        fragments.push(nativeHasIssuesSql(input, input.queueFilterQualifier));
        break;
      case "qa_issues":
        fragments.push(nativeQaIssuesSql(input, input.queueFilterQualifier));
        break;
      case "hidden":
        fragments.push(sql`${schema.projectTranslationKeys.isHidden} = true`);
        break;
      case "not_hidden":
        fragments.push(sql`${schema.projectTranslationKeys.isHidden} = false`);
        break;
      case "machine_translated":
        fragments.push(nativeMachineTranslatedSql(input, input.queueFilterQualifier));
        break;
      case "with_comments":
        fragments.push(nativeCommentsSql(input, "with"));
        break;
      default:
        break;
    }
  }

  const advanced = input.advancedFilter;
  if (advanced) {
    const added = nativeDateBoundSql(
      schema.projectTranslationKeys.createdAt,
      advanced.addedFrom,
      advanced.addedTo,
    );
    if (added) fragments.push(added);
    const updated = nativeDateBoundSql(
      schema.projectTranslationKeys.updatedAt,
      advanced.updatedFrom,
      advanced.updatedTo,
    );
    if (updated) fragments.push(updated);

    const stringType = nativeStringTypeSql(advanced.stringType);
    if (stringType) fragments.push(stringType);

    if (advanced.translationStatus === "untranslated") {
      fragments.push(sql`not exists (
        select 1 from ${schema.projectTranslations}
        where ${translationMatch} and trim(${schema.projectTranslations.text}) != ''
      )`);
    }
    if (advanced.translationStatus === "translated" || advanced.translationStatus === "partially_translated") {
      fragments.push(sql`exists (
        select 1 from ${schema.projectTranslations}
        where ${translationMatch} and trim(${schema.projectTranslations.text}) != ''
      )`);
    }
    if (advanced.approvalStatus === "approved") {
      fragments.push(sql`exists (
        select 1 from ${schema.projectTranslations}
        where ${translationMatch} and ${schema.projectTranslations.status} = 'approved'
      )`);
    }
    if (advanced.approvalStatus === "not_approved" || advanced.approvalStatus === "partially_approved") {
      fragments.push(sql`exists (
        select 1 from ${schema.projectTranslations}
        where ${translationMatch}
          and trim(${schema.projectTranslations.text}) != ''
          and ${schema.projectTranslations.status} != 'approved'
      )`);
    }
    if (advanced.qaIssues === "with") {
      fragments.push(nativeQaIssuesSql(input, advanced.qaIssueType));
    }
    if (advanced.qaIssues === "without") {
      fragments.push(sql`not ${nativeQaIssuesSql(input)}`);
    }
    if (advanced.comments) {
      fragments.push(nativeCommentsSql(input, advanced.comments));
    }
    if (advanced.visibility === "hidden") {
      fragments.push(sql`${schema.projectTranslationKeys.isHidden} = true`);
    }
    if (advanced.visibility === "visible") {
      fragments.push(sql`${schema.projectTranslationKeys.isHidden} = false`);
    }
  }

  if (fragments.length === 0) {
    return undefined;
  }
  if (fragments.length === 1) {
    return fragments[0];
  }
  return sql.join(fragments, sql` and `);
}
