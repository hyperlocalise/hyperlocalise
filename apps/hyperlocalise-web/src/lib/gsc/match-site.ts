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

type ParsedSearchConsoleSite = { kind: "domain"; host: string } | { kind: "url"; host: string };

function normalizeHost(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^www\./, "");
}

function parseSearchConsoleSiteUrl(siteUrl: string): ParsedSearchConsoleSite | null {
  const trimmed = siteUrl.trim();
  const domainPrefix = "sc-domain:";
  if (trimmed.toLowerCase().startsWith(domainPrefix)) {
    const host = normalizeHost(trimmed.slice(domainPrefix.length));
    return host ? { kind: "domain", host } : null;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    const host = normalizeHost(parsed.hostname);
    return host ? { kind: "url", host } : null;
  } catch {
    return null;
  }
}

function isQueryable(site: GscSite) {
  return site.permissionLevel !== GSC_PERMISSION_UNVERIFIED;
}

function isCoveredByDomainProperty(domainKey: string, propertyHost: string) {
  return domainKey === propertyHost || domainKey.endsWith(`.${propertyHost}`);
}

export function matchSearchConsoleSite(sites: GscSite[], domainKey: string): GscSite | null {
  const key = normalizeHost(domainKey);
  if (!key) {
    return null;
  }

  const queryable = sites
    .filter(isQueryable)
    .map((site) => ({ site, parsed: parseSearchConsoleSiteUrl(site.siteUrl) }))
    .filter(
      (entry): entry is { site: GscSite; parsed: ParsedSearchConsoleSite } => entry.parsed !== null,
    );

  const domainExact = queryable.find(
    (entry) => entry.parsed.kind === "domain" && entry.parsed.host === key,
  );
  if (domainExact) {
    return domainExact.site;
  }

  const urlExact = queryable.find(
    (entry) => entry.parsed.kind === "url" && entry.parsed.host === key,
  );
  if (urlExact) {
    return urlExact.site;
  }

  const domainCovering = queryable.find(
    (entry) => entry.parsed.kind === "domain" && isCoveredByDomainProperty(key, entry.parsed.host),
  );
  return domainCovering?.site ?? null;
}
