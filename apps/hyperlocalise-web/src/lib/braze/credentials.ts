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

import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";

import { createBrazeTemplatesClient, type BrazeTemplatesClient } from "./client";
import type { BrazeRestEndpoint } from "./constants";
import { loadBrazePipesApiKey, resolveBrazePipesWorkosUserId } from "./pipes";
import { loadBrazeRestEndpoint } from "./settings";
import type { BrazeSettingsError } from "./types";

export async function loadBrazeAutomationClient(input: {
  localOrganizationId: string;
  workosUserId?: string | null;
  localUserId?: string | null;
}): Promise<
  Result<{ client: BrazeTemplatesClient; restEndpoint: BrazeRestEndpoint }, BrazeSettingsError>
> {
  const workosUserId = await resolveBrazePipesWorkosUserId({
    workosUserId: input.workosUserId,
    localUserId: input.localUserId,
  });
  if (!workosUserId) {
    return err({
      code: "braze_not_connected",
      message: "Connect Braze in Integrations before using it.",
    });
  }

  const apiKey = await loadBrazePipesApiKey({
    localOrganizationId: input.localOrganizationId,
    workosUserId,
  });
  if (isErr(apiKey)) {
    return apiKey;
  }

  const restEndpoint = await loadBrazeRestEndpoint({
    localOrganizationId: input.localOrganizationId,
    workosUserId,
  });
  if (isErr(restEndpoint)) {
    return restEndpoint;
  }

  return ok({
    restEndpoint: restEndpoint.value,
    client: createBrazeTemplatesClient({
      apiKey: apiKey.value,
      restEndpoint: restEndpoint.value,
    }),
  });
}
