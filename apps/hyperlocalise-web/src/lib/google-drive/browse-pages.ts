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

import { GOOGLE_DRIVE_MAX_BROWSER_FILES } from "./limits";

export async function loadGoogleDriveBrowsePages<T>(input: {
  fetchPage: (pageToken?: string) => Promise<{
    items: T[];
    nextPageToken: string | null;
  }>;
  maxItems?: number;
}): Promise<T[]> {
  const maxItems = input.maxItems ?? GOOGLE_DRIVE_MAX_BROWSER_FILES;
  const items: T[] = [];
  let pageToken: string | undefined;
  do {
    const page = await input.fetchPage(pageToken);
    items.push(...page.items);
    if (items.length >= maxItems) {
      return items.slice(0, maxItems);
    }
    pageToken = page.nextPageToken ?? undefined;
  } while (pageToken);
  return items;
}
