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
  ContentEditorFormatCheck,
  ContentEditorFormatCheckStatus,
} from "@/components/content-editor/shared/types";

const SUGGESTIONS_SUFFIX_RE = /\s*Suggestions?:\s*.+$/i;
const SUGGESTIONS_CAPTURE_RE = /Suggestions?:\s*(.+?)\.?$/i;
const SPELLING_CHECK_ID_RE = /^(spelling|spelling-.+)$/;
const GLOSSARY_MISSING_CHECK_ID_RE = /^glossary-missing-/;

/** Spelling and missing glossary terms store [problem, replacement, ...]. Other checks list offenders. */
function hasQaReplacementSemantics(check: ContentEditorFormatCheck) {
  return (
    check.category === "spelling" ||
    SPELLING_CHECK_ID_RE.test(check.id) ||
    GLOSSARY_MISSING_CHECK_ID_RE.test(check.id)
  );
}

export function actionableFormatChecks(checks: readonly ContentEditorFormatCheck[]) {
  return checks.filter((check) => check.status !== "pass");
}

export function worstActionableFormatCheckStatus(
  checks: readonly ContentEditorFormatCheck[],
): "warn" | "fail" | null {
  let worst: "warn" | "fail" | null = null;
  for (const check of checks) {
    if (check.status === "fail") {
      return "fail";
    }
    if (check.status === "warn") {
      worst = "warn";
    }
  }
  return worst;
}

export function presentQaIssue(check: ContentEditorFormatCheck): {
  label: string;
  message: string;
  problemToken?: string;
  suggestion?: string;
  status: ContentEditorFormatCheckStatus;
} {
  const related = check.relatedTokens ?? [];
  const problemToken = related[0] || undefined;
  let suggestion: string | undefined;
  if (hasQaReplacementSemantics(check)) {
    suggestion = related[1] || undefined;
    if (!suggestion) {
      const match = check.message.match(SUGGESTIONS_CAPTURE_RE);
      const firstSuggestion = match?.[1]?.split(",")[0]?.trim();
      if (firstSuggestion) {
        suggestion = firstSuggestion;
      }
    }
  }

  return {
    label: check.label,
    message: check.message.replace(SUGGESTIONS_SUFFIX_RE, "").replace(/\.\s*$/, ""),
    problemToken,
    suggestion,
    status: check.status,
  };
}

export function applyQaSuggestion(text: string, problemToken: string, suggestion: string) {
  const index = text.indexOf(problemToken);
  if (index < 0) {
    return text;
  }
  return `${text.slice(0, index)}${suggestion}${text.slice(index + problemToken.length)}`;
}

export function qaHighlightTokens(check: ContentEditorFormatCheck | undefined, text: string) {
  const problemToken = check ? presentQaIssue(check).problemToken : undefined;
  if (!problemToken || !text.includes(problemToken)) {
    return [];
  }
  return [problemToken];
}
