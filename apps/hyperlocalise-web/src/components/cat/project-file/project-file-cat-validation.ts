import { z } from "zod";

import type { CatFormatCheck } from "@/components/cat/shared/types";
import { readApiError } from "@/lib/api-error";
import { err, fromThrowableAsync, isErr, ok, type Result } from "@/lib/primitives/result/results";

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
  },
  fetcher: typeof fetch = fetch,
): Promise<Result<CatFormatCheck[], CatSegmentValidationError>> {
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
        maxLength: input.maxLength ?? 0,
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
        responseResult.error instanceof Error
          ? responseResult.error.message
          : "Segment validation request failed.",
    });
  }

  const response = responseResult.value;
  if (!response.ok) {
    return err({
      code: "service_error",
      message: await readApiError(response, "Segment validation request failed"),
    });
  }

  const bodyResult = await fromThrowableAsync(response.json());
  if (isErr(bodyResult)) {
    return err({
      code: "invalid_response",
      message: "Segment validation returned invalid JSON.",
    });
  }

  const parsed = catSegmentValidationResponseSchema.safeParse(bodyResult.value);
  if (!parsed.success) {
    return err({
      code: "invalid_response",
      message: "Segment validation returned an invalid response.",
    });
  }

  return ok(parsed.data.checks);
}
