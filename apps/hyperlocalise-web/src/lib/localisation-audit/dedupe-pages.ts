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
import type { AuditedPage } from "./types";

export function dedupeAuditedPages(pages: AuditedPage[]): AuditedPage[] {
  const seenUrls = new Set<string>();

  return pages.filter((page) => {
    if (seenUrls.has(page.url)) {
      return false;
    }
    seenUrls.add(page.url);
    return true;
  });
}
