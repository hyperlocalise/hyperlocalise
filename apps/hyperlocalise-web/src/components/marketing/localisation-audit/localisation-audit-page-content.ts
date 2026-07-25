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

export function getLocalisationAuditPageCopy(_locale: string) {
  return {
    headline: "Localisation health check",
    subcopy:
      "Paste a URL. We sample key pages, score technical and linguistic readiness, and show the gaps that hurt global conversion.",
    urlLabel: "Website URL",
    urlPlaceholder: "https://example.com",
    focusLabel: "Focus markets (optional)",
    focusPlaceholder: "fr, de",
    focusHint: "Up to two locales for a deeper linguistic pass.",
    submit: "Run free audit",
    submitting: "Starting audit…",
    onePerDomain:
      "One free audit per domain. If we already audited it, you will see the public teaser report.",
    methodologyHeading: "What we check",
    technicalChecks: [
      "hreflang and HTML lang consistency",
      "Locale URL patterns and mixed-language signals",
      "Homepage and high-value navigation samples",
    ],
    linguisticChecks: [
      "Heuristic language/locale mismatches",
      "Light LLM review on optional focus markets",
      "Sampled product, pricing, and nav copy",
    ],
    crawlLimits:
      "Smart sample of about 10–15 public pages. We do not log in, submit forms, or crawl private areas.",
    privacyNote:
      "Safe crawl only: public HTML over HTTPS, SSRF-guarded fetches, and no credentialed access.",
    disclosure:
      "Successful teaser reports are public and indexable. Email verification unlocks the full report for that domain.",
    sampleFindingTitle: "Sample finding",
    sampleFindingBody:
      "Critical · Missing hreflang return tags between EN and FR can split SEO equity across locales.",
  };
}

export function getLocalisationAuditResultCopy(_locale: string) {
  return {
    runningTitle: "Running localisation audit",
    runningBody:
      "Sampling pages and checking technical and linguistic signals. Safe to leave this tab — progress is saved.",
    expectedDuration: "Usually finishes in 1–3 minutes.",
    emailWhenReadyHeading: "Email me when ready",
    emailWhenReadyBody:
      "Optional. We will send a verified link to the full report when the audit completes.",
    emailWhenReadySubmit: "Notify me",
    emailWhenReadyPending: "Saving…",
    emailWhenReadyQueued: "We will email you a verified report link when this audit finishes.",
    progressQueued: "Queued",
    progressPreparing: "Preparing",
    progressCrawling: "Crawling",
    progressAnalyzing: "Analyzing",
    progressScoring: "Scoring",
    staleTitle: "This audit looks stuck",
    staleBody:
      "No progress for a while. You can safely retry — we will reclaim the stalled run and start a fresh attempt.",
    failedTitle: "Audit failed",
    failedBody: "Something went wrong while auditing this domain. You can retry safely.",
    retry: "Retry audit",
    retrying: "Retrying…",
    scoreLabel: "Localisation score",
    scoreOutOf: "/100",
    freshnessLabel: "Audited",
    scopeLabel: "Scope",
    scopeBody: "Public smart sample · technical checks + light linguistic review",
    confidenceLabel: "Confidence",
    confidenceBody: "Indicative health check from sampled pages — not a full site crawl.",
    fixFirstHeading: "Fix first",
    localesHeading: "Detected locales",
    findingsHeading: "Headline findings",
    unlockHeading: "Get the full report by email",
    unlockBody:
      "Enter your work email. We send a verified link (expires in 24 hours) to unlock every finding, page sample, and linguistic note.",
    emailLabel: "Work email",
    emailPlaceholder: "you@company.com",
    unlockSubmit: "Email me the report",
    unlocking: "Sending…",
    unlockQueued: "Check your inbox for a verified link to unlock the full report.",
    fullFindingsHeading: "Full findings",
    linguisticHeading: "Linguistic notes",
    pagesHeading: "Pages sampled",
    reauditHeading: "Next step",
    reauditBodyLow:
      "Critical gaps showed up. Create a workspace to run a deeper registered audit, or book a review with our team.",
    reauditBodyMid:
      "Solid baseline with room to improve. Create a workspace for continuous locale monitoring, or book an audit review.",
    reauditBodyHigh:
      "Strong localisation signals. Create a workspace to keep locales healthy as you ship, or book a deeper review.",
    createWorkspace: "Create a workspace",
    deeperAudit: "Run a deeper registered audit",
    bookReview: "Book an audit review",
    scoreInterpretationHigh: "Strong technical and linguistic signals on the sampled pages.",
    scoreInterpretationMid: "Usable foundation with clear gaps that can hurt conversion or SEO.",
    scoreInterpretationLow: "High-impact localisation issues likely affecting discovery or trust.",
  };
}

export function interpretScore(score: number | null | undefined) {
  if (score == null) return "unknown" as const;
  if (score >= 80) return "high" as const;
  if (score >= 50) return "mid" as const;
  return "low" as const;
}
