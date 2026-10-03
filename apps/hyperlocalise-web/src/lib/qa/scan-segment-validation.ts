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
import { createGoSvcServerClient } from "@/lib/go-svc/go-svc-server-client";
import type {
  TranslationQaCheck,
  TranslationQaCheckType,
  TranslationQaSegmentInput,
} from "./types";
import { validateTranslationSegment } from "./validate-segment";

import { QA_MODES } from "./check-catalogue";
import { applyQaPolicy, type QaCheckPolicy } from "./qa-policy";

export const QA_CHECK_VERSION = 2;
const responseSchema = z.object({
  checks: z.array(
    z.object({
      id: z.string(),
      status: z.enum(["pass", "warn", "fail"]),
      message: z.string(),
      category: z.string().optional(),
      relatedTokens: z.array(z.string()).optional(),
    }),
  ),
  skippedModes: z.array(z.string()).optional(),
});
const CHECK_TYPES = {
  "qa-not-localized": "not_localized",
  "qa-whitespace-only": "whitespace_only",
  "qa-same-as-source": "same_as_source",
  "qa-escaped-char-mismatch": "escaped_char_mismatch",
  "qa-numbers-mismatch": "numbers_mismatch",
  "qa-punctuation-mismatch": "punctuation_mismatch",
  "qa-character-case-mismatch": "character_case_mismatch",
  length: "length",
} as const;

/** Use exactly the editor's Go format, QA and spelling engine, plus its glossary validator. */
export async function validateScanSegment(
  input: TranslationQaSegmentInput,
  acceptedWords: string[] = [],
  policy: QaCheckPolicy,
) {
  const response = await createGoSvcServerClient().qaReport.validateSegment(
    {
      sourceText: input.sourceText,
      targetText: input.targetText,
      sourcePath: input.sourcePath ?? "",
      targetLocale: input.targetLocale,
      maxLength: input.maxLength ?? 0,
      modes: QA_MODES.filter((mode) => policy[mode].enabled),
      acceptedWords,
    },
    { signal: AbortSignal.timeout(30_000) },
  );
  const parsed = responseSchema.safeParse(response);
  if (!parsed.success) throw new Error("QA validation service returned an invalid response.");
  const checks: TranslationQaCheck[] = parsed.data.checks
    .filter((check) => check.status !== "pass")
    .map((check) => ({
      checkType: scanCheckType(check),
      severity: check.status === "fail" ? "error" : "warning",
      category: scanCheckCategory(check),
      message: check.message,
      relatedTokens: check.relatedTokens ?? [],
    }));
  const goReportedPlaceholder = checks.some((check) => check.checkType === "placeholder_mismatch");
  checks.push(
    ...validateTranslationSegment(input).filter((check) => {
      if (check.checkType === "glossary_violation") return true;
      // Go's placeholder failures are the primary result. Keep the TypeScript
      // check when Go did not report one, so disabling format cannot drop it.
      return check.checkType === "placeholder_mismatch" && !goReportedPlaceholder;
    }),
  );
  return { checks: applyQaPolicy(checks, policy), skippedChecks: parsed.data.skippedModes ?? [] };
}

function scanCheckType(check: { id: string; category?: string }): TranslationQaCheckType {
  const known = CHECK_TYPES[check.id as keyof typeof CHECK_TYPES];
  if (known) return known;
  if (check.category === "spelling") return "spelling";
  if (check.category === "placeholder") return "placeholder_mismatch";
  return "format";
}

function scanCheckCategory(check: { category?: string }): TranslationQaCheck["category"] {
  if (check.category === "spelling") return "spelling";
  if (check.category === "length") return "length";
  if (check.category === "qa") return "qa";
  if (check.category === "placeholder") return "placeholder";
  return "syntax";
}
