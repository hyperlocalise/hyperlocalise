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

import type { HubspotContentClient } from "./client";
import { isHubspotLocaleCopyName } from "./locale";

export type HubspotLibraryItem = {
  id: string;
  name: string;
};

export type HubspotLibrary = {
  emails: HubspotLibraryItem[];
  forms: HubspotLibraryItem[];
  blogPosts: HubspotLibraryItem[];
  landingPages: HubspotLibraryItem[];
  websitePages: HubspotLibraryItem[];
  messageTemplates: HubspotLibraryItem[];
  warnings: string[];
};

type LibraryClient = Pick<
  HubspotContentClient,
  "listEmails" | "listForms" | "listBlogPosts" | "listLandingPages" | "listWebsitePages"
>;

function libraryItem(item: {
  id: string;
  name: string;
  translatedFromId?: string | null;
}): HubspotLibraryItem | null {
  const id = item.id.trim();
  if (!id || item.translatedFromId?.trim() || isHubspotLocaleCopyName(item.name)) {
    return null;
  }
  const name = item.name.trim();
  return { id, name: name || id };
}

function libraryItems(
  items: Array<{ id: string; name: string; translatedFromId?: string | null }>,
): HubspotLibraryItem[] {
  return items.flatMap((item) => {
    const visible = libraryItem(item);
    return visible ? [visible] : [];
  });
}

export async function listHubspotLibrary(client: LibraryClient): Promise<HubspotLibrary> {
  // Forms, blog posts, landing pages, and website pages are temporarily
  // unsupported: skip listing them so they stay out of the picker. Keep the
  // response shape stable.
  const emails = await client.listEmails();

  return {
    emails: libraryItems(emails),
    forms: [],
    blogPosts: [],
    landingPages: [],
    websitePages: [],
    messageTemplates: [],
    warnings: [],
  };
}
