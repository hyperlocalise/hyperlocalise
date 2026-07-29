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
import type { CatFormatCheck } from "@/components/cat/shared/types";
import { readApiError } from "@/lib/api-error";
import { err, fromThrowableAsync, isErr, ok, type Result } from "@/lib/primitives/result/results";

import { projectFileCatValidationMessages } from "./project-file-cat-validation.messages";

const catFormatCheckSchema = z.object({
  id: z.string(),
  label: z.string(),
  status: z.enum(["pass", "warn", "fail"]),
  message: z.string(),
  category: z
    .enum(["length", "placeholder", "icu", "syntax", "terminology", "glossary", "qa"])
    .optional(),
  relatedTokens: z.array(z.string()).optional(),
});

const catSegmentValidationResponseSchema = z.object({
  checks: z.array(catFormatCheckSchema),
});

export const CAT_SEGMENT_QA_MODES = ["not_localized", "whitespace_only", "same_as_source"] as const;

/** Disabled until go-svc is deployed as a separate service. */
const CAT_SEGMENT_VALIDATION_ENABLED = false;

export type CatSegmentValidationError =
  | { code: "aborted" }
  | { code: "invalid_response"; message: string }
  | { code: "service_error"; message: string };

export async function fetchCatSegmentValidation(
  input: {
    sourceText: string;
    targetText: string;
    sourcePath: string;
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
        modes: CAT_SEGMENT_QA_MODES,
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

  return ok(parsed.data.checks);
}
