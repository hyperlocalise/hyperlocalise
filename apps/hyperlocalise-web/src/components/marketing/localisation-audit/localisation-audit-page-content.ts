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
import { DEFAULT_APP_LOCALE } from "@/lib/app-i18n/locales";
import { getBlogPostPath } from "@/lib/blog/blog-post-path";

export const LOCALISATION_AUDIT_GUIDE_SLUG = "what-is-a-website-localisation-audit";

export function getLocalisationAuditGuideHref(): string {
  return (
    getBlogPostPath(DEFAULT_APP_LOCALE, LOCALISATION_AUDIT_GUIDE_SLUG) ??
    `/${DEFAULT_APP_LOCALE}/blog/${LOCALISATION_AUDIT_GUIDE_SLUG}`
  );
}

export function getLocalisationAuditPageCopy(_locale: string) {
  return {
    headline: "Localisation health check",
    subcopy:
      "Paste a URL. Get a public score, see how you rank against other domains, and unlock the full report with your work email.",
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
      "Locale detection, routing, language switcher, hreflang, and canonicals",
      "Localized metadata, sitemaps, structured data, and formatting",
      "Accessibility localisation on sampled pages",
    ],
    linguisticChecks: [
      "Translation completeness, terminology, and cross-page consistency",
      "Accuracy, fluency, brand voice, and grammar when heuristics are inconclusive",
      "Contextual and visual credits on the same sampled pages",
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
    leaderboardHeading: "Public localisation leaderboard",
    leaderboardSubcopy:
      "Teaser scores are public. Compare domains, then run your own audit to see where you rank.",
    leaderboardEmpty: "No public audits yet. Run the first health check and claim the top spot.",
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
    progressStepOf: "Step {current} of {total}",
    progressBarLabel: "Audit progress",
    progressQueuedDetail: "This audit is queued and will start shortly.",
    progressPreparingDetail: "Checking the domain and opening a safe crawl.",
    progressCrawlingDetail: "Sampling public pages and locale roots.",
    progressAnalyzingDetail: "Checking technical, linguistic, contextual, and visual signals.",
    progressScoringDetail: "Combining credits into the four module scores.",
    staleTitle: "This audit looks stuck",
    staleBody:
      "No progress for a while. You can safely retry — we will reclaim the stalled run and start a fresh attempt.",
    failedTitle: "Audit failed",
    failedBody: "Something went wrong while auditing this domain. You can retry safely.",
    retry: "Retry audit",
    retrying: "Retrying…",
    rerun: "Re-run audit",
    rerunning: "Re-running…",
    rerunCooldown: "You can re-run this audit once a day. Next run {when}.",
    scoreLabel: "Localisation score",
    scoreOutOf: "/100",
    scoreRatingExcellent: "Excellent",
    scoreRatingGood: "Good",
    scoreRatingNeedsImprovement: "Needs improvement",
    scoreRatingPoor: "Poor",
    scoreRatingCritical: "Critical",
    dimensionTechnical: "Technical Audit",
    dimensionLinguistic: "Linguistic Audit",
    dimensionContextual: "Contextual Audit",
    dimensionVisual: "Visual Audit",
    freshnessLabel: "Audited",
    scopeLabel: "Scope",
    scopeBody: "Public smart sample · technical, linguistic, contextual, and visual credits",
    confidenceLabel: "Confidence",
    confidenceBody: "Indicative health check from sampled pages — not a full site crawl.",
    fixFirstHeading: "Fix first",
    localesHeading: "Detected locales",
    findingsHeading: "Headline findings",
    unlockHeading: "Get the full report by email",
    unlockBody:
      "Enter your work email. We send a verified link (expires in 24 hours) to unlock every finding, page sample, and linguistic note.",
    unlockLockedCount: "{count} more findings stay locked until you verify your email.",
    standingHeading: "How you compare",
    standingRank: "Rank #{rank} of {total} public audits",
    standingPercentile: "Top {percentile}% of audited domains",
    standingAverage: "Public average: {average}/100",
    standingCta: "See the full leaderboard",
    shareHeading: "Share this public teaser",
    shareBody:
      "This score page is public. Share it with your team or post it to start a comparison.",
    shareCopyLink: "Copy report link",
    shareCopied: "Link copied",
    emailLabel: "Work email",
    emailPlaceholder: "you@company.com",
    unlockSubmit: "Email me the report",
    unlocking: "Sending…",
    unlockQueued: "Check your inbox for a verified link to unlock the full report.",
    findingWhereLabel: "Found here",
    findingEvidenceLabel: "What we saw",
    findingAdviceLabel: "How to fix it",
    fullFindingsHeading: "Full findings",
    creditsHeading: "Credit scores",
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
    scoreInterpretationExcellent: "The localised experience is in strong shape.",
    scoreInterpretationGood:
      "The website is generally well localised, with some issues to improve.",
    scoreInterpretationNeedsImprovement: "Users may encounter noticeable localisation problems.",
    scoreInterpretationPoor: "Significant localisation gaps are affecting the experience.",
    scoreInterpretationCritical:
      "The localised experience has major problems that should be addressed.",
    methodologyLink: "How we score localisation audits",
  };
}

export type LocalisationAuditRating =
  | "excellent"
  | "good"
  | "needs-improvement"
  | "poor"
  | "critical"
  | "unknown";

export function interpretScore(score: number | null | undefined): LocalisationAuditRating {
  if (score == null) return "unknown";
  if (score >= 90) return "excellent";
  if (score >= 75) return "good";
  if (score >= 50) return "needs-improvement";
  if (score >= 25) return "poor";
  return "critical";
}

export function interpretScoreCtaBand(
  rating: LocalisationAuditRating,
): "high" | "mid" | "low" | "unknown" {
  if (rating === "excellent" || rating === "good") return "high";
  if (rating === "needs-improvement") return "mid";
  if (rating === "unknown") return "unknown";
  return "low";
}
