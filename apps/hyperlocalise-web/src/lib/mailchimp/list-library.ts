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
import {
  mailchimpTemplateSkipReason,
  summarizeMailchimpUnsupportedTemplates,
} from "./template-importability";

export type MailchimpLibraryItem = {
  id: string;
  name: string;
};

export type MailchimpLibraryUnsupportedItem = MailchimpLibraryItem & {
  reason: string;
};

export type MailchimpLibrary = {
  campaigns: MailchimpLibraryItem[];
  templates: MailchimpLibraryItem[];
  unsupportedTemplates: MailchimpLibraryUnsupportedItem[];
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

  const unsupportedTemplates: MailchimpLibraryUnsupportedItem[] = [];
  const importableTemplates: MailchimpLibraryItem[] = [];

  for (const template of templates) {
    const name = template.name?.trim() || String(template.id);
    const reason = mailchimpTemplateSkipReason(template);
    if (reason) {
      const item = visibleItem(String(template.id), name);
      if (item) {
        unsupportedTemplates.push({ ...item, reason });
      }
      continue;
    }
    const item = visibleItem(String(template.id), name);
    if (item) {
      importableTemplates.push(item);
    }
  }

  return {
    campaigns: campaigns.flatMap((campaign) => {
      const title = campaign.settings.title?.trim() || campaign.settings.subject_line?.trim() || "";
      const item = visibleItem(campaign.id, title);
      return item ? [item] : [];
    }),
    templates: importableTemplates,
    unsupportedTemplates,
    warnings: (() => {
      const summary = summarizeMailchimpUnsupportedTemplates(unsupportedTemplates);
      return summary ? [summary] : [];
    })(),
  };
}
