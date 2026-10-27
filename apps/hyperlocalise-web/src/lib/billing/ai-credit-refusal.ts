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
import { ApiResponseError, isApiResponseErrorCode } from "@/lib/api-error";

/** API error code for an AI action refused because the workspace has used all of its AI credit. */
export const AI_CREDIT_EXHAUSTED_CODE = "ai_credit_exhausted";

function readResponseBodyCode(responseBody: string) {
  try {
    const body: unknown = JSON.parse(responseBody);
    return body && typeof body === "object" && "error" in body ? body.error : null;
  } catch {
    return null;
  }
}

/**
 * Whether a failed request was refused for used-up AI credit. Reads the code of an
 * `ApiResponseError`, or the JSON body the AI SDK chat transport keeps on its call errors.
 */
export function isAiCreditExhaustedError(error: unknown): boolean {
  if (error instanceof ApiResponseError) {
    return isApiResponseErrorCode(error, AI_CREDIT_EXHAUSTED_CODE);
  }

  if (
    error &&
    typeof error === "object" &&
    "responseBody" in error &&
    typeof error.responseBody === "string"
  ) {
    return readResponseBodyCode(error.responseBody) === AI_CREDIT_EXHAUSTED_CODE;
  }

  return false;
}
