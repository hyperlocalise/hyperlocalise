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

import { createHubspotContentClient, type HubspotContentClient } from "./client";
import { loadHubspotPipesAccessToken, resolveHubspotPipesWorkosUserId } from "./pipes";
import type { HubspotSettingsError } from "./types";

export async function loadHubspotAutomationClient(input: {
  localOrganizationId: string;
  workosUserId?: string | null;
  localUserId?: string | null;
}): Promise<Result<{ client: HubspotContentClient; workosUserId: string }, HubspotSettingsError>> {
  const workosUserId = await resolveHubspotPipesWorkosUserId({
    workosUserId: input.workosUserId,
    localUserId: input.localUserId,
  });
  if (!workosUserId) {
    return err({
      code: "hubspot_not_connected",
      message: "Connect HubSpot in Integrations before using it.",
    });
  }

  const accessToken = await loadHubspotPipesAccessToken({
    localOrganizationId: input.localOrganizationId,
    workosUserId,
  });
  if (isErr(accessToken)) {
    return accessToken;
  }

  return ok({
    workosUserId,
    client: createHubspotContentClient(accessToken.value),
  });
}
