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
import { z } from "zod";

import { translationQaCheckTypes } from "@/lib/qa/types";

export const crowdinUnresolvedIssueQualifiers = [
  "general_question",
  "translation_mistake",
  "context_request",
  "source_mistake",
] as const;

export const nativeUnresolvedIssueQualifiers = [
  ...crowdinUnresolvedIssueQualifiers,
  "glossary_violation",
  "qa_failure",
] as const;

export const contentEditorWorkspaceQueueFilterQualifierParam = "queueFilterQualifier";
export const contentEditorWorkspaceQueueAdvancedParam = "queueAdvanced";

export const contentEditorLabelIncludeModes = ["include_all", "include_any"] as const;
export const contentEditorLabelExcludeModes = ["exclude_all", "exclude_any"] as const;

export const contentEditorStringTypes = ["plain", "plural", "icu", "asset"] as const;
export const contentEditorTranslationStatuses = [
  "translated",
  "untranslated",
  "partially_translated",
] as const;
export const contentEditorApprovalStatuses = [
  "approved",
  "not_approved",
  "partially_approved",
] as const;
export const contentEditorPresenceFilters = ["with", "without"] as const;
export const contentEditorVisibilityFilters = ["visible", "hidden"] as const;

export const crowdinQaIssueQualifiers = [
  "empty_translation",
  "translation_length",
  "tags_mismatch",
  "spaces_mismatch",
  "variables_mismatch",
  "punctuation_mismatch",
  "character_case_mismatch",
  "special_characters_mismatch",
  "incorrect_translation",
  "spelling",
  "icu_syntax",
  "terms",
  "duplicate_translation",
  "ftl_syntax",
  "android_syntax",
  "numbers_mismatch",
  "ai",
  "outdated_translation",
  "mdx_syntax",
  "custom",
] as const;

export const crowdinMachineTranslationQualifiers = ["tm", "mt", "ai"] as const;
export const nativeMachineTranslationQualifiers = ["translation_job", "agent", "import"] as const;

export const crowdinQaCroqlByQualifier: Record<(typeof crowdinQaIssueQualifiers)[number], string> =
  {
    empty_translation: "has empty translation qa issues",
    translation_length: "has translation length qa issues",
    tags_mismatch: "has tags mismatch qa issues",
    spaces_mismatch: "has spaces mismatch qa issues",
    variables_mismatch: "has variables mismatch qa issues",
    punctuation_mismatch: "has punctuation mismatch qa issues",
    character_case_mismatch: "has character case mismatch qa issues",
    special_characters_mismatch: "has special characters mismatch qa issues",
    incorrect_translation: "has incorrect translation qa issues",
    spelling: "has spelling qa issues",
    icu_syntax: "has icu syntax qa issues",
    terms: "has terms qa issues",
    duplicate_translation: "has duplicate translation qa issues",
    ftl_syntax: "has ftl syntax qa issues",
    android_syntax: "has android syntax qa issues",
    numbers_mismatch: "has numbers mismatch qa issues",
    ai: "has ai qa issues",
    outdated_translation: "has outdated translation qa issues",
    mdx_syntax: "has mdx syntax qa issues",
    custom: "has custom qa issues",
  };

function isIsoCalendarDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

const isoDateSchema = z
  .string()
  .refine(isIsoCalendarDate, "Date must be a real YYYY-MM-DD calendar date")
  .optional();

const labelIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/);

export const contentEditorAdvancedQueueFilterSchema = z
  .object({
    addedFrom: isoDateSchema,
    addedTo: isoDateSchema,
    updatedFrom: isoDateSchema,
    updatedTo: isoDateSchema,
    includeLabelMode: z.enum(contentEditorLabelIncludeModes).optional(),
    includeLabelIds: z.array(labelIdSchema).max(50).optional(),
    excludeLabelMode: z.enum(contentEditorLabelExcludeModes).optional(),
    excludeLabelIds: z.array(labelIdSchema).max(50).optional(),
    stringType: z.enum(contentEditorStringTypes).optional(),
    translationStatus: z.enum(contentEditorTranslationStatuses).optional(),
    approvalStatus: z.enum(contentEditorApprovalStatuses).optional(),
    qaIssues: z.enum(contentEditorPresenceFilters).optional(),
    qaIssueType: z.string().trim().min(1).max(64).optional(),
    comments: z.enum(contentEditorPresenceFilters).optional(),
    screenshots: z.enum(contentEditorPresenceFilters).optional(),
    visibility: z.enum(contentEditorVisibilityFilters).optional(),
  })
  .strict();

export type ContentEditorAdvancedQueueFilter = z.infer<
  typeof contentEditorAdvancedQueueFilterSchema
>;
export type ContentEditorLabelIncludeMode = (typeof contentEditorLabelIncludeModes)[number];
export type ContentEditorLabelExcludeMode = (typeof contentEditorLabelExcludeModes)[number];
export type ContentEditorStringType = (typeof contentEditorStringTypes)[number];
export type ContentEditorTranslationStatus = (typeof contentEditorTranslationStatuses)[number];
export type ContentEditorApprovalStatus = (typeof contentEditorApprovalStatuses)[number];
export type ContentEditorPresenceFilter = (typeof contentEditorPresenceFilters)[number];
export type ContentEditorVisibilityFilter = (typeof contentEditorVisibilityFilters)[number];
export type CrowdinQaIssueQualifier = (typeof crowdinQaIssueQualifiers)[number];
export type CrowdinMachineTranslationQualifier =
  (typeof crowdinMachineTranslationQualifiers)[number];
export type NativeMachineTranslationQualifier = (typeof nativeMachineTranslationQualifiers)[number];

export const EMPTY_ADVANCED_QUEUE_FILTER: ContentEditorAdvancedQueueFilter = {};

export function isAdvancedQueueFilterSupportedForProvider(providerKind: string | null | undefined) {
  return providerKind == null || providerKind === "native" || providerKind === "crowdin";
}

export function advancedQueueFilterSupportsLabels(providerKind: string | null | undefined) {
  return providerKind === "crowdin";
}

export function advancedQueueFilterSupportsScreenshots(providerKind: string | null | undefined) {
  return providerKind === "crowdin";
}

export function advancedQueueFilterSupportsPartialStatuses(
  providerKind: string | null | undefined,
) {
  return providerKind === "crowdin";
}

export function catQueueFilterQueryParams(input: {
  queueFilterQualifier?: string | null;
  advancedFilter?: ContentEditorAdvancedQueueFilter | null;
}) {
  const queueAdvanced = serializeAdvancedQueueFilter(input.advancedFilter);
  return {
    ...(input.queueFilterQualifier ? { queueFilterQualifier: input.queueFilterQualifier } : {}),
    ...(queueAdvanced ? { queueAdvanced } : {}),
  };
}

export function isCatQueueFilterEmpty(filter: ContentEditorAdvancedQueueFilter | null | undefined) {
  if (!filter) {
    return true;
  }

  return Object.values(compactAdvancedQueueFilter(filter)).every((value) => value == null);
}

export function compactAdvancedQueueFilter(
  filter: ContentEditorAdvancedQueueFilter,
): ContentEditorAdvancedQueueFilter {
  const compacted: ContentEditorAdvancedQueueFilter = {};

  if (filter.addedFrom) compacted.addedFrom = filter.addedFrom;
  if (filter.addedTo) compacted.addedTo = filter.addedTo;
  if (filter.updatedFrom) compacted.updatedFrom = filter.updatedFrom;
  if (filter.updatedTo) compacted.updatedTo = filter.updatedTo;
  if (filter.includeLabelIds && filter.includeLabelIds.length > 0) {
    compacted.includeLabelMode = filter.includeLabelMode ?? "include_all";
    compacted.includeLabelIds = [...new Set(filter.includeLabelIds)];
  }
  if (filter.excludeLabelIds && filter.excludeLabelIds.length > 0) {
    compacted.excludeLabelMode = filter.excludeLabelMode ?? "exclude_all";
    compacted.excludeLabelIds = [...new Set(filter.excludeLabelIds)];
  }
  if (filter.stringType) compacted.stringType = filter.stringType;
  if (filter.translationStatus) compacted.translationStatus = filter.translationStatus;
  if (filter.approvalStatus) compacted.approvalStatus = filter.approvalStatus;
  if (filter.qaIssues) compacted.qaIssues = filter.qaIssues;
  if (filter.qaIssueType) compacted.qaIssueType = filter.qaIssueType;
  if (filter.comments) compacted.comments = filter.comments;
  if (filter.screenshots) compacted.screenshots = filter.screenshots;
  if (filter.visibility) compacted.visibility = filter.visibility;

  return compacted;
}

export function serializeAdvancedQueueFilter(
  filter: ContentEditorAdvancedQueueFilter | null | undefined,
) {
  if (isCatQueueFilterEmpty(filter)) {
    return undefined;
  }

  return JSON.stringify(compactAdvancedQueueFilter(filter!));
}

export function parseAdvancedQueueFilter(
  value: string | null | undefined,
): ContentEditorAdvancedQueueFilter | undefined {
  if (!value?.trim()) {
    return undefined;
  }

  try {
    const parsed = contentEditorAdvancedQueueFilterSchema.safeParse(JSON.parse(value));
    if (!parsed.success) {
      return undefined;
    }

    const compacted = compactAdvancedQueueFilter(parsed.data);
    return isCatQueueFilterEmpty(compacted) ? undefined : compacted;
  } catch {
    return undefined;
  }
}

const allowedQualifiers = new Set<string>([
  ...crowdinQaIssueQualifiers,
  ...translationQaCheckTypes,
  ...crowdinMachineTranslationQualifiers,
  ...nativeMachineTranslationQualifiers,
  ...nativeUnresolvedIssueQualifiers,
]);

export function parseQueueFilterQualifier(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed || !allowedQualifiers.has(trimmed)) {
    return undefined;
  }

  return trimmed;
}

export function crowdinQaQualifiersForProvider(providerKind: string | null | undefined) {
  if (providerKind === "crowdin") {
    return crowdinQaIssueQualifiers;
  }

  return translationQaCheckTypes;
}

export function machineTranslationQualifiersForProvider(providerKind: string | null | undefined) {
  if (providerKind === "crowdin") {
    return crowdinMachineTranslationQualifiers;
  }

  return nativeMachineTranslationQualifiers;
}

export function unresolvedIssueQualifiersForProvider(providerKind: string | null | undefined) {
  if (providerKind === "crowdin") {
    return crowdinUnresolvedIssueQualifiers;
  }

  return nativeUnresolvedIssueQualifiers;
}

export function toCrowdinCommentIssueType(issueType: string) {
  return issueType.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

export function croqlDatetimeStart(date: string) {
  return `${date} 00:00:00`;
}

export function croqlDatetimeEnd(date: string) {
  return `${date} 23:59:59`;
}

export function croqlDateRangePredicate(field: "added" | "updated", from?: string, to?: string) {
  if (from && to) {
    return `${field} between '${croqlDatetimeStart(from)}' and '${croqlDatetimeEnd(to)}'`;
  }
  if (from) {
    return `${field} >= '${croqlDatetimeStart(from)}'`;
  }
  if (to) {
    return `${field} <= '${croqlDatetimeEnd(to)}'`;
  }
  return undefined;
}

export function croqlLabelPredicates(input: {
  includeLabelMode?: ContentEditorLabelIncludeMode;
  includeLabelIds?: readonly string[];
  excludeLabelMode?: ContentEditorLabelExcludeMode;
  excludeLabelIds?: readonly string[];
}) {
  const parts: string[] = [];
  const includeIds = (input.includeLabelIds ?? [])
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);
  const excludeIds = (input.excludeLabelIds ?? [])
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);

  if (includeIds.length > 0) {
    if ((input.includeLabelMode ?? "include_all") === "include_any") {
      parts.push(
        `count of labels where (${includeIds.map((id) => `id = ${id}`).join(" or ")}) > 0`,
      );
    } else {
      parts.push(...includeIds.map((id) => `count of labels where (id = ${id}) > 0`));
    }
  }

  if (excludeIds.length > 0) {
    if ((input.excludeLabelMode ?? "exclude_all") === "exclude_any") {
      parts.push(
        `count of labels where (${excludeIds.map((id) => `id = ${id}`).join(" or ")}) = 0`,
      );
    } else {
      parts.push(
        `not (${excludeIds.map((id) => `count of labels where (id = ${id}) > 0`).join(" and ")})`,
      );
    }
  }

  return parts;
}

export function catQueueHasServerSideFilter(input: {
  search?: string | null;
  queueFilter?: string | null;
  queueFilterQualifier?: string | null;
  advancedFilter?: ContentEditorAdvancedQueueFilter | null;
}) {
  return Boolean(
    input.search?.trim() ||
    (input.queueFilter && input.queueFilter !== "all") ||
    input.queueFilterQualifier ||
    (input.advancedFilter && !isCatQueueFilterEmpty(input.advancedFilter)),
  );
}

export type ContentEditorCatLabel = {
  id: string;
  title: string;
};
