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

import type { IterableRegion } from "./constants";
import { createIterableClient, type IterableClient } from "./client";
import { loadIterablePipesApiKey, resolveIterablePipesWorkosUserId } from "./pipes";
import { loadIterableRegion } from "./settings";
import type { IterableSettingsError } from "./types";

export type IterableAutomationClient = {
  client: IterableClient;
  region: IterableRegion;
};

export async function loadIterableAutomationClient(input: {
  localOrganizationId: string;
  workosUserId?: string | null;
  localUserId?: string | null;
}): Promise<Result<IterableAutomationClient, IterableSettingsError>> {
  const workosUserId = await resolveIterablePipesWorkosUserId({
    workosUserId: input.workosUserId,
    localUserId: input.localUserId,
  });
  if (!workosUserId) {
    return err({
      code: "iterable_not_connected",
      message: "Connect Iterable in Integrations before using it.",
    });
  }

  const apiKey = await loadIterablePipesApiKey({
    localOrganizationId: input.localOrganizationId,
    workosUserId,
  });
  if (isErr(apiKey)) {
    return apiKey;
  }

  const region = await loadIterableRegion({
    localOrganizationId: input.localOrganizationId,
    workosUserId,
  });
  if (isErr(region)) {
    return region;
  }

  return ok({
    client: createIterableClient({ apiKey: apiKey.value, region: region.value }),
    region: region.value,
  });
}
