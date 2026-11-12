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
import { resolveWorkspaceKnowledgeFlag } from "@/lib/flags/workspace-flags";
import { createGoSvcServerClient } from "@/lib/go-svc/go-svc-server-client";
import type { GuidelineCheckFinding } from "@/lib/go-svc/go-svc-guidelines-api";
import { GoSvcClientError } from "@/lib/go-svc/go-svc-request";
import { createLogger } from "@/lib/log";

import type { QaCheckPolicy } from "./qa-policy";
import type { TranslationQaCheck, TranslationQaSeverity } from "./types";

export const GUIDELINE_CHECK_MAX_SEGMENTS = 50;
export const GUIDELINE_CHECK_MAX_RUNES = 16_000;

const logger = createLogger("translation-qa-scan-guidelines");

const HALT_CODES = new Set([
  "guideline_check_limit_reached",
  "guideline_check_failed",
  "guideline_check_unavailable",
  "guideline_check_mandatory_too_large",
]);

export type ScanGuidelineSegment = {
  translationKeyId: string;
  key: string;
  sourceText: string;
  targetText: string;
  targetLocale: string;
  translationId: string | null;
  sourcePath: string | null;
};

export type ScanGuidelineFindingRow = {
  segment: ScanGuidelineSegment;
  check: TranslationQaCheck;
};

export type ScanGuidelineBatchResult = {
  ok: boolean;
  findings: ScanGuidelineFindingRow[];
  haltCode?: string;
};

function utf16Len(text: string) {
  let n = 0;
  for (const r of text) {
    const code = r.codePointAt(0)!;
    n += code > 0xffff ? 2 : 1;
  }
  return n;
}

function runeCount(text: string) {
  let count = 0;
  for (const _ of text) {
    count += 1;
  }
  return count;
}

function segmentRuneCount(segment: Pick<ScanGuidelineSegment, "sourceText" | "targetText">) {
  return runeCount(segment.sourceText) + runeCount(segment.targetText);
}

function guidelineQuote(text: string, start: number, end: number) {
  let pos = 0;
  let startIndex = -1;
  let endIndex = -1;
  for (let i = 0; i < text.length;) {
    const codePoint = text.codePointAt(i)!;
    const width = codePoint > 0xffff ? 2 : 1;
    if (pos === start) {
      startIndex = i;
    }
    const next = pos + width;
    if (startIndex >= 0 && next >= end) {
      endIndex = i + (codePoint > 0xffff ? 2 : 1);
      break;
    }
    i += codePoint > 0xffff ? 2 : 1;
    pos = next;
  }
  if (startIndex < 0 || endIndex < 0) {
    return "";
  }
  if (start === 0 && end === utf16Len(text)) {
    return "";
  }
  return text.slice(startIndex, endIndex);
}

export function mapGuidelineFindingToQaCheck(
  finding: GuidelineCheckFinding,
  targetText: string,
  severity: TranslationQaSeverity,
): TranslationQaCheck | null {
  if (finding.field !== "target") {
    return null;
  }
  const message = finding.message.trim();
  if (!message) {
    return null;
  }
  const suggestion = finding.suggestion?.trim() ?? "";
  const quote = guidelineQuote(targetText, finding.start, finding.end);
  const relatedTokens = quote
    ? [quote, ...(suggestion ? [suggestion] : [])]
    : suggestion
      ? [suggestion]
      : [];
  return {
    checkType: "guideline",
    severity,
    category: "qa",
    message: suggestion ? `${message} Suggestion: ${suggestion}` : message,
    relatedTokens,
  };
}

function buildBatches(
  segments: ScanGuidelineSegment[],
): Array<{ targetLocale: string; segments: ScanGuidelineSegment[] }> {
  const byLocale = new Map<string, ScanGuidelineSegment[]>();
  for (const segment of segments) {
    if (!segment.targetText.trim()) {
      continue;
    }
    const list = byLocale.get(segment.targetLocale) ?? [];
    list.push(segment);
    byLocale.set(segment.targetLocale, list);
  }
  const batches: Array<{ targetLocale: string; segments: ScanGuidelineSegment[] }> = [];
  for (const [targetLocale, localeSegments] of byLocale) {
    let current: ScanGuidelineSegment[] = [];
    let runes = 0;
    for (const segment of localeSegments) {
      const segRunes = segmentRuneCount(segment);
      if (
        current.length > 0 &&
        (current.length >= GUIDELINE_CHECK_MAX_SEGMENTS ||
          runes + segRunes > GUIDELINE_CHECK_MAX_RUNES)
      ) {
        batches.push({ targetLocale, segments: current });
        current = [];
        runes = 0;
      }
      current.push(segment);
      runes += segRunes;
    }
    if (current.length) {
      batches.push({ targetLocale, segments: current });
    }
  }
  return batches;
}

export async function runScanGuidelineChecks(input: {
  organizationId: string;
  projectId: string;
  sourceLocale: string;
  segments: ScanGuidelineSegment[];
  policy: QaCheckPolicy;
  alreadyHalted?: boolean;
  onBatchComplete?: () => Promise<void>;
}): Promise<ScanGuidelineBatchResult> {
  const severity = input.policy.guideline.severity;
  const findings: ScanGuidelineFindingRow[] = [];

  if (!input.policy.guideline.enabled || input.alreadyHalted) {
    return { ok: true, findings };
  }

  if (!(await resolveWorkspaceKnowledgeFlag({ organizationId: input.organizationId }))) {
    return { ok: true, findings };
  }

  const client = createGoSvcServerClient();
  for (const batch of buildBatches(input.segments)) {
    const batchStartedAt = Date.now();
    try {
      const result = await client.guidelines.internalCheck(input.organizationId, {
        projectId: input.projectId,
        sourceLocale: input.sourceLocale,
        targetLocale: batch.targetLocale,
        checks: ["target"],
        segments: batch.segments.map((segment) => ({
          id: segment.translationKeyId,
          source: segment.sourceText,
          target: segment.targetText,
        })),
      });
      const unchecked = new Set(result.uncheckedSegmentIds ?? []);
      let mappedCount = 0;
      for (const segment of batch.segments) {
        if (unchecked.has(segment.translationKeyId)) {
          continue;
        }
        for (const finding of result.findings) {
          if (finding.segmentId !== segment.translationKeyId) {
            continue;
          }
          const mapped = mapGuidelineFindingToQaCheck(finding, segment.targetText, severity);
          if (mapped) {
            findings.push({ segment, check: mapped });
            mappedCount += 1;
          }
        }
      }
      logger.info(
        {
          projectId: input.projectId,
          segmentCount: batch.segments.length,
          mappedFindingCount: mappedCount,
          uncheckedCount: unchecked.size,
          durationMs: Date.now() - batchStartedAt,
        },
        "translation qa scan guideline batch completed",
      );
      if (unchecked.size > 0) {
        return {
          ok: false,
          haltCode: "guideline_check_limit_reached",
          findings,
        };
      }
      await input.onBatchComplete?.();
    } catch (error) {
      const code =
        error instanceof GoSvcClientError && error.code && HALT_CODES.has(error.code)
          ? error.code
          : "guideline_check_failed";
      logger.warn(
        {
          projectId: input.projectId,
          segmentCount: batch.segments.length,
          durationMs: Date.now() - batchStartedAt,
          haltCode: code,
        },
        "translation qa scan guideline batch halted",
      );
      return { ok: false, haltCode: code, findings };
    }
  }

  return { ok: true, findings };
}
