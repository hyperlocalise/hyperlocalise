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
import { createHash } from "node:crypto";

import { pathWithoutLocale, urlRoutingLocale } from "../credits/shared";
import type { LocalisationAuditCrawledPage, LocalisationAuditFinding } from "../types";
import { deepAuditTemplateKey } from "./page-set";
import type {
  LocalisationDeepAuditCreditStats,
  LocalisationDeepAuditDiffState,
  LocalisationDeepAuditDiffSummary,
  LocalisationDeepAuditTemplateSummary,
} from "./types";

export type DeepAuditFindingRecord = {
  creditId: string;
  dimension: string;
  severity: LocalisationAuditFinding["severity"];
  title: string;
  summary: string;
  url: string | null;
  templateKey: string | null;
  locale: string | null;
  location: string | null;
  evidence: string | null;
  advice: string | null;
  confidence: number | null;
  fingerprint: string;
  diffState: LocalisationDeepAuditDiffState;
};

/**
 * Stable identity of a finding across runs: the check, the title, and the
 * page it is on (locale plus path without the locale prefix). Query strings
 * and hosts do not change identity, so a redirect to `www.` is not a new finding.
 */
export function deepAuditFindingFingerprint(finding: {
  creditId: string;
  title: string;
  url: string | null;
}): string {
  let page = "";
  if (finding.url) {
    const locale = urlRoutingLocale(finding.url) ?? "";
    page = `${locale}:${pathWithoutLocale(finding.url) ?? finding.url}`;
  }
  return createHash("sha256")
    .update(`${finding.creditId}\u0000${finding.title}\u0000${page}`)
    .digest("hex");
}

function localeForUrl(
  url: string | undefined,
  pageLocales: Map<string, string | null>,
): string | null {
  if (!url) return null;
  return pageLocales.get(url) ?? urlRoutingLocale(url);
}

/**
 * Turn scorer findings into rows: add template, locale and fingerprint, and
 * mark each as new or unchanged against the previous run's fingerprints.
 * Duplicate fingerprints within a run are dropped.
 */
export function buildDeepAuditFindingRecords(input: {
  findings: LocalisationAuditFinding[];
  pageLocales: Map<string, string | null>;
  previousFingerprints: Set<string> | null;
}): DeepAuditFindingRecord[] {
  const records: DeepAuditFindingRecord[] = [];
  const seen = new Set<string>();
  for (const finding of input.findings) {
    const creditId = finding.creditId ?? finding.category;
    const url = finding.url ?? null;
    const fingerprint = deepAuditFindingFingerprint({ creditId, title: finding.title, url });
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    records.push({
      creditId,
      dimension: finding.category,
      severity: finding.severity === "warning" ? "high" : finding.severity,
      title: finding.title,
      summary: finding.summary,
      url,
      templateKey: url ? deepAuditTemplateKey(url) : null,
      locale: localeForUrl(finding.url, input.pageLocales),
      location: finding.where ?? null,
      evidence: finding.evidence ?? null,
      advice: finding.advice ?? null,
      confidence: finding.confidence == null ? null : Math.round(finding.confidence),
      fingerprint,
      diffState: input.previousFingerprints?.has(fingerprint) ? "unchanged" : "new",
    });
  }
  return records;
}

export function summarizeDeepAuditDiff(
  records: DeepAuditFindingRecord[],
  previousFingerprints: Set<string> | null,
): LocalisationDeepAuditDiffSummary | null {
  if (!previousFingerprints) return null;
  const current = new Set(records.map((record) => record.fingerprint));
  let fixed = 0;
  for (const fingerprint of previousFingerprints) {
    if (!current.has(fingerprint)) fixed += 1;
  }
  const unchanged = records.filter((record) => record.diffState === "unchanged").length;
  return { new: records.length - unchanged, unchanged, fixed };
}

/** Pages and templates with at least one finding, per check. */
export function deepAuditCreditStats(
  records: DeepAuditFindingRecord[],
): Record<string, LocalisationDeepAuditCreditStats> {
  const pages = new Map<string, Set<string>>();
  const templates = new Map<string, Set<string>>();
  for (const record of records) {
    if (!record.url) continue;
    const pageSet = pages.get(record.creditId) ?? new Set<string>();
    pageSet.add(record.url);
    pages.set(record.creditId, pageSet);
    const templateSet = templates.get(record.creditId) ?? new Set<string>();
    templateSet.add(record.templateKey ?? "/");
    templates.set(record.creditId, templateSet);
  }
  const stats: Record<string, LocalisationDeepAuditCreditStats> = {};
  for (const [creditId, pageSet] of pages) {
    stats[creditId] = {
      affectedPages: pageSet.size,
      affectedTemplates: templates.get(creditId)?.size ?? 0,
    };
  }
  return stats;
}

export function summarizeDeepAuditTemplates(
  pages: Array<{ templateKey: string; locale: string | null }>,
): LocalisationDeepAuditTemplateSummary[] {
  const byKey = new Map<string, { pages: number; locales: Set<string> }>();
  for (const page of pages) {
    const entry = byKey.get(page.templateKey) ?? { pages: 0, locales: new Set<string>() };
    entry.pages += 1;
    if (page.locale) entry.locales.add(page.locale);
    byKey.set(page.templateKey, entry);
  }
  return [...byKey.entries()]
    .map(([key, entry]) => ({ key, pages: entry.pages, locales: [...entry.locales].toSorted() }))
    .toSorted((a, b) => b.pages - a.pages || a.key.localeCompare(b.key));
}

/** Hreflang alternates on rendered pages, for a second discovery pass. */
export function hreflangAlternates(pages: LocalisationAuditCrawledPage[]): string[] {
  const urls: string[] = [];
  for (const page of pages) {
    for (const entry of page.hreflang) {
      try {
        urls.push(new URL(entry.href, page.url).toString());
      } catch {
        // ignore malformed hreflang href
      }
    }
  }
  return urls;
}
