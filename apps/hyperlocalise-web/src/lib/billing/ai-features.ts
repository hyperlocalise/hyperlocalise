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
import { Autumn } from "autumn-js";

import { autumnFeatureIds } from "@/lib/billing/autumn-ids";
import { err, ok, type Result } from "@/lib/primitives/result/results";

export const AI_FEATURES_REQUIRED_CODE = "ai_features_required";
export const AI_FEATURES_CHECK_FAILED_CODE = "ai_features_check_failed";
export const AI_FEATURES_REQUIRED_MESSAGE = "AI features are not included in your current plan.";

export type AiFeaturesError =
  | {
      code: typeof AI_FEATURES_REQUIRED_CODE;
      message: string;
    }
  | {
      code: typeof AI_FEATURES_CHECK_FAILED_CODE;
      message: string;
    };

const AUTUMN_API_VERSION = "2.2.0";

export class AiFeaturesRequiredError extends Error {
  readonly code: AiFeaturesError["code"];

  constructor(error: AiFeaturesError) {
    super(error.message);
    this.name = "AiFeaturesRequiredError";
    this.code = error.code;
  }
}

export function isAiFeaturesError(error: unknown): error is AiFeaturesRequiredError {
  return error instanceof AiFeaturesRequiredError;
}

function formatAiFeaturesCheckError(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Unable to verify AI feature access.";
}

/**
 * Fail-closed boolean gate for Autumn `ai_features` before any model call.
 *
 * Tests skip the remote check when `autumnApiKey` is omitted so existing fixtures
 * keep working. Pass `autumnApiKey: ""` to exercise the denied path without mocking.
 */
export async function ensureAiFeaturesAllowed(input: {
  organizationId: string;
  autumnApiKey?: string;
}): Promise<Result<void, AiFeaturesError>> {
  if (process.env.NODE_ENV === "test" && input.autumnApiKey === undefined) {
    return ok(undefined);
  }

  const { getAutumnSecretKey } = await import("@/lib/billing/autumn-config");
  const autumnApiKey = input.autumnApiKey ?? getAutumnSecretKey();
  if (!autumnApiKey) {
    return err({
      code: AI_FEATURES_REQUIRED_CODE,
      message: AI_FEATURES_REQUIRED_MESSAGE,
    });
  }

  try {
    const autumn = new Autumn({
      secretKey: autumnApiKey,
      xApiVersion: AUTUMN_API_VERSION,
      failOpen: false,
    });
    const response = await autumn.check({
      customerId: input.organizationId,
      featureId: autumnFeatureIds.aiFeatures,
    });

    if (!response.allowed) {
      return err({
        code: AI_FEATURES_REQUIRED_CODE,
        message: AI_FEATURES_REQUIRED_MESSAGE,
      });
    }

    return ok(undefined);
  } catch (error) {
    return err({
      code: AI_FEATURES_CHECK_FAILED_CODE,
      message: formatAiFeaturesCheckError(error),
    });
  }
}
