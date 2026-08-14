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

export type LocalisationAuditStatus = "queued" | "running" | "succeeded" | "failed";

export type LocalisationAuditProgressStage =
  | "queued"
  | "preparing"
  | "crawling"
  | "analyzing"
  | "scoring"
  | "completed"
  | "failed";

/** `warning` is a legacy stored-report value; treat it as `high`. */
export type LocalisationAuditFindingSeverity =
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "info"
  | "warning";

export type LocalisationAuditDimension = "technical" | "linguistic" | "contextual" | "visual";

export type LocalisationAuditFindingCategory = LocalisationAuditDimension;

export type LocalisationAuditFinding = {
  id: string;
  category: LocalisationAuditFindingCategory;
  severity: LocalisationAuditFindingSeverity;
  title: string;
  summary: string;
  /** Page section and HTML tag, e.g. "Document head · <html lang>". */
  where?: string;
  url?: string;
  evidence?: string;
  /** Concrete fix for this finding; not a restatement of the summary. */
  advice?: string;
  confidence?: number;
  creditId?: string;
};

export type LocalisationAuditLocaleSignal = {
  locale: string;
  source: "hreflang" | "html_lang" | "url_prefix" | "url_subdomain" | "focus";
  sampleUrl?: string;
};

export type LocalisationAuditJsonLd = {
  type: string;
  inLanguage: string | null;
};

export type LocalisationAuditAltText = {
  alt: string;
  src: string;
};

export type LocalisationAuditCrawledPage = {
  url: string;
  finalUrl?: string;
  status: number;
  htmlLang: string | null;
  title: string | null;
  textSample: string;
  hreflang: Array<{ locale: string; href: string }>;
  canonical: string | null;
  metaDescription: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogLocale: string | null;
  dir: string | null;
  jsonLd: LocalisationAuditJsonLd[];
  ariaLabels: string[];
  altTexts: LocalisationAuditAltText[];
  buttons: string[];
  headings: string[];
  fontFamilies: string[];
  /** word-break values from inline/embedded CSS. */
  wordBreakValues: string[];
  /** line-break values from inline/embedded CSS. */
  lineBreakValues: string[];
  /** direction values from inline/embedded CSS. */
  directionValues: string[];
  /** Physical horizontal CSS snippets (float/margin/padding/left/right/text-align). */
  physicalHorizontalCss: string[];
  /** Logical horizontal CSS snippets (margin-inline, inset-inline, text-align: start/end). */
  logicalHorizontalCss: string[];
  /** Form label / placeholder / name / autocomplete samples for naming checks. */
  formFieldLabels: string[];
  anchors: Array<{ href: string; text: string }>;
};

export type LocalisationAuditSitemapSignal = {
  robotsFound: boolean;
  /** Absolute Sitemap: URLs declared in robots.txt (relative refs are resolved). */
  robotsSitemapDirectives: string[];
  /** True when robots.txt used a relative Sitemap: URL (Lighthouse expects absolute). */
  robotsHasRelativeSitemapDirective: boolean;
  /** Successfully fetched sitemap documents that contained <loc> entries. */
  sitemapUrls: string[];
  localizedUrls: string[];
};

export type LocalisationAuditCrawlResult = {
  pages: LocalisationAuditCrawledPage[];
  sitemap: LocalisationAuditSitemapSignal;
};

export type LocalisationAuditCreditMethod = "heuristic" | "luna" | "na";

export type LocalisationAuditCreditResult = {
  id: string;
  dimension: LocalisationAuditDimension;
  score: number | null;
  method: LocalisationAuditCreditMethod;
};

export type LocalisationAuditDimensionScores = {
  technical: number | null;
  linguistic: number | null;
  contextual: number | null;
  visual: number | null;
};

export type LocalisationAuditTeaser = {
  score: number;
  domainKey: string;
  domainSlug: string;
  detectedLocales: LocalisationAuditLocaleSignal[];
  headlineFindings: LocalisationAuditFinding[];
  /** Total findings in the full report; used to tease locked depth on public pages. */
  findingsCount: number;
  pagesCrawled: number;
  completedAt: string;
  dimensionScores?: LocalisationAuditDimensionScores;
};

export type LocalisationAuditReport = {
  score: number;
  domainKey: string;
  domainSlug: string;
  sourceUrl: string;
  focusLocales: string[];
  detectedLocales: LocalisationAuditLocaleSignal[];
  findings: LocalisationAuditFinding[];
  pages: Array<{
    url: string;
    status: number;
    htmlLang: string | null;
    title: string | null;
  }>;
  linguisticNotes: Array<{
    locale: string;
    summary: string;
    samples: Array<{ text: string; note: string }>;
  }>;
  pagesCrawled: number;
  completedAt: string;
  dimensionScores?: LocalisationAuditDimensionScores;
  credits?: LocalisationAuditCreditResult[];
};

export type LocalisationAuditEventData = {
  auditId: string;
  attemptNumber: number;
};

export type LocalisationAuditReportEmailEventData = {
  leadId: string;
  /** Opaque one-time token; never log. Optional when the send step must mint a replacement. */
  token?: string;
};

export type LocalisationAuditLeadDeliveryStatus =
  | "pending"
  | "queued"
  | "sent"
  | "failed"
  | "verified";

export const LOCALISATION_AUDIT_STALE_MS = 15 * 60 * 1000;
export const LOCALISATION_AUDIT_RERUN_MS = 24 * 60 * 60 * 1000;
/** Rolling 24h cap on new runs and daily re-runs across every domain. */
export const LOCALISATION_AUDIT_DAILY_RUN_LIMIT = 10;
export const LOCALISATION_AUDIT_EMAIL_RESEND_COOLDOWN_MS = 60 * 1000;
export const LOCALISATION_AUDIT_REPORT_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export const EMPTY_SITEMAP_SIGNAL: LocalisationAuditSitemapSignal = {
  robotsFound: false,
  robotsSitemapDirectives: [],
  robotsHasRelativeSitemapDirective: false,
  sitemapUrls: [],
  localizedUrls: [],
};

export function emptyCrawledPage(
  partial: Partial<LocalisationAuditCrawledPage> & { url: string },
): LocalisationAuditCrawledPage {
  return {
    status: 200,
    htmlLang: null,
    title: null,
    textSample: "",
    hreflang: [],
    canonical: null,
    metaDescription: null,
    ogTitle: null,
    ogDescription: null,
    ogLocale: null,
    dir: null,
    jsonLd: [],
    ariaLabels: [],
    altTexts: [],
    buttons: [],
    headings: [],
    fontFamilies: [],
    wordBreakValues: [],
    lineBreakValues: [],
    directionValues: [],
    physicalHorizontalCss: [],
    logicalHorizontalCss: [],
    formFieldLabels: [],
    anchors: [],
    ...partial,
  };
}
