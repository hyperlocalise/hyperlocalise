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

import { AI_CREDIT_EXHAUSTED_CODE } from "@/lib/billing/ai-credit-refusal";
import { autumnFeatureIds } from "@/lib/billing/autumn-ids";
import { err, ok, type Result } from "@/lib/primitives/result/results";

export const AI_FEATURES_REQUIRED_CODE = "ai_features_required";
export const AI_FEATURES_CHECK_FAILED_CODE = "ai_features_check_failed";
export const AI_FEATURES_REQUIRED_MESSAGE = "AI features are not included in your current plan.";
export { AI_CREDIT_EXHAUSTED_CODE };
export const AI_CREDIT_EXHAUSTED_MESSAGE =
  "Your workspace has used all of its AI credit. Change your plan on the Billing page, or wait for your AI credit to renew.";

export type AiFeaturesError =
  | {
      code: typeof AI_FEATURES_REQUIRED_CODE;
      message: string;
    }
  | {
      code: typeof AI_FEATURES_CHECK_FAILED_CODE;
      message: string;
    }
  | {
      code: typeof AI_CREDIT_EXHAUSTED_CODE;
      message: string;
    };

const AUTUMN_API_VERSION = "2.2.0";

/**
 * Smallest AI credit balance (USD) that still allows a call. Without it Autumn
 * asks for a whole unit ($1) and refuses any smaller balance.
 */
const MIN_AI_CREDIT_BALANCE_USD = 0.01;

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

/** Wording for people when the gate refuses; check failures keep the plan wording. */
export function formatAiFeaturesRefusal(error: AiFeaturesError) {
  return error.code === AI_CREDIT_EXHAUSTED_CODE
    ? AI_CREDIT_EXHAUSTED_MESSAGE
    : AI_FEATURES_REQUIRED_MESSAGE;
}

/** Workspaces with their own model key pay their provider, so their AI credit is not checked. */
async function hasAiCreditLeft(autumn: Autumn, organizationId: string) {
  const { organizationHasOwnModelKey } =
    await import("@/lib/providers/organization-language-model");
  if (await organizationHasOwnModelKey(organizationId)) {
    return true;
  }

  const response = await autumn.check({
    customerId: organizationId,
    featureId: autumnFeatureIds.aiTokens,
    requiredBalance: MIN_AI_CREDIT_BALANCE_USD,
  });
  return response.allowed;
}

/**
 * Fail-closed gate before any model call: Autumn `ai_features` must be on the
 * plan, and the workspace must have AI credit left unless it uses its own key.
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
    const [aiFeatures, aiCreditLeft] = await Promise.all([
      autumn.check({
        customerId: input.organizationId,
        featureId: autumnFeatureIds.aiFeatures,
      }),
      hasAiCreditLeft(autumn, input.organizationId),
    ]);

    if (!aiFeatures.allowed) {
      return err({
        code: AI_FEATURES_REQUIRED_CODE,
        message: AI_FEATURES_REQUIRED_MESSAGE,
      });
    }

    if (!aiCreditLeft) {
      return err({
        code: AI_CREDIT_EXHAUSTED_CODE,
        message: AI_CREDIT_EXHAUSTED_MESSAGE,
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
