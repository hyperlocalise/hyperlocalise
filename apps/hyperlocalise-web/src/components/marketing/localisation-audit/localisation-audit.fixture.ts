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
import { LOCALISATION_AUDIT_CREDITS } from "@/lib/localisation-audit/credits/catalog";
import {
  aggregateLocalisationAuditCredits,
  pickHeadlineFindings,
} from "@/lib/localisation-audit/score";
import type { LocalisationAuditStanding } from "@/lib/localisation-audit/store";
import type {
  LocalisationAuditCreditMethod,
  LocalisationAuditCreditResult,
  LocalisationAuditFinding,
  LocalisationAuditFindingSeverity,
  LocalisationAuditProgressStage,
  LocalisationAuditReport,
  LocalisationAuditTeaser,
} from "@/lib/localisation-audit/types";

export const localisationAuditDomainKey = "acme.example";
export const localisationAuditDomainSlug = "acme-example-abcd";
export const localisationAuditSourceUrl = "https://acme.example/";
export const localisationAuditCompletedAt = "2026-08-01T12:00:00.000Z";
export const localisationAuditId = "11111111-1111-4111-8111-111111111111";

export type LocalisationAuditStoryAudit = {
  id: string;
  domainKey: string;
  domainSlug: string;
  sourceUrl: string;
  status: string;
  attemptNumber?: number;
  progressStage?: LocalisationAuditProgressStage | null;
  score: number | null;
  teaser: LocalisationAuditTeaser | null;
  report: LocalisationAuditReport | null;
  unlocked: boolean;
  retryable?: boolean;
  rerunnable?: boolean;
  rerunAvailableAt?: string | null;
  errorCode: string | null;
  errorMessage?: string | null;
  completedAt?: string | null;
};

export type LocalisationAuditFixtureScoreBand = "mixed" | "excellent" | "critical";

const MIXED_SCORES = [22, 48, 61, 74, 88, 96];
const FINDING_SEEDS: Array<{
  creditId: string;
  severity: LocalisationAuditFindingSeverity;
  title: string;
  summary: string;
  where?: string;
  evidence?: string;
  advice?: string;
  url?: string;
  confidence?: number;
}> = [
  {
    creditId: "hreflang",
    severity: "critical",
    title: "Missing reciprocal hreflang",
    summary: "FR pages do not point back to EN with hreflang, which can split SEO equity.",
    where: 'Document head · <link rel="alternate" hreflang>',
    url: "https://acme.example/fr",
    evidence:
      '<link rel="alternate" hreflang="en" href="https://acme.example/"> is missing the return tag from FR to EN.',
    advice:
      "Add reciprocal hreflang between EN and FR, including a self-reference and an x-default fallback.",
    confidence: 92,
  },
  {
    creditId: "locale-detection",
    severity: "high",
    title: "html lang does not match the URL locale",
    summary: 'The French homepage still declares lang="en" on the root html element.',
    where: "Document head · <html lang>",
    url: "https://acme.example/fr",
    evidence: '<html lang="en"> while the path locale is fr',
    advice: 'Set html lang="fr" on the French homepage so it matches the /fr path.',
    confidence: 88,
  },
  {
    creditId: "language-switcher",
    severity: "warning",
    title: "Language switcher drops the current path",
    summary: "Switching locale from a product page returns visitors to the homepage.",
    where: "Header · <nav> language links",
    url: "https://acme.example/pricing",
    evidence: '<a href="/fr">Français</a> points at /fr, not /fr/pricing',
    advice:
      "Point language-switcher links at the equivalent localized path, not the locale homepage.",
    confidence: 74,
  },
  {
    creditId: "translation-completeness",
    severity: "medium",
    title: "English CTAs left on localized pages",
    summary: "Primary buttons on the German pricing page still say “Get started”.",
    where: "Pricing hero · <button>",
    url: "https://acme.example/de/pricing",
    evidence: 'Primary CTA: "Get started"',
    advice:
      "Translate leftover source-language CTAs so the German pricing page matches the surrounding copy.",
    confidence: 81,
  },
  {
    creditId: "fluency",
    severity: "low",
    title: "Stiff machine-translation phrasing",
    summary: "Hero copy on /fr reads literally and does not match the source tone.",
    where: "Hero · <h1>",
    url: "https://acme.example/fr",
    evidence:
      'H1: "Construire pour chaque marché" reads as a word-for-word calque of the English hero.',
    advice: "Rewrite the French hero so it sounds natural while keeping the same product promise.",
    confidence: 68,
  },
  {
    creditId: "rtl-support",
    severity: "info",
    title: "No RTL locale sampled",
    summary: "The crawl did not include an RTL locale, so mirroring was not verified.",
    where: "Document root · <html dir>",
    url: "https://acme.example/",
    evidence:
      "Sampled locales were en, fr, and de. No Arabic, Hebrew, or other RTL html lang was found.",
    advice:
      'Add an RTL locale to the public sample, or set dir="rtl" on RTL pages when you ship them.',
    confidence: 40,
  },
  {
    creditId: "canonical-urls",
    severity: "high",
    title: "Canonicals point at the English page",
    summary: "Localized product URLs canonicalize to the EN equivalent instead of themselves.",
    where: 'Document head · <link rel="canonical">',
    url: "https://acme.example/fr/pricing",
    evidence: '<link rel="canonical" href="https://acme.example/en/pricing"> on a fr page',
    advice: "Canonicalize each localized page to its own URL, not another locale.",
    confidence: 90,
  },
  {
    creditId: "text-overflow",
    severity: "medium",
    title: "German nav labels clip at tablet width",
    summary: "Longer DE labels overflow the primary navigation on mid-size viewports.",
    where: "Header · <nav>",
    url: "https://acme.example/de",
    evidence:
      'Nav label "Für Unternehmen jeder Größe" is much longer than the English source and clips at tablet width.',
    advice: "Shorten the German nav label or give the control more room so it does not clip.",
    confidence: 62,
  },
  {
    creditId: "cta-intent",
    severity: "low",
    title: "CTA intent is weaker in French",
    summary: "“En savoir plus” replaces a purchase-oriented source CTA on pricing.",
    where: "Pricing hero · <button>",
    url: "https://acme.example/fr/pricing",
    evidence: 'Primary CTA: "En savoir plus" (source is a purchase-oriented Get started)',
    advice: "Use a French CTA that keeps the purchase intent of the source button.",
    confidence: 71,
  },
];

function creditMethod(
  mode: (typeof LOCALISATION_AUDIT_CREDITS)[number]["mode"],
): LocalisationAuditCreditMethod {
  if (mode === "na") return "na";
  if (mode === "luna") return "luna";
  return "heuristic";
}

function creditScore(
  credit: (typeof LOCALISATION_AUDIT_CREDITS)[number],
  index: number,
  scoreBand: LocalisationAuditFixtureScoreBand,
): number | null {
  if (credit.mode === "na") return null;
  if (scoreBand === "excellent") return 92 + (index % 7);
  if (scoreBand === "critical") return 6 + (index % 12);
  return MIXED_SCORES[index % MIXED_SCORES.length]!;
}

export function createLocalisationAuditCredits(
  scoreBand: LocalisationAuditFixtureScoreBand = "mixed",
): LocalisationAuditCreditResult[] {
  return LOCALISATION_AUDIT_CREDITS.map((credit, index) => ({
    id: credit.id,
    dimension: credit.dimension,
    score: creditScore(credit, index, scoreBand),
    method: creditMethod(credit.mode),
  }));
}

export function createLocalisationAuditFindings(): LocalisationAuditFinding[] {
  const creditsById = new Map(LOCALISATION_AUDIT_CREDITS.map((credit) => [credit.id, credit]));
  return FINDING_SEEDS.flatMap((seed, index) => {
    const credit = creditsById.get(seed.creditId);
    if (!credit) return [];
    return [
      {
        id: `finding-${seed.creditId}-${index}`,
        category: credit.dimension,
        severity: seed.severity,
        title: seed.title,
        summary: seed.summary,
        url: seed.url,
        where: seed.where,
        evidence: seed.evidence,
        advice: seed.advice,
        confidence: seed.confidence,
        creditId: seed.creditId,
      },
    ];
  });
}

const sampledPages: LocalisationAuditReport["pages"] = [
  {
    url: "https://acme.example/",
    status: 200,
    htmlLang: "en",
    title: "Acme — Build for every market",
  },
  {
    url: "https://acme.example/fr",
    status: 200,
    htmlLang: "en",
    title: "Acme — Conçu pour chaque marché",
  },
  {
    url: "https://acme.example/de",
    status: 200,
    htmlLang: "de",
    title: "Acme — Für jeden Markt gebaut",
  },
  {
    url: "https://acme.example/fr/pricing",
    status: 200,
    htmlLang: "fr",
    title: "Tarifs — Acme",
  },
  {
    url: "https://acme.example/de/pricing",
    status: 200,
    htmlLang: "de",
    title: "Preise — Acme",
  },
];

const detectedLocales: LocalisationAuditTeaser["detectedLocales"] = [
  { locale: "en", source: "html_lang", sampleUrl: "https://acme.example/" },
  { locale: "fr", source: "url_prefix", sampleUrl: "https://acme.example/fr" },
  { locale: "de", source: "hreflang", sampleUrl: "https://acme.example/de" },
  { locale: "ja", source: "focus" },
];

const linguisticNotes: LocalisationAuditReport["linguisticNotes"] = [
  {
    locale: "fr",
    summary: "French pages mix natural marketing copy with leftover English CTAs and metadata.",
    samples: [
      {
        text: "Get started",
        note: "Primary pricing CTA remains in English on /fr/pricing.",
      },
      {
        text: "Build for every market",
        note: "OG title is not localized even though the visible H1 is translated.",
      },
    ],
  },
  {
    locale: "de",
    summary:
      "German copy is mostly complete, with length pressure in navigation and a few stiff phrases.",
    samples: [
      {
        text: "Für Unternehmen jeder Größe",
        note: "Accurate, but the nav label wraps and clips at tablet width.",
      },
    ],
  },
];

function createReport(scoreBand: LocalisationAuditFixtureScoreBand): LocalisationAuditReport {
  const credits = createLocalisationAuditCredits(scoreBand);
  const { score, dimensionScores } = aggregateLocalisationAuditCredits(credits, {
    localeCount: detectedLocales.length,
  });
  const findings = createLocalisationAuditFindings();
  return {
    score,
    domainKey: localisationAuditDomainKey,
    domainSlug: localisationAuditDomainSlug,
    sourceUrl: localisationAuditSourceUrl,
    focusLocales: ["fr", "de"],
    detectedLocales,
    findings,
    pages: sampledPages,
    linguisticNotes,
    pagesCrawled: sampledPages.length,
    completedAt: localisationAuditCompletedAt,
    dimensionScores,
    credits,
  };
}

function createTeaser(report: LocalisationAuditReport): LocalisationAuditTeaser {
  return {
    score: report.score,
    domainKey: report.domainKey,
    domainSlug: report.domainSlug,
    detectedLocales: report.detectedLocales,
    headlineFindings: pickHeadlineFindings(report.findings, 3),
    findingsCount: report.findings.length,
    pagesCrawled: report.pagesCrawled,
    completedAt: report.completedAt,
    dimensionScores: report.dimensionScores,
  };
}

export function localisationAuditStanding(score: number): LocalisationAuditStanding {
  return {
    rank: 12,
    total: 84,
    score,
    percentile: 14,
    averageScore: 61,
  };
}

export function createSucceededAudit({
  unlocked = true,
  scoreBand = "mixed",
}: {
  unlocked?: boolean;
  scoreBand?: LocalisationAuditFixtureScoreBand;
} = {}): LocalisationAuditStoryAudit {
  const report = createReport(scoreBand);
  const teaser = createTeaser(report);
  return {
    id: localisationAuditId,
    domainKey: localisationAuditDomainKey,
    domainSlug: localisationAuditDomainSlug,
    sourceUrl: localisationAuditSourceUrl,
    status: "succeeded",
    attemptNumber: 1,
    progressStage: "completed",
    score: report.score,
    teaser,
    report: unlocked ? report : null,
    unlocked,
    retryable: false,
    rerunnable: true,
    rerunAvailableAt: localisationAuditCompletedAt,
    errorCode: null,
    errorMessage: null,
    completedAt: localisationAuditCompletedAt,
  };
}

export function createRunningAudit({
  progressStage = "crawling",
  retryable = false,
}: {
  progressStage?: LocalisationAuditProgressStage;
  retryable?: boolean;
} = {}): LocalisationAuditStoryAudit {
  return {
    id: localisationAuditId,
    domainKey: localisationAuditDomainKey,
    domainSlug: localisationAuditDomainSlug,
    sourceUrl: localisationAuditSourceUrl,
    status: "running",
    attemptNumber: 1,
    progressStage,
    score: null,
    teaser: null,
    report: null,
    unlocked: false,
    retryable,
    errorCode: null,
    errorMessage: null,
    completedAt: null,
  };
}

export function createFailedAudit({
  retryable = true,
}: {
  retryable?: boolean;
} = {}): LocalisationAuditStoryAudit {
  return {
    id: localisationAuditId,
    domainKey: localisationAuditDomainKey,
    domainSlug: localisationAuditDomainSlug,
    sourceUrl: localisationAuditSourceUrl,
    status: "failed",
    attemptNumber: 2,
    progressStage: "failed",
    score: null,
    teaser: null,
    report: null,
    unlocked: false,
    retryable,
    errorCode: "localisation_audit_failed",
    errorMessage: "The crawl could not finish after a network error on the source domain.",
    completedAt: null,
  };
}
