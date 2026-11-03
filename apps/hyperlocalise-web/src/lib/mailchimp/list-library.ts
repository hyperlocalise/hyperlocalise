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

import type { MailchimpClient } from "./client";
import { isMailchimpLocaleCopyName } from "./locale";

export type MailchimpLibraryItem = {
  id: string;
  name: string;
};

export type MailchimpLibrary = {
  campaigns: MailchimpLibraryItem[];
  templates: MailchimpLibraryItem[];
  warnings: string[];
};

function visibleItem(id: string, name: string): MailchimpLibraryItem | null {
  const trimmedId = id.trim();
  const trimmedName = name.trim();
  if (!trimmedId || isMailchimpLocaleCopyName(trimmedName)) {
    return null;
  }
  return { id: trimmedId, name: trimmedName || trimmedId };
}

export async function listMailchimpLibrary(client: MailchimpClient): Promise<MailchimpLibrary> {
  const [campaigns, templates] = await Promise.all([
    client.listRegularCampaigns(),
    client.listUserTemplates(),
  ]);

  return {
    campaigns: campaigns.flatMap((campaign) => {
      const title = campaign.settings.title?.trim() || campaign.settings.subject_line?.trim() || "";
      const item = visibleItem(campaign.id, title);
      return item ? [item] : [];
    }),
    templates: templates.flatMap((template) => {
      const item = visibleItem(String(template.id), template.name);
      return item ? [item] : [];
    }),
    warnings: [],
  };
}
