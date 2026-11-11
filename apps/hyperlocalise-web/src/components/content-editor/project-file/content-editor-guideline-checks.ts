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

import type { ContentEditorFormatCheck } from "@/components/content-editor/shared/types";
import type { GoSvcClient } from "@/lib/go-svc/go-svc-client";
import type {
  GuidelineCheckFinding,
  GuidelineCheckResult,
} from "@/lib/go-svc/go-svc-guidelines-api";
import { GoSvcClientError } from "@/lib/go-svc/go-svc-request";

export const EDITOR_GUIDELINE_CHECK_DEBOUNCE_MS = 1_500;
export const GUIDELINE_FORMAT_CHECK_PREFIX = "guideline-";
const GUIDELINE_LIMIT_CHECK_ID = "guideline-limit";

export function isGuidelineFormatCheck(check: ContentEditorFormatCheck) {
  return check.id.startsWith(GUIDELINE_FORMAT_CHECK_PREFIX);
}

/** Keeps live format checks and replaces any previous guideline rows. */
export function mergeGuidelineFormatChecks(
  checks: readonly ContentEditorFormatCheck[],
  guidelineChecks: readonly ContentEditorFormatCheck[],
): ContentEditorFormatCheck[] {
  return [...checks.filter((check) => !isGuidelineFormatCheck(check)), ...guidelineChecks];
}

function guidelineQuote(text: string, start: number, end: number) {
  if (start < 0 || end <= start || end > text.length) {
    return "";
  }
  // An empty model quote is stored as a span of the whole field. That is an
  // omission, so there is no token to highlight.
  if (start === 0 && end === text.length) {
    return "";
  }
  return text.slice(start, end);
}

export function guidelineFormatChecks(input: {
  result: Pick<GuidelineCheckResult, "findings">;
  targetText: string;
  label: string;
}): ContentEditorFormatCheck[] {
  return input.result.findings.flatMap((finding, index) =>
    guidelineFormatCheck(finding, index, input.targetText, input.label),
  );
}

function guidelineFormatCheck(
  finding: GuidelineCheckFinding,
  index: number,
  targetText: string,
  label: string,
): ContentEditorFormatCheck[] {
  if (finding.field !== "target") {
    return [];
  }
  const message = finding.message.trim();
  if (!message) {
    return [];
  }
  const quote = guidelineQuote(targetText, finding.start, finding.end);
  const suggestion = finding.suggestion?.trim() ?? "";
  const relatedTokens = quote ? [quote, ...(suggestion ? [suggestion] : [])] : undefined;
  return [
    {
      id: `${GUIDELINE_FORMAT_CHECK_PREFIX}${index}`,
      label,
      status: "warn",
      category: "qa",
      message: suggestion ? `${message} Suggestion: ${suggestion}` : message,
      ...(relatedTokens ? { relatedTokens } : {}),
    },
  ];
}

export function guidelineLimitFormatCheck(
  label: string,
  message: string,
): ContentEditorFormatCheck {
  return {
    id: GUIDELINE_LIMIT_CHECK_ID,
    label,
    status: "warn",
    category: "qa",
    message,
  };
}

function isAbortError(error: unknown) {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

export async function fetchEditorGuidelineChecks(
  input: {
    organizationSlug: string;
    projectId: string;
    sourceLocale: string;
    sourceText: string;
    targetText: string;
    targetLocale: string;
    segmentId: string;
    label: string;
    limitMessage: string;
    signal?: AbortSignal;
  },
  client: GoSvcClient,
): Promise<ContentEditorFormatCheck[]> {
  const targetText = input.targetText;
  if (!targetText.trim()) {
    return [];
  }

  const label = input.label;
  try {
    const result = await client.guidelines.check(
      input.organizationSlug,
      {
        projectId: input.projectId,
        sourceLocale: input.sourceLocale,
        targetLocale: input.targetLocale,
        checks: ["target"],
        segments: [
          {
            id: input.segmentId,
            source: input.sourceText,
            target: targetText,
          },
        ],
      },
      { signal: input.signal },
    );
    return guidelineFormatChecks({ result, targetText, label });
  } catch (error) {
    if (input.signal?.aborted || isAbortError(error)) {
      throw error;
    }
    if (
      error instanceof GoSvcClientError &&
      (error.status === 402 || error.code === "guideline_check_limit_reached")
    ) {
      return [guidelineLimitFormatCheck(label, input.limitMessage)];
    }
    return [];
  }
}
