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
import { normalizeDomainKey } from "./domain-slug";
import { SCHEDULED_LOCALISATION_AUDIT_SITES } from "./scheduled-audit-sites";

export const RELATED_LOCALISATION_AUDIT_SCORE_LIMIT = 3;

export type LocalisationAuditRelatedScore = {
  domainKey: string;
  domainSlug: string;
  score: number;
  companyName: string | null;
  logoUrl: string | null;
};

function domainKeyFromScheduledUrl(url: string): string | null {
  try {
    return normalizeDomainKey(new URL(url).hostname);
  } catch {
    return null;
  }
}

const CATEGORY_BY_DOMAIN_KEY = new Map(
  SCHEDULED_LOCALISATION_AUDIT_SITES.flatMap((site) => {
    const domainKey = domainKeyFromScheduledUrl(site.url);
    return domainKey ? ([[domainKey, site.category]] as const) : [];
  }),
);

export function scheduledLocalisationAuditCategoryForDomainKey(domainKey: string): string | null {
  return CATEGORY_BY_DOMAIN_KEY.get(normalizeDomainKey(domainKey)) ?? null;
}

function scoreProximity(
  a: LocalisationAuditRelatedScore,
  b: LocalisationAuditRelatedScore,
  score: number,
) {
  const byDistance = Math.abs(a.score - score) - Math.abs(b.score - score);
  if (byDistance !== 0) return byDistance;
  return a.domainKey.localeCompare(b.domainKey);
}

export function pickRelatedLocalisationAuditScores({
  domainKey,
  domainSlug,
  score,
  entries,
  limit = RELATED_LOCALISATION_AUDIT_SCORE_LIMIT,
}: {
  domainKey: string;
  domainSlug: string;
  score: number;
  entries: readonly LocalisationAuditRelatedScore[];
  limit?: number;
}): LocalisationAuditRelatedScore[] {
  const cap = Math.max(0, limit);
  if (cap === 0) return [];

  const others = entries.filter(
    (entry) => entry.domainSlug !== domainSlug && entry.domainKey !== domainKey,
  );
  const category = scheduledLocalisationAuditCategoryForDomainKey(domainKey);
  const inCategory = category
    ? others.filter(
        (entry) => scheduledLocalisationAuditCategoryForDomainKey(entry.domainKey) === category,
      )
    : [];

  const picked: LocalisationAuditRelatedScore[] = [];
  const seen = new Set<string>();
  const pools = [
    inCategory.toSorted((a, b) => scoreProximity(a, b, score)),
    others.toSorted((a, b) => scoreProximity(a, b, score)),
  ];

  for (const pool of pools) {
    for (const entry of pool) {
      if (seen.has(entry.domainSlug)) continue;
      seen.add(entry.domainSlug);
      picked.push(entry);
      if (picked.length >= cap) return picked;
    }
  }

  return picked;
}
