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

import { autumnFeatureIds, type AutumnFeatureId } from "@/lib/billing/autumn-ids";
import { getAutumnSecretKey } from "@/lib/billing/autumn-config";

const AUTUMN_API_VERSION = "2.2.0";

export type AutumnBooleanFeatureId = Extract<
  AutumnFeatureId,
  typeof autumnFeatureIds.automationWorkflow | typeof autumnFeatureIds.queriesBoard
>;

/**
 * Fail-closed Autumn boolean entitlement check for plan-gated product surfaces.
 *
 * Tests skip the remote check when `autumnApiKey` is omitted so existing fixtures
 * keep working. Pass `autumnApiKey: ""` to exercise the denied path without mocking.
 */
export async function isAutumnBooleanFeatureEnabled(input: {
  organizationId: string;
  featureId: AutumnBooleanFeatureId;
  autumnApiKey?: string;
}): Promise<boolean> {
  if (process.env.NODE_ENV === "test" && input.autumnApiKey === undefined) {
    return true;
  }

  const autumnApiKey = input.autumnApiKey ?? getAutumnSecretKey();
  if (!autumnApiKey) {
    return false;
  }

  try {
    const autumn = new Autumn({
      secretKey: autumnApiKey,
      xApiVersion: AUTUMN_API_VERSION,
      failOpen: false,
    });
    const response = await autumn.check({
      customerId: input.organizationId,
      featureId: input.featureId,
    });

    return response.allowed === true;
  } catch {
    return false;
  }
}
