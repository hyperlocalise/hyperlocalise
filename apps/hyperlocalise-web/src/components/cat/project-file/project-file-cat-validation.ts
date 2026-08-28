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

import type { CatFormatMessageIntl } from "@/components/cat/message-format/cat-message-format-i18n";
import type { CatFormatCheck, CatFormatCheckCategory } from "@/components/cat/shared/types";
import { readApiError } from "@/lib/api-error";
import { err, fromThrowableAsync, isErr, ok, type Result } from "@/lib/primitives/result/results";

import { projectFileCatValidationMessages } from "./project-file-cat-validation.messages";

const CAT_FORMAT_CHECK_CATEGORIES = [
  "length",
  "placeholder",
  "icu",
  "syntax",
  "terminology",
  "glossary",
  "qa",
  "spelling",
] as const satisfies readonly CatFormatCheckCategory[];

const catFormatCheckSchema = z.object({
  id: z.string(),
  label: z.string(),
  status: z.enum(["pass", "warn", "fail"]),
  message: z.string(),
  category: z.enum(CAT_FORMAT_CHECK_CATEGORIES).optional(),
  relatedTokens: z.array(z.string()).optional(),
});

const catSegmentValidationResponseSchema = z.object({
  checks: z.array(catFormatCheckSchema),
  skippedModes: z.array(z.string()).optional(),
});

export const CAT_SEGMENT_SPELLING_MODE = "spelling" as const;

export const CAT_SEGMENT_QA_MODES = [
  "not_localized",
  "whitespace_only",
  "same_as_source",
  CAT_SEGMENT_SPELLING_MODE,
] as const;

export function isBcp47LanguageTag(value: string): boolean {
  if (!value) {
    return false;
  }

  try {
    Intl.getCanonicalLocales(value);
    return true;
  } catch {
    return false;
  }
}

const CAT_SEGMENT_VALIDATION_ENABLED = true;

export type CatSegmentValidationError =
  | { code: "aborted" }
  | { code: "invalid_response"; message: string }
  | { code: "service_error"; message: string };

export async function fetchCatSegmentValidation(
  input: {
    sourceText: string;
    targetText: string;
    sourcePath: string;
    targetLocale: string;
    maxLength?: number;
    signal?: AbortSignal;
    intl: CatFormatMessageIntl;
  },
  fetcher: typeof fetch = fetch,
): Promise<Result<CatFormatCheck[], CatSegmentValidationError>> {
  if (!CAT_SEGMENT_VALIDATION_ENABLED) {
    return ok([]);
  }

  const requestFailedMessage = input.intl.formatMessage(
    projectFileCatValidationMessages.requestFailed,
  );
  const targetLocale = input.targetLocale.trim();
  const canRequestSpelling = isBcp47LanguageTag(targetLocale);
  const modes = canRequestSpelling
    ? CAT_SEGMENT_QA_MODES
    : CAT_SEGMENT_QA_MODES.filter((mode) => mode !== CAT_SEGMENT_SPELLING_MODE);

  const responseResult = await fromThrowableAsync(
    fetcher("/api/go-svc/v1/validate/segment", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sourceText: input.sourceText,
        targetText: input.targetText,
        sourcePath: input.sourcePath,
        ...(input.maxLength != null && input.maxLength > 0 ? { maxLength: input.maxLength } : {}),
        ...(targetLocale ? { targetLocale } : {}),
        modes,
      }),
      signal: input.signal,
    }),
  );

  if (isErr(responseResult)) {
    if (input.signal?.aborted) {
      return err({ code: "aborted" });
    }

    return err({
      code: "service_error",
      message:
        responseResult.error instanceof Error ? responseResult.error.message : requestFailedMessage,
    });
  }

  const response = responseResult.value;
  if (!response.ok) {
    return err({
      code: "service_error",
      message: await readApiError(response, requestFailedMessage),
    });
  }

  const bodyResult = await fromThrowableAsync(response.json());
  if (isErr(bodyResult)) {
    return err({
      code: "invalid_response",
      message: input.intl.formatMessage(projectFileCatValidationMessages.invalidJson),
    });
  }

  const parsed = catSegmentValidationResponseSchema.safeParse(bodyResult.value);
  if (!parsed.success) {
    return err({
      code: "invalid_response",
      message: input.intl.formatMessage(projectFileCatValidationMessages.invalidResponse),
    });
  }

  const skippedModes = new Set(parsed.data.skippedModes ?? []);
  const checks = parsed.data.checks.filter(
    (check) => !(skippedModes.has(CAT_SEGMENT_SPELLING_MODE) && check.category === "spelling"),
  );

  return ok(checks);
}
