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

import { GSC_PERMISSION_UNVERIFIED } from "./constants";
import type { GscSite } from "./types";

function normalizeDomainKey(domainKey: string) {
  return domainKey.trim().toLowerCase().replace(/^www\./, "");
}

function isQueryable(site: GscSite) {
  return site.permissionLevel !== GSC_PERMISSION_UNVERIFIED;
}

export function matchSearchConsoleSite(sites: GscSite[], domainKey: string): GscSite | null {
  const key = normalizeDomainKey(domainKey);
  if (!key) {
    return null;
  }

  const queryable = sites.filter(isQueryable);
  const exactCandidates = [
    `sc-domain:${key}`,
    `sc-domain:www.${key}`,
    `https://${key}/`,
    `https://www.${key}/`,
    `http://${key}/`,
    `http://www.${key}/`,
  ];

  for (const candidate of exactCandidates) {
    const match = queryable.find((site) => site.siteUrl.toLowerCase() === candidate);
    if (match) {
      return match;
    }
  }

  return (
    queryable.find((site) => {
      const url = site.siteUrl.toLowerCase();
      return url.includes(`sc-domain:${key}`) || url.includes(`://${key}`) || url.includes(`://www.${key}`);
    }) ?? null
  );
}
