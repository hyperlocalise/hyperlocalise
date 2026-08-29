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

/**
 * Referring domains flagged as spam / paid-link shops.
 * Google Search Console ignores them only after this file is uploaded.
 */
export const DISAVOW_DOMAINS = [
  "authoritybacklinks.shop",
  "backlinker.shop",
  "backlinksplace.site",
  "backlinkshop.site",
  "buybacklinks.agency",
  "bye.fyi",
  "fiverr-cost-effective-seo.site",
  "linkrankboost.shop",
  "linkrankseo.shop",
  "linkseopro.shop",
  "pbnseolinks.shop",
  "quero.party",
  "rank-top.click",
  "rankboostly.shop",
  "ranklinkpro.shop",
  "ranklinkx.shop",
  "rankxlinks.shop",
  "seoexpress.org",
  "seolinkpro.shop",
] as const;

const DISAVOW_FILE_HEADER = `# Google Search Console disavow file for hyperlocalise.com
# Upload at Search Console > Removals > Disavow links.
# Hosting this file on the site does not apply it. Google only uses the copy you upload.
# These referring domains are paid-link / PBN spam shops.
`;

export function buildDisavowFile(domains: readonly string[] = DISAVOW_DOMAINS): string {
  const uniqueDomains = [...new Set(domains.map((domain) => domain.trim().toLowerCase()))]
    .filter((domain) => domain.length > 0)
    .toSorted((left, right) => left.localeCompare(right));

  const lines = uniqueDomains.map((domain) => `domain:${domain}`);
  return `${DISAVOW_FILE_HEADER}\n${lines.join("\n")}\n`;
}
