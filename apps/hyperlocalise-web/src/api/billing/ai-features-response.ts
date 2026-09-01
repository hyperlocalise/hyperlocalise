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
import {
  AI_FEATURES_CHECK_FAILED_CODE,
  ensureAiFeaturesAllowed,
  type AiFeaturesError,
} from "@/lib/billing/ai-features";
import {
  forbiddenResponse,
  serviceUnavailableResponse,
  type JsonContext,
} from "@/api/response.schema";

export function aiFeaturesErrorResponse(c: JsonContext, error: AiFeaturesError) {
  if (error.code === AI_FEATURES_CHECK_FAILED_CODE) {
    return serviceUnavailableResponse(c, error.code, error.message);
  }

  return forbiddenResponse(c, error.code, error.message);
}

/** Returns an error response when AI features are not allowed; otherwise null. */
export async function rejectIfAiFeaturesUnavailable(c: JsonContext, organizationId: string) {
  const result = await ensureAiFeaturesAllowed({ organizationId });
  if (result.ok) {
    return null;
  }

  return aiFeaturesErrorResponse(c, result.error);
}
