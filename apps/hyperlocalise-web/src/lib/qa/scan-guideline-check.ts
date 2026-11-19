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
/** One workflow step checks this many locale batches, then the next step continues. */
export const GUIDELINE_BATCHES_PER_STEP = 4;
const GUIDELINE_CHECK_ATTEMPTS = 3;

const logger = createLogger("translation-qa-scan-guidelines");

const HALT_CODES = new Set([
  "guideline_check_limit_reached",
  "guideline_check_failed",
  "guideline_check_unavailable",
  "guideline_check_mandatory_too_large",
]);

const RETRYABLE_CODES = new Set(["network_error", "guideline_check_limit_check_failed"]);

export type ScanGuidelineSegment = {
  translationKeyId: string;
  key: string;
  sourceText: string;
  targetText: string;
  targetLocale: string;
  translationId: string | null;
  sourcePath: string | null;
};

export type ScanGuidelineBatch = {
  targetLocale: string;
  segments: ScanGuidelineSegment[];
};

export type ScanGuidelineFindingRow = {
  segment: ScanGuidelineSegment;
  check: TranslationQaCheck;
};

export type ScanGuidelineBatchResult = {
  ok: boolean;
  findings: ScanGuidelineFindingRow[];
  haltCode?: string;
  /** Knowledge is off, or the entitlement read failed, so this page did not check. */
  knowledgeSkipped?: boolean;
  /** A segment or batch was skipped. Later batches still run. */
  incomplete?: boolean;
  /** More batches remain after this slice. */
  nextBatchOffset?: number;
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
    ...(finding.passageId ? { passageId: finding.passageId } : {}),
    ...(finding.reasoningAvailable ? { reasoningAvailable: true } : {}),
  };
}

export function planScanGuidelineBatches(segments: ScanGuidelineSegment[]): {
  batches: ScanGuidelineBatch[];
  skippedOversized: boolean;
} {
  const byLocale = new Map<string, ScanGuidelineSegment[]>();
  let skippedOversized = false;
  for (const segment of segments) {
    if (!segment.targetText.trim()) {
      continue;
    }
    if (segmentRuneCount(segment) > GUIDELINE_CHECK_MAX_RUNES) {
      skippedOversized = true;
      continue;
    }
    const list = byLocale.get(segment.targetLocale) ?? [];
    list.push(segment);
    byLocale.set(segment.targetLocale, list);
  }
  const batches: ScanGuidelineBatch[] = [];
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
  return { batches, skippedOversized };
}

function errorCode(error: unknown) {
  return error instanceof GoSvcClientError && error.code ? error.code : "";
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

type BatchAttempt =
  | { kind: "ok"; result: { findings: GuidelineCheckFinding[] } }
  | { kind: "halt"; code: string }
  | { kind: "skip"; code: string };

async function checkBatch(input: {
  client: ReturnType<typeof createGoSvcServerClient>;
  organizationId: string;
  projectId: string;
  sourceLocale: string;
  batch: ScanGuidelineBatch;
}): Promise<BatchAttempt> {
  let lastCode = "guideline_check_failed";
  for (let attempt = 1; attempt <= GUIDELINE_CHECK_ATTEMPTS; attempt += 1) {
    try {
      const result = await input.client.guidelines.internalCheck(input.organizationId, {
        projectId: input.projectId,
        sourceLocale: input.sourceLocale,
        targetLocale: input.batch.targetLocale,
        checks: ["target"],
        segments: input.batch.segments.map((segment) => ({
          id: segment.translationKeyId,
          source: segment.sourceText,
          target: segment.targetText,
        })),
        autoExplain: false,
      });
      return { kind: "ok", result };
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      const code = errorCode(error);
      lastCode = code || "guideline_check_failed";
      if (HALT_CODES.has(lastCode)) {
        return { kind: "halt", code: lastCode };
      }
      if (RETRYABLE_CODES.has(lastCode) && attempt < GUIDELINE_CHECK_ATTEMPTS) {
        logger.warn(
          {
            projectId: input.projectId,
            segmentCount: input.batch.segments.length,
            errorCode: lastCode,
            attempt,
          },
          "translation qa scan guideline batch retrying",
        );
        continue;
      }
      return { kind: "skip", code: lastCode };
    }
  }
  return { kind: "skip", code: lastCode };
}

export async function runScanGuidelineChecks(input: {
  organizationId: string;
  projectId: string;
  sourceLocale: string;
  segments: ScanGuidelineSegment[];
  policy: QaCheckPolicy;
  alreadyHalted?: boolean;
  batchOffset?: number;
  maxBatches?: number;
  onBatchComplete?: () => Promise<void>;
}): Promise<ScanGuidelineBatchResult> {
  const severity = input.policy.guideline.severity;
  const findings: ScanGuidelineFindingRow[] = [];

  if (!input.policy.guideline.enabled || input.alreadyHalted) {
    return { ok: true, findings };
  }

  if (!(await resolveWorkspaceKnowledgeFlag({ organizationId: input.organizationId }))) {
    return { ok: true, findings, knowledgeSkipped: true };
  }

  const { batches, skippedOversized } = planScanGuidelineBatches(input.segments);
  if (skippedOversized) {
    logger.warn(
      { projectId: input.projectId },
      "translation qa scan skipped a guideline segment over the rune limit",
    );
  }
  const offset = input.batchOffset ?? 0;
  const end = input.maxBatches == null ? batches.length : offset + input.maxBatches;
  const slice = batches.slice(offset, end);
  let incomplete = skippedOversized;
  if (slice.length === 0) {
    return {
      ok: true,
      findings,
      ...(incomplete ? { incomplete: true } : {}),
    };
  }

  const client = createGoSvcServerClient();
  for (const batch of slice) {
    const batchStartedAt = Date.now();
    const attempt = await checkBatch({
      client,
      organizationId: input.organizationId,
      projectId: input.projectId,
      sourceLocale: input.sourceLocale,
      batch,
    });
    if (attempt.kind === "halt") {
      logger.warn(
        {
          projectId: input.projectId,
          segmentCount: batch.segments.length,
          durationMs: Date.now() - batchStartedAt,
          haltCode: attempt.code,
        },
        "translation qa scan guideline batch halted",
      );
      return {
        ok: false,
        haltCode: attempt.code,
        findings,
        ...(incomplete ? { incomplete: true } : {}),
      };
    }
    if (attempt.kind === "skip") {
      incomplete = true;
      logger.warn(
        {
          projectId: input.projectId,
          segmentCount: batch.segments.length,
          durationMs: Date.now() - batchStartedAt,
          errorCode: attempt.code,
        },
        "translation qa scan guideline batch skipped",
      );
      continue;
    }
    let mappedCount = 0;
    for (const segment of batch.segments) {
      for (const finding of attempt.result.findings) {
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
        durationMs: Date.now() - batchStartedAt,
      },
      "translation qa scan guideline batch completed",
    );
    await input.onBatchComplete?.();
  }

  const nextBatchOffset = end < batches.length ? end : undefined;
  return {
    ok: true,
    findings,
    ...(incomplete ? { incomplete: true } : {}),
    ...(nextBatchOffset != null ? { nextBatchOffset } : {}),
  };
}
