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
import type { IntlShape, MessageDescriptor } from "react-intl";

import type {
  IssueSheetIssueType,
  IssueSheetPriority,
  IssueSheetTemplateKey,
} from "@/api/routes/project/issue-sheet.schema";

import { issueSheetTemplateMessages as messages } from "./issue-sheet-templates.messages";

type IssueSheetTemplateCatalogEntry = {
  issueType: IssueSheetIssueType | null;
  defaultPriority: IssueSheetPriority;
  label: MessageDescriptor;
  headings: readonly MessageDescriptor[];
};

/**
 * Static issue template catalog. Deliberately code, not a database table: the acceptance criteria
 * ask admins to pick a default and users to swap/remove a template, never to author, rename, or
 * delete one. `issueType` is nullable so a future template can decline to assert a type (none of
 * the current five do); when null, applying the template leaves the issue's type as-is.
 *
 * Single source of truth: adding a template means adding one entry here. The `Record` type
 * requires every `IssueSheetTemplateKey` to have a complete entry (including label and
 * headings), so a missing or incomplete template is a compile error, not a runtime fallback
 * split across separate switch statements.
 */
const issueSheetTemplateCatalog: Record<IssueSheetTemplateKey, IssueSheetTemplateCatalogEntry> = {
  tpl_translation_mistake: {
    issueType: "translation_mistake",
    defaultPriority: "P1",
    label: messages.translationMistakeLabel,
    headings: [
      messages.translationMistakeHeadingCurrent,
      messages.translationMistakeHeadingSuggested,
      messages.translationMistakeHeadingWhatIsWrong,
    ],
  },
  tpl_source_mistake: {
    issueType: "source_mistake",
    defaultPriority: "P1",
    label: messages.sourceMistakeLabel,
    headings: [
      messages.sourceMistakeHeadingSourceText,
      messages.sourceMistakeHeadingWhatIsWrong,
      messages.sourceMistakeHeadingSuggestedCorrection,
      messages.sourceMistakeHeadingLocalesTranslated,
    ],
  },
  tpl_context_request: {
    issueType: "context_request",
    // P2, matching CAT's existing setPriority("P2") default exactly, so preselecting this
    // template from CAT is behavior-preserving.
    defaultPriority: "P2",
    label: messages.contextRequestLabel,
    headings: [
      messages.contextRequestHeadingAmbiguous,
      messages.contextRequestHeadingNeeded,
      messages.contextRequestHeadingWhereAppears,
    ],
  },
  tpl_glossary_violation: {
    issueType: "glossary_violation",
    defaultPriority: "P2",
    label: messages.glossaryViolationLabel,
    headings: [
      messages.glossaryViolationHeadingApprovedTerm,
      messages.glossaryViolationHeadingTermUsed,
      messages.glossaryViolationHeadingWhereDefined,
    ],
  },
  tpl_qa_failure: {
    issueType: "qa_failure",
    defaultPriority: "P1",
    label: messages.qaFailureLabel,
    headings: [
      messages.qaFailureHeadingWhichCheck,
      messages.qaFailureHeadingExpected,
      messages.qaFailureHeadingActual,
      messages.qaFailureHeadingReproduce,
    ],
  },
};

export type IssueSheetTemplateDefinition = {
  key: IssueSheetTemplateKey;
  issueType: IssueSheetIssueType | null;
  defaultPriority: IssueSheetPriority;
};

// Derived once from the catalog above, in catalog (insertion) order, for call sites that want a
// plain list (the template picker, the settings panel). findIssueSheetTemplate searches this same
// array, so callers get back the identical element reference, not a fresh object per lookup.
export const issueSheetTemplates: readonly IssueSheetTemplateDefinition[] = (
  Object.keys(issueSheetTemplateCatalog) as IssueSheetTemplateKey[]
).map((key) => {
  const entry = issueSheetTemplateCatalog[key];
  return { key, issueType: entry.issueType, defaultPriority: entry.defaultPriority };
});

export function findIssueSheetTemplate(
  key: string | null | undefined,
): IssueSheetTemplateDefinition | undefined {
  if (!key) {
    return undefined;
  }
  return issueSheetTemplates.find((template) => template.key === key);
}

function formatUnknownTemplateLabel(key: string) {
  return key
    .replace(/^tpl_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/** Renders a template's display label. Falls back for unknown/removed keys on old issues. */
export function issueSheetTemplateLabel(intl: IntlShape, key: string) {
  const entry = issueSheetTemplateCatalog[key as IssueSheetTemplateKey];
  return entry ? intl.formatMessage(entry.label) : formatUnknownTemplateLabel(key);
}

/**
 * Renders a template's prefilled description skeleton by composing its heading messages into
 * markdown. Headings only by design — never parsed back out of the issue body; `template_key` is
 * the only machine-readable provenance, since the skeleton itself is localized per author.
 */
export function issueSheetTemplateSkeleton(intl: IntlShape, key: IssueSheetTemplateKey) {
  const { headings } = issueSheetTemplateCatalog[key];
  return `${headings.map((descriptor) => `## ${intl.formatMessage(descriptor)}`).join("\n\n")}\n`;
}

export { issueSheetTemplateMessages } from "./issue-sheet-templates.messages";
