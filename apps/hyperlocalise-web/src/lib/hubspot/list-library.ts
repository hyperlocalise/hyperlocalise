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
  const [emails, forms, blogPosts, landingPages, websitePages] = await Promise.all([
    client.listEmails(),
    client.listForms(),
    client.listBlogPosts(),
    client.listLandingPages(),
    client.listWebsitePages(),
  ]);

  return {
    emails: libraryItems(emails),
    forms: libraryItems(forms),
    blogPosts: libraryItems(blogPosts),
    landingPages: libraryItems(landingPages),
    websitePages: libraryItems(websitePages),
    messageTemplates: [],
    warnings: [],
  };
}
