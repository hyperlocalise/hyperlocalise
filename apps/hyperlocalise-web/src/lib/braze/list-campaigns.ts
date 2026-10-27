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
import { isErr, ok, type Result } from "@/lib/primitives/result/results";

import { listAllBrazeCampaigns, listAllBrazeCanvases } from "./client";
import { loadBrazeAutomationClient } from "./credentials";
import type { BrazeSettingsError } from "./types";

export type BrazeCampaignPickerItem = { id: string; name: string };

export async function listBrazeCampaignsForPicker(input: {
  localOrganizationId: string;
  workosUserId: string;
}): Promise<
  Result<
    {
      campaigns: BrazeCampaignPickerItem[];
      canvases: BrazeCampaignPickerItem[];
    },
    BrazeSettingsError
  >
> {
  const loaded = await loadBrazeAutomationClient({
    localOrganizationId: input.localOrganizationId,
    workosUserId: input.workosUserId,
  });
  if (isErr(loaded)) {
    return loaded;
  }

  const [campaigns, canvases] = await Promise.all([
    listAllBrazeCampaigns(loaded.value.client),
    listAllBrazeCanvases(loaded.value.client),
  ]);

  return ok({
    campaigns: campaigns
      .filter((item) => item.id.trim().length > 0)
      .map((item) => ({ id: item.id, name: item.name || item.id })),
    canvases: canvases
      .filter((item) => item.id.trim().length > 0)
      .map((item) => ({ id: item.id, name: item.name || item.id })),
  });
}
