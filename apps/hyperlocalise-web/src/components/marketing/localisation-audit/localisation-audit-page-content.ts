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
    headline: "See how your brand travels.",
    subcopy:
      "Enter a URL. We'll read a few public pages and tell you how the site feels in other languages.",
    urlLabel: "Website",
    urlPlaceholder: "https://your-site.com",
    focusLabel: "Languages to look at (optional)",
    focusPlaceholder: "French, German",
    focusHint: "We'll look more closely at up to two.",
    submit: "See my score",
    submitting: "Looking now…",
    onePerDomain: "One free look per site. Ten a day across all sites.",
    methodologyHeading: "What we notice",
    notices: [
      {
        title: "Voice",
        body: "Does the writing still sound like you, once the language changes?",
      },
      {
        title: "Presence",
        body: "Do pages still feel considered — layout, images, and all?",
      },
      {
        title: "Discovery",
        body: "Can visitors find the right version of the site?",
      },
    ],
    scopeNote: "We only read public pages. We never sign in or fill in forms.",
    disclosure: "Scores and full reports are public. Optionally email yourself a summary.",
    sampleFindingTitle: "A typical note",
    sampleFindingBody:
      "French and English pages don't point to each other, so visitors can miss the other language entirely.",
    leaderboardHeading: "How other sites score",
    leaderboardSubcopy: "Public scores, side by side. Check yours to see where you stand.",
    leaderboardEmpty: "No public scores yet. Be the first.",
  };
}

export function getLocalisationAuditResultCopy(_locale: string) {
  return {
    runningTitle: "Running localisation audit",
    runningBody:
      "Sampling pages and checking technical and linguistic signals. Safe to leave this tab — progress is saved.",
    expectedDuration: "Usually finishes in 1–3 minutes.",
    emailWhenReadyHeading: "Email me a summary when ready",
    emailWhenReadyBody:
      "Optional. We will send a summary of the report to your inbox when the audit completes.",
    emailWhenReadySubmit: "Notify me",
    emailWhenReadyPending: "Saving…",
    emailWhenReadyQueued: "We will email you a summary when this audit finishes.",
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
    unlockHeading: "Email me a summary",
    unlockBody:
      "Optional. Enter your work email and we will send a concise summary of this public report.",
    unlockLockedCount: "",
    standingHeading: "How you compare",
    standingRank: "Rank #{rank} of {total} public audits",
    standingPercentile: "Top {percentile}% of audited domains",
    standingAverage: "Public average: {average}/100",
    standingCta: "See the full leaderboard",
    shareHeading: "Share this report",
    shareBody: "This report is public. Share it with your team or post it to start a comparison.",
    shareCopyLink: "Copy report link",
    shareCopied: "Link copied",
    emailLabel: "Work email",
    emailPlaceholder: "you@company.com",
    unlockSubmit: "Email me a summary",
    unlocking: "Sending…",
    unlockQueued: "Check your inbox for a summary of this report.",
    companyIndustryLabel: "Industry",
    companyProductLabel: "Product",
    companyBrandVoiceLabel: "Brand voice",
    companyReportEyebrow: "Localisation report",
    findingWhereLabel: "Found here",
    findingEvidenceLabel: "What we saw",
    findingAdviceLabel: "How to fix it",
    fullFindingsHeading: "Full findings",
    creditsHeading: "Audit criteria",
    criteriaSummary: "{passed} passed · {failed} to fix · {na} not applicable",
    criteriaNeedsAttentionHeading: "Needs attention ({count})",
    criteriaPassedHeading: "Passed audits ({count})",
    criteriaNotApplicableHeading: "Not applicable ({count})",
    criteriaPassLabel: "Pass",
    criteriaFailLabel: "Fail",
    criteriaNaLabel: "N/A",
    criteriaExpandPassed: "Show passed audits",
    criteriaCollapsePassed: "Hide passed audits",
    criteriaExpandNa: "Show not applicable",
    criteriaCollapseNa: "Hide not applicable",
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
    claimDomain: "Claim this domain",
    openInWorkspace: "Open in workspace",
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
