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
import { createContentEditorRequestScheduler } from "@/components/content-editor/shared/content-editor-request-scheduler";
import { z } from "zod";

import type { ContentEditorFormatMessageIntl } from "@/components/content-editor/message-format/content-editor-message-format-i18n";
import type {
  ContentEditorFormatCheck,
  ContentEditorFormatCheckCategory,
} from "@/components/content-editor/shared/types";
import { GoSvcClientError, type GoSvcClient } from "@/lib/go-svc/go-svc-client";
import { err, fromThrowableAsync, isErr, ok, type Result } from "@/lib/primitives/result/results";
import { capResolvedSpellcheckWords } from "@/lib/spellcheck-dictionary/normalize-word";

import { projectFileCatValidationMessages } from "./project-file-content-editor-validation.messages";

const scheduleValidation = createContentEditorRequestScheduler(3);

const CAT_FORMAT_CHECK_CATEGORIES = [
  "length",
  "placeholder",
  "icu",
  "syntax",
  "terminology",
  "glossary",
  "qa",
  "spelling",
] as const satisfies readonly ContentEditorFormatCheckCategory[];

const contentEditorFormatCheckSchema = z.object({
  id: z.string(),
  label: z.string(),
  status: z.enum(["pass", "warn", "fail"]),
  message: z.string(),
  category: z.enum(CAT_FORMAT_CHECK_CATEGORIES).optional(),
  relatedTokens: z.array(z.string()).optional(),
});

const contentEditorSegmentValidationResponseSchema = z.object({
  checks: z.array(contentEditorFormatCheckSchema),
  skippedModes: z.array(z.string()).optional(),
});

export const CAT_SEGMENT_SPELLING_MODE = "spelling" as const;

export const CAT_SEGMENT_QA_MODES = [
  "not_localized",
  "whitespace_only",
  "same_as_source",
  "escaped_char_mismatch",
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
// Allows spelling to be disabled without disabling all segment validation.
const CAT_SEGMENT_SPELLING_ENABLED = true;

export type ContentEditorSegmentValidationError =
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
    acceptedWords?: readonly string[];
    signal?: AbortSignal;
    intl: ContentEditorFormatMessageIntl;
  },
  goSvcClient: GoSvcClient,
): Promise<Result<ContentEditorFormatCheck[], ContentEditorSegmentValidationError>> {
  if (!CAT_SEGMENT_VALIDATION_ENABLED) {
    return ok([]);
  }

  const requestFailedMessage = input.intl.formatMessage(
    projectFileCatValidationMessages.requestFailed,
  );
  const targetLocale = input.targetLocale.trim();
  const canRequestSpelling = isBcp47LanguageTag(targetLocale);
  const modes =
    canRequestSpelling && CAT_SEGMENT_SPELLING_ENABLED
      ? CAT_SEGMENT_QA_MODES
      : CAT_SEGMENT_QA_MODES.filter((mode) => mode !== CAT_SEGMENT_SPELLING_MODE);

  const responseResult = await fromThrowableAsync(
    scheduleValidation(
      () =>
        goSvcClient.cat.validateSegment(
          {
            sourceText: input.sourceText,
            targetText: input.targetText,
            sourcePath: input.sourcePath,
            ...(input.maxLength != null && input.maxLength > 0
              ? { maxLength: input.maxLength }
              : {}),
            ...(targetLocale ? { targetLocale } : {}),
            ...(input.acceptedWords && input.acceptedWords.length > 0
              ? { acceptedWords: capResolvedSpellcheckWords(input.acceptedWords) }
              : {}),
            modes,
          },
          { signal: input.signal },
        ),
      input.signal,
    ),
  );

  if (isErr(responseResult)) {
    if (input.signal?.aborted) {
      return err({ code: "aborted" });
    }

    if (responseResult.error instanceof GoSvcClientError) {
      if (responseResult.error.code === "invalid_response") {
        return err({
          code: "invalid_response",
          message: input.intl.formatMessage(projectFileCatValidationMessages.invalidJson),
        });
      }

      if (
        responseResult.error.code === "network_error" ||
        responseResult.error.code === "missing_access_token"
      ) {
        console.warn("[cat-validation] Go service request failed", responseResult.error);
        return err({ code: "service_error", message: requestFailedMessage });
      }
    }

    return err({
      code: "service_error",
      message:
        responseResult.error instanceof Error ? responseResult.error.message : requestFailedMessage,
    });
  }

  const parsed = contentEditorSegmentValidationResponseSchema.safeParse(responseResult.value);
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
