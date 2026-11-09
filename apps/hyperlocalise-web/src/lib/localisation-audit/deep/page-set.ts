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
import { sameSiteOrLocaleSubdomain } from "../crawl";
import { comparableUrl, pathWithoutLocale, urlRoutingLocale } from "../credits/shared";

const NON_HTML_EXTENSION =
  /\.(?:pdf|jpe?g|png|gif|webp|svg|ico|zip|gz|xml|json|txt|csv|mp4|mp3|webm|woff2?|ttf|css|js)$/i;

/**
 * Group key for pages built from the same template: the first path segment
 * after any locale prefix, with deeper paths collapsed to `/*`.
 * `/de/blog/hello` and `/blog/world` are both `/blog/*`.
 */
export function deepAuditTemplateKey(url: string): string {
  const path = pathWithoutLocale(url) ?? "/";
  const segments = path.split("/").filter(Boolean);
  if (segments.length === 0) return "/";
  if (segments.length === 1) return `/${segments[0]}`;
  return `/${segments[0]}/*`;
}

/**
 * Identity of a page across locales: the path after any locale prefix. Every
 * candidate is on the site or one of its locale subdomains, so the host is not
 * part of the key. `fr.example.com/pricing`, `example.com/de/pricing` and
 * `example.com/pricing` share one cluster.
 */
export function deepAuditClusterKey(url: string): string | null {
  const path = pathWithoutLocale(url);
  if (path == null) return null;
  return path.toLowerCase();
}

export function isDeepAuditCandidateUrl(originHost: string, url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    if (NON_HTML_EXTENSION.test(parsed.pathname)) return false;
    return sameSiteOrLocaleSubdomain(originHost, url);
  } catch {
    return false;
  }
}

/**
 * Pick up to `limit` URLs so that every template is covered and each chosen
 * page comes with its locale versions. Clusters (one page across locales) are
 * taken round-robin across templates, homepage first, so one large template
 * such as `/blog/*` cannot use up the budget.
 */
export function selectDeepAuditUrls(input: {
  origin: string;
  candidates: string[];
  limit: number;
  exclude?: Iterable<string>;
}): string[] {
  const originHost = new URL(input.origin).hostname;
  const excluded = new Set<string>();
  for (const url of input.exclude ?? []) {
    const key = comparableUrl(url);
    if (key) excluded.add(key);
  }

  const seen = new Set<string>();
  const templates = new Map<string, Map<string, string[]>>();
  for (const raw of input.candidates) {
    const key = comparableUrl(raw);
    if (!key || seen.has(key) || excluded.has(key)) continue;
    if (!isDeepAuditCandidateUrl(originHost, raw)) continue;
    const cluster = deepAuditClusterKey(raw);
    if (cluster == null) continue;
    seen.add(key);
    const template = deepAuditTemplateKey(raw);
    const clusters = templates.get(template) ?? new Map<string, string[]>();
    const urls = clusters.get(cluster) ?? [];
    urls.push(raw);
    clusters.set(cluster, urls);
    templates.set(template, clusters);
  }

  const orderedTemplates = [...templates.entries()]
    .toSorted(([a, aClusters], [b, bClusters]) => {
      if (a === "/") return -1;
      if (b === "/") return 1;
      return bClusters.size - aClusters.size || a.localeCompare(b);
    })
    .map(([, clusters]) =>
      [...clusters.entries()]
        .toSorted(([a, aUrls], [b, bUrls]) => bUrls.length - aUrls.length || a.localeCompare(b))
        .map(([, urls]) =>
          // Unprefixed (source) page first, then locales in a stable order.
          urls.toSorted((left, right) => {
            const leftLocale = urlRoutingLocale(left) ?? "";
            const rightLocale = urlRoutingLocale(right) ?? "";
            return leftLocale.localeCompare(rightLocale) || left.localeCompare(right);
          }),
        ),
    );

  const selected: string[] = [];
  for (let round = 0; selected.length < input.limit; round++) {
    let addedThisRound = false;
    for (const clusters of orderedTemplates) {
      const cluster = clusters[round];
      if (!cluster) continue;
      for (const url of cluster) {
        if (selected.length >= input.limit) break;
        selected.push(url);
        addedThisRound = true;
      }
    }
    if (!addedThisRound) break;
  }
  return selected;
}
