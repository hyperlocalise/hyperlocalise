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
import { getIntlShape } from "@/lib/app-i18n/intl";
import { DEFAULT_APP_LOCALE } from "@/lib/app-i18n/locales";
import { getBlogPostPath } from "@/lib/blog/blog-post-path";

export const LOCALISATION_AUDIT_GUIDE_SLUG = "what-is-a-website-localisation-audit";

export function getLocalisationAuditGuideHref(locale: string = DEFAULT_APP_LOCALE): string {
  return (
    getBlogPostPath(locale, LOCALISATION_AUDIT_GUIDE_SLUG) ??
    `/${locale}/blog/${LOCALISATION_AUDIT_GUIDE_SLUG}`
  );
}

export function getLocalisationAuditPageCopy(locale: string) {
  const intl = getIntlShape(locale);

  return {
    headline: intl.formatMessage({
      defaultMessage: "See how your brand travels.",
      id: "+6k/AAnIp9",
      description: "Primary headline on the public localisation audit landing page",
    }),
    subcopy: intl.formatMessage({
      defaultMessage:
        "Enter a URL. We'll read a few public pages and tell you how the site feels in other languages.",
      id: "tIYDgjN4kT",
      description: "Supporting copy under the localisation audit landing headline",
    }),
    urlLabel: intl.formatMessage({
      defaultMessage: "Website",
      id: "VHfMEbrDRM",
      description: "Label for the website URL field on the localisation audit form",
    }),
    urlPlaceholder: intl.formatMessage({
      defaultMessage: "https://your-site.com",
      id: "4yCkDpHN88",
      description: "Placeholder for the website URL field on the localisation audit form",
    }),
    focusLabel: intl.formatMessage({
      defaultMessage: "Languages to look at (optional)",
      id: "3sSVTCWzgg",
      description: "Label for optional focus languages on the localisation audit form",
    }),
    focusPlaceholder: intl.formatMessage({
      defaultMessage: "French, German",
      id: "26uyfoaW4I",
      description: "Placeholder for optional focus languages on the localisation audit form",
    }),
    focusHint: intl.formatMessage({
      defaultMessage: "We'll look more closely at up to two.",
      id: "KigHdi8k7w",
      description: "Hint under the optional focus languages field on the localisation audit form",
    }),
    submit: intl.formatMessage({
      defaultMessage: "See my score",
      id: "fZ/p4nukUo",
      description: "Submit button on the localisation audit landing form",
    }),
    submitting: intl.formatMessage({
      defaultMessage: "Looking now…",
      id: "PHgeGQnTFw",
      description: "Submit button label while the localisation audit is starting",
    }),
    onePerDomain: (values: { limit: number }) =>
      intl.formatMessage(
        {
          defaultMessage: "One free look per site. {limit} a day across all sites.",
          id: "PX+2a63Sck",
          description: "Rate-limit note under the localisation audit landing form",
        },
        values,
      ),
    startError: intl.formatMessage({
      defaultMessage: "Could not start the audit. Check the URL and try again.",
      id: "tBmWE9rsb2",
      description: "Error shown when the localisation audit form fails to start an audit",
    }),
    methodologyHeading: intl.formatMessage({
      defaultMessage: "What we notice",
      id: "fyhM45TkNF",
      description: "Heading for the methodology section on the localisation audit landing page",
    }),
    notices: [
      {
        title: intl.formatMessage({
          defaultMessage: "Voice",
          id: "FVIz6ikiua",
          description: "Title of the voice methodology card on the localisation audit landing page",
        }),
        body: intl.formatMessage({
          defaultMessage: "Does the writing still sound like you, once the language changes?",
          id: "ULcCfIfBDx",
          description: "Body of the voice methodology card on the localisation audit landing page",
        }),
      },
      {
        title: intl.formatMessage({
          defaultMessage: "Presence",
          id: "TEByVD08L+",
          description:
            "Title of the presence methodology card on the localisation audit landing page",
        }),
        body: intl.formatMessage({
          defaultMessage: "Do pages still feel considered — layout, images, and all?",
          id: "731nFVbbU3",
          description:
            "Body of the presence methodology card on the localisation audit landing page",
        }),
      },
      {
        title: intl.formatMessage({
          defaultMessage: "Discovery",
          id: "mrmSpANeux",
          description:
            "Title of the discovery methodology card on the localisation audit landing page",
        }),
        body: intl.formatMessage({
          defaultMessage: "Can visitors find the right version of the site?",
          id: "ZT4A78YiXg",
          description:
            "Body of the discovery methodology card on the localisation audit landing page",
        }),
      },
    ],
    scopeNote: intl.formatMessage({
      defaultMessage: "We only read public pages. We never sign in or fill in forms.",
      id: "Ldkvycssco",
      description: "Scope note on the localisation audit landing page",
    }),
    disclosure: intl.formatMessage({
      defaultMessage: "Scores and full reports are public. Optionally email yourself a summary.",
      id: "vLOvG+Aj8h",
      description: "Public-report disclosure on the localisation audit landing page",
    }),
    sampleFindingTitle: intl.formatMessage({
      defaultMessage: "A typical note",
      id: "MlXu9cA5kU",
      description: "Eyebrow above the sample finding on the localisation audit landing page",
    }),
    sampleFindingBody: intl.formatMessage({
      defaultMessage:
        "French and English pages don't point to each other, so visitors can miss the other language entirely.",
      id: "U0PoyhfZi2",
      description: "Sample finding body on the localisation audit landing page",
    }),
    leaderboardHeading: intl.formatMessage({
      defaultMessage: "How other sites score",
      id: "/+gVj3qXhZ",
      description: "Heading for the public localisation audit leaderboard",
    }),
    leaderboardSubcopy: intl.formatMessage({
      defaultMessage: "Public scores, side by side. Check yours to see where you stand.",
      id: "JSylA1G/ba",
      description: "Supporting copy for the public localisation audit leaderboard",
    }),
    leaderboardEmpty: intl.formatMessage({
      defaultMessage: "No public scores yet. Be the first.",
      id: "4XzQKxM2MY",
      description: "Empty state for the public localisation audit leaderboard",
    }),
    leaderboardSiteColumn: intl.formatMessage({
      defaultMessage: "Site",
      id: "mHZZxFedL8",
      description: "Column heading for site names on the localisation audit leaderboard",
    }),
    leaderboardScoreColumn: intl.formatMessage({
      defaultMessage: "Score",
      id: "MrZ8+8I97E",
      description: "Column heading for scores on the localisation audit leaderboard",
    }),
    leaderboardScoreLabel: (values: { score: number }) =>
      intl.formatMessage(
        {
          defaultMessage: "Score {score} out of 100",
          id: "dbtTNEaJX2",
          description: "Accessible label for a localisation audit leaderboard score bar",
        },
        values,
      ),
  };
}

export function getLocalisationAuditResultCopy(locale: string) {
  const intl = getIntlShape(locale);

  return {
    runningTitle: intl.formatMessage({
      defaultMessage: "Running localisation audit",
      id: "7r56c37km5",
      description: "Title shown while a public localisation audit is in progress",
    }),
    runningBody: intl.formatMessage({
      defaultMessage:
        "Sampling pages and checking technical and linguistic signals. Safe to leave this tab — progress is saved.",
      id: "Chmxs2/LX8",
      description: "Body shown while a public localisation audit is in progress",
    }),
    expectedDuration: intl.formatMessage({
      defaultMessage: "Usually finishes in 1–3 minutes.",
      id: "k5atS7Ij0F",
      description: "Expected duration note while a localisation audit is running",
    }),
    emailWhenReadyHeading: intl.formatMessage({
      defaultMessage: "Email me a summary when ready",
      id: "xTNiGIIXkt",
      description: "Heading for the notify-me form on a running localisation audit",
    }),
    emailWhenReadyBody: intl.formatMessage({
      defaultMessage:
        "Optional. We will send a summary of the report to your inbox when the audit completes.",
      id: "m4m7Z9SYlx",
      description: "Body for the notify-me form on a running localisation audit",
    }),
    emailWhenReadySubmit: intl.formatMessage({
      defaultMessage: "Notify me",
      id: "HK97A4xbg9",
      description: "Submit button for the notify-me form on a running localisation audit",
    }),
    emailWhenReadyPending: intl.formatMessage({
      defaultMessage: "Saving…",
      id: "WW5Wdugy4j",
      description: "Pending label for the notify-me form on a running localisation audit",
    }),
    emailWhenReadyQueued: intl.formatMessage({
      defaultMessage: "We will email you a summary when this audit finishes.",
      id: "5eDm4m1RNJ",
      description: "Success message after requesting a running-audit email notification",
    }),
    progressQueued: intl.formatMessage({
      defaultMessage: "Queued",
      id: "IwWn3c1LU2",
      description: "Progress step label when a localisation audit is queued",
    }),
    progressPreparing: intl.formatMessage({
      defaultMessage: "Preparing",
      id: "m4T5sYEFR7",
      description: "Progress step label when a localisation audit is preparing",
    }),
    progressCrawling: intl.formatMessage({
      defaultMessage: "Crawling",
      id: "88Bc6aFgMg",
      description: "Progress step label when a localisation audit is crawling pages",
    }),
    progressAnalyzing: intl.formatMessage({
      defaultMessage: "Analyzing",
      id: "pDMtFvmk4c",
      description: "Progress step label when a localisation audit is analyzing signals",
    }),
    progressScoring: intl.formatMessage({
      defaultMessage: "Scoring",
      id: "SjHx8vM/dA",
      description: "Progress step label when a localisation audit is scoring results",
    }),
    progressStepOf: (values: { current: number; total: number }) =>
      intl.formatMessage(
        {
          defaultMessage: "Step {current} of {total}",
          id: "TWWOWkYG7q",
          description: "Progress counter for a running localisation audit",
        },
        values,
      ),
    progressBarLabel: intl.formatMessage({
      defaultMessage: "Audit progress",
      id: "+HGkRuvHRM",
      description: "Accessible label for the localisation audit progress tracker",
    }),
    progressQueuedDetail: intl.formatMessage({
      defaultMessage: "This audit is queued and will start shortly.",
      id: "bSoPJAmJQC",
      description: "Detail text when a localisation audit is queued",
    }),
    progressPreparingDetail: intl.formatMessage({
      defaultMessage: "Checking the domain and opening a safe crawl.",
      id: "LMJfi53KSl",
      description: "Detail text when a localisation audit is preparing",
    }),
    progressCrawlingDetail: intl.formatMessage({
      defaultMessage: "Sampling public pages and locale roots.",
      id: "qoKQfRLzE9",
      description: "Detail text when a localisation audit is crawling",
    }),
    progressAnalyzingDetail: intl.formatMessage({
      defaultMessage: "Checking technical, linguistic, contextual, and visual signals.",
      id: "N8ghyZ/Xzt",
      description: "Detail text when a localisation audit is analyzing",
    }),
    progressScoringDetail: intl.formatMessage({
      defaultMessage: "Combining credits into the four module scores.",
      id: "GausSgRE+l",
      description: "Detail text when a localisation audit is scoring",
    }),
    staleTitle: intl.formatMessage({
      defaultMessage: "This audit looks stuck",
      id: "n3G74L1ESt",
      description: "Title when a public localisation audit appears stalled",
    }),
    staleBody: intl.formatMessage({
      defaultMessage:
        "No progress for a while. You can safely retry — we will reclaim the stalled run and start a fresh attempt.",
      id: "K3Hic0nQfc",
      description: "Body when a public localisation audit appears stalled",
    }),
    failedTitle: intl.formatMessage({
      defaultMessage: "Audit failed",
      id: "MHGSRfE0a7",
      description: "Title when a public localisation audit fails",
    }),
    failedBody: intl.formatMessage({
      defaultMessage: "Something went wrong while auditing this domain. You can retry safely.",
      id: "cRg9/fMFSw",
      description: "Body when a public localisation audit fails",
    }),
    failedFallback: intl.formatMessage({
      defaultMessage: "The audit could not finish for this domain.",
      id: "dIHTtzU056",
      description: "Fallback error when a failed localisation audit has no error message",
    }),
    retry: intl.formatMessage({
      defaultMessage: "Retry audit",
      id: "qSi5mzrfOt",
      description: "Button to retry a failed or stalled localisation audit",
    }),
    retrying: intl.formatMessage({
      defaultMessage: "Retrying…",
      id: "CBECdPWm0s",
      description: "Button label while retrying a localisation audit",
    }),
    retryError: intl.formatMessage({
      defaultMessage: "Could not retry the audit.",
      id: "ZT0ZLYbp16",
      description: "Error shown when retrying a localisation audit fails",
    }),
    rerun: intl.formatMessage({
      defaultMessage: "Re-run audit",
      id: "MPNpD0t4eB",
      description: "Button to re-run a completed localisation audit",
    }),
    rerunning: intl.formatMessage({
      defaultMessage: "Re-running…",
      id: "QAZYQBBFd9",
      description: "Button label while re-running a localisation audit",
    }),
    rerunError: intl.formatMessage({
      defaultMessage: "Could not re-run the audit.",
      id: "x7lBWitDFc",
      description: "Error shown when re-running a localisation audit fails",
    }),
    rerunCooldown: (values: { when: string }) =>
      intl.formatMessage(
        {
          defaultMessage: "You can re-run this audit once a day. Next run {when}.",
          id: "6c1dq311jJ",
          description: "Cooldown note when a localisation audit cannot be re-run yet",
        },
        values,
      ),
    scoreLabel: intl.formatMessage({
      defaultMessage: "Localisation score",
      id: "7CPu6D68D+",
      description: "Label above the overall localisation audit score",
    }),
    scoreOutOf: intl.formatMessage({
      defaultMessage: "/100",
      id: "X/5lAUS4wm",
      description: "Suffix after the overall localisation audit score",
    }),
    scoreRatingExcellent: intl.formatMessage({
      defaultMessage: "Excellent",
      id: "0Fkv13W/rO",
      description: "Rating label for an excellent localisation audit score",
    }),
    scoreRatingGood: intl.formatMessage({
      defaultMessage: "Good",
      id: "6jGL8gGwLP",
      description: "Rating label for a good localisation audit score",
    }),
    scoreRatingNeedsImprovement: intl.formatMessage({
      defaultMessage: "Needs improvement",
      id: "UIH0t2l1Rg",
      description: "Rating label for a localisation audit score that needs improvement",
    }),
    scoreRatingPoor: intl.formatMessage({
      defaultMessage: "Poor",
      id: "ecuiDTvUrZ",
      description: "Rating label for a poor localisation audit score",
    }),
    scoreRatingCritical: intl.formatMessage({
      defaultMessage: "Critical",
      id: "DwkdN4lm3s",
      description: "Rating label for a critical localisation audit score",
    }),
    dimensionTechnical: intl.formatMessage({
      defaultMessage: "Technical Audit",
      id: "AZ/tuZUJoO",
      description: "Label for the technical dimension on a localisation audit result",
    }),
    dimensionLinguistic: intl.formatMessage({
      defaultMessage: "Linguistic Audit",
      id: "v32CGJfAAS",
      description: "Label for the linguistic dimension on a localisation audit result",
    }),
    dimensionContextual: intl.formatMessage({
      defaultMessage: "Contextual Audit",
      id: "46WEusZVEg",
      description: "Label for the contextual dimension on a localisation audit result",
    }),
    dimensionVisual: intl.formatMessage({
      defaultMessage: "Visual Audit",
      id: "vUbkXURPep",
      description: "Label for the visual dimension on a localisation audit result",
    }),
    dimensionTechnicalShort: intl.formatMessage({
      defaultMessage: "technical",
      id: "9yTBmhhxTz",
      description: "Short dimension label for a technical localisation audit criterion",
    }),
    dimensionLinguisticShort: intl.formatMessage({
      defaultMessage: "linguistic",
      id: "uqqnJ1ACdX",
      description: "Short dimension label for a linguistic localisation audit criterion",
    }),
    dimensionContextualShort: intl.formatMessage({
      defaultMessage: "contextual",
      id: "k9uqhd9OgG",
      description: "Short dimension label for a contextual localisation audit criterion",
    }),
    dimensionVisualShort: intl.formatMessage({
      defaultMessage: "visual",
      id: "FJYljr7sSS",
      description: "Short dimension label for a visual localisation audit criterion",
    }),
    freshnessLabel: intl.formatMessage({
      defaultMessage: "Audited",
      id: "ZNAwtFUkzx",
      description: "Label for the completed-at date on a localisation audit result",
    }),
    scopeLabel: intl.formatMessage({
      defaultMessage: "Scope",
      id: "X9+GfdK3RZ",
      description: "Label for the scope note on a localisation audit result",
    }),
    scopeBody: intl.formatMessage({
      defaultMessage: "Public smart sample · technical, linguistic, contextual, and visual credits",
      id: "eKfFOCj/Jd",
      description: "Scope description on a localisation audit result",
    }),
    confidenceLabel: intl.formatMessage({
      defaultMessage: "Confidence",
      id: "A7ZIFME2xj",
      description: "Label for the confidence note on a localisation audit result",
    }),
    confidenceBody: intl.formatMessage({
      defaultMessage: "Indicative health check from sampled pages — not a full site crawl.",
      id: "e7tTJ8gdLB",
      description: "Confidence description on a localisation audit result",
    }),
    fixFirstHeading: intl.formatMessage({
      defaultMessage: "Fix first",
      id: "mKyo1eMyN6",
      description: "Heading for the top findings to fix on a localisation audit result",
    }),
    localesHeading: intl.formatMessage({
      defaultMessage: "Detected locales",
      id: "OJQchlMSC5",
      description: "Heading for detected locales on a localisation audit result",
    }),
    findingsHeading: intl.formatMessage({
      defaultMessage: "Headline findings",
      id: "heyfa1q/+8",
      description: "Heading for headline findings on a localisation audit result",
    }),
    unlockHeading: intl.formatMessage({
      defaultMessage: "Email me a summary",
      id: "S+w63pqvse",
      description: "Heading for the email-summary form on a localisation audit result",
    }),
    unlockBody: intl.formatMessage({
      defaultMessage:
        "Optional. Enter your work email and we will send a concise summary of this public report.",
      id: "re+MJ8bLl3",
      description: "Body for the email-summary form on a localisation audit result",
    }),
    standingHeading: intl.formatMessage({
      defaultMessage: "How you compare",
      id: "cQ32lI4seX",
      description: "Heading for leaderboard standing on a localisation audit result",
    }),
    standingRank: (values: { rank: number; total: number }) =>
      intl.formatMessage(
        {
          defaultMessage: "Rank #{rank} of {total} public audits",
          id: "KjvUYZIXbF",
          description: "Rank line on a localisation audit result standing section",
        },
        values,
      ),
    standingPercentile: (values: { percentile: number }) =>
      intl.formatMessage(
        {
          defaultMessage: "Top {percentile}% of audited domains",
          id: "F0U2CC+DdD",
          description: "Percentile line on a localisation audit result standing section",
        },
        values,
      ),
    standingAverage: (values: { average: number }) =>
      intl.formatMessage(
        {
          defaultMessage: "Public average: {average}/100",
          id: "KQZH+TKXlh",
          description: "Average-score line on a localisation audit result standing section",
        },
        values,
      ),
    standingCta: intl.formatMessage({
      defaultMessage: "See the full leaderboard",
      id: "TU09/PYmBW",
      description: "CTA linking from a localisation audit result to the public leaderboard",
    }),
    shareHeading: intl.formatMessage({
      defaultMessage: "Share this report",
      id: "haSTp/OWTR",
      description: "Heading for sharing a public localisation audit report",
    }),
    shareBody: intl.formatMessage({
      defaultMessage:
        "This report is public. Share it with your team or post it to start a comparison.",
      id: "5JYazrmkXn",
      description: "Body for sharing a public localisation audit report",
    }),
    shareCopyLink: intl.formatMessage({
      defaultMessage: "Copy report link",
      id: "/IhENYYsH/",
      description: "Button to copy a public localisation audit report link",
    }),
    shareCopied: intl.formatMessage({
      defaultMessage: "Link copied",
      id: "qIu/YA1mT+",
      description: "Confirmation after copying a localisation audit report link",
    }),
    emailLabel: intl.formatMessage({
      defaultMessage: "Work email",
      id: "2z7JtO63bq",
      description: "Label for the work email field on a localisation audit result",
    }),
    emailPlaceholder: intl.formatMessage({
      defaultMessage: "you@company.com",
      id: "Xl40fdGnlz",
      description: "Placeholder for the work email field on a localisation audit result",
    }),
    unlockSubmit: intl.formatMessage({
      defaultMessage: "Email me a summary",
      id: "x7NBkHXEme",
      description: "Submit button for the email-summary form on a completed localisation audit",
    }),
    unlocking: intl.formatMessage({
      defaultMessage: "Sending…",
      id: "ih/69cODWD",
      description: "Pending label while requesting a localisation audit summary email",
    }),
    unlockQueued: intl.formatMessage({
      defaultMessage: "Check your inbox for a summary of this report.",
      id: "PYVkjgnEZG",
      description: "Success message after requesting a completed-audit summary email",
    }),
    requestEmailError: intl.formatMessage({
      defaultMessage: "Could not request the report email.",
      id: "BBEyVbRR3L",
      description: "Error shown when requesting a localisation audit summary email fails",
    }),
    companyIndustryLabel: intl.formatMessage({
      defaultMessage: "Industry",
      id: "ktH+IvcapS",
      description: "Label for the company industry on a localisation audit result",
    }),
    companyProductLabel: intl.formatMessage({
      defaultMessage: "Product",
      id: "2Ma/LzB+bC",
      description: "Label for the company product summary on a localisation audit result",
    }),
    companyBrandVoiceLabel: intl.formatMessage({
      defaultMessage: "Brand voice",
      id: "p/RwNTcexb",
      description: "Label for the company brand voice on a localisation audit result",
    }),
    companyReportEyebrow: intl.formatMessage({
      defaultMessage: "Localisation report",
      id: "6ftVCF2cNF",
      description: "Eyebrow above a public localisation audit company report",
    }),
    findingWhereLabel: intl.formatMessage({
      defaultMessage: "Found here",
      id: "tsmydNZ+N6",
      description: "Label for where a localisation audit finding was observed",
    }),
    findingEvidenceLabel: intl.formatMessage({
      defaultMessage: "What we saw",
      id: "is2cQ1v97u",
      description: "Label for evidence on a localisation audit finding",
    }),
    findingAdviceLabel: intl.formatMessage({
      defaultMessage: "How to fix it",
      id: "mnZVrr1EzK",
      description: "Label for advice on a localisation audit finding",
    }),
    findingConfidence: (values: { confidence: number }) =>
      intl.formatMessage(
        {
          defaultMessage: "{confidence}% confidence",
          id: "igisWP9I+4",
          description: "Confidence suffix on a localisation audit finding",
        },
        values,
      ),
    noFindings: intl.formatMessage({
      defaultMessage: "No findings in this section.",
      id: "i9vIaD8Yuc",
      description: "Empty state when a localisation audit finding list has no items",
    }),
    fullFindingsHeading: intl.formatMessage({
      defaultMessage: "Full findings",
      id: "6YovIP6EMt",
      description: "Heading for the full findings list on a localisation audit result",
    }),
    creditsHeading: intl.formatMessage({
      defaultMessage: "Audit criteria",
      id: "XN2gagpvC2",
      description: "Heading for the criteria list on a localisation audit result",
    }),
    criteriaSummary: (values: { passed: number; failed: number; na: number }) =>
      intl.formatMessage(
        {
          defaultMessage: "{passed} passed · {failed} to fix · {na} not applicable",
          id: "IoY6mjCVOS",
          description: "Summary counts above localisation audit criteria groups",
        },
        values,
      ),
    criteriaNeedsAttentionHeading: (values: { count: number }) =>
      intl.formatMessage(
        {
          defaultMessage: "Needs attention ({count})",
          id: "AJbIBJ8rQ5",
          description: "Heading for failed localisation audit criteria",
        },
        values,
      ),
    criteriaPassedHeading: (values: { count: number }) =>
      intl.formatMessage(
        {
          defaultMessage: "Passed audits ({count})",
          id: "cUEs5UweV5",
          description: "Heading for passed localisation audit criteria",
        },
        values,
      ),
    criteriaNotApplicableHeading: (values: { count: number }) =>
      intl.formatMessage(
        {
          defaultMessage: "Not applicable ({count})",
          id: "z0l+gEjl9l",
          description: "Heading for not-applicable localisation audit criteria",
        },
        values,
      ),
    criteriaPassLabel: intl.formatMessage({
      defaultMessage: "Pass",
      id: "cwqeMFXYQC",
      description: "Status badge for a passed localisation audit criterion",
    }),
    criteriaFailLabel: intl.formatMessage({
      defaultMessage: "Fail",
      id: "RseiYzhfDo",
      description: "Status badge for a failed localisation audit criterion",
    }),
    criteriaNaLabel: intl.formatMessage({
      defaultMessage: "N/A",
      id: "6d57osIkxk",
      description: "Status badge for a not-applicable localisation audit criterion",
    }),
    criteriaExpandPassed: intl.formatMessage({
      defaultMessage: "Show passed audits",
      id: "BQRFXv8ABR",
      description: "Control to expand passed localisation audit criteria",
    }),
    criteriaCollapsePassed: intl.formatMessage({
      defaultMessage: "Hide passed audits",
      id: "flUWk1JFBu",
      description: "Control to collapse passed localisation audit criteria",
    }),
    criteriaExpandNa: intl.formatMessage({
      defaultMessage: "Show not applicable",
      id: "uP6J0sc7cw",
      description: "Control to expand not-applicable localisation audit criteria",
    }),
    criteriaCollapseNa: intl.formatMessage({
      defaultMessage: "Hide not applicable",
      id: "pw9PHi/ZLr",
      description: "Control to collapse not-applicable localisation audit criteria",
    }),
    linguisticHeading: intl.formatMessage({
      defaultMessage: "Linguistic notes",
      id: "tP1cicvIzZ",
      description: "Heading for linguistic notes on a localisation audit result",
    }),
    pagesHeading: intl.formatMessage({
      defaultMessage: "Pages sampled",
      id: "MasHu7akaE",
      description: "Heading for sampled pages on a localisation audit result",
    }),
    sampledPages: (values: { count: number }) =>
      intl.formatMessage(
        {
          defaultMessage:
            "Sampled {count} pages across technical, linguistic, contextual, and visual localisation credits.",
          id: "RQHyujQ0I4",
          description: "Summary of how many pages a localisation audit sampled",
        },
        values,
      ),
    reauditHeading: intl.formatMessage({
      defaultMessage: "Next step",
      id: "20wJJveUDM",
      description: "Heading for the next-step CTA section on a localisation audit result",
    }),
    reauditBodyLow: intl.formatMessage({
      defaultMessage:
        "Critical gaps showed up. Create a workspace to run a deeper registered audit, or book a review with our team.",
      id: "9GZfIBGhFw",
      description: "Next-step body for a low localisation audit score",
    }),
    reauditBodyMid: intl.formatMessage({
      defaultMessage:
        "Solid baseline with room to improve. Create a workspace for continuous locale monitoring, or book an audit review.",
      id: "mS/hL9d9Ru",
      description: "Next-step body for a mid localisation audit score",
    }),
    reauditBodyHigh: intl.formatMessage({
      defaultMessage:
        "Strong localisation signals. Create a workspace to keep locales healthy as you ship, or book a deeper review.",
      id: "q4MSNg1UjH",
      description: "Next-step body for a high localisation audit score",
    }),
    createWorkspace: intl.formatMessage({
      defaultMessage: "Create a workspace",
      id: "fHty0SN0KU",
      description: "CTA to create a workspace from a low-scoring localisation audit",
    }),
    deeperAudit: intl.formatMessage({
      defaultMessage: "Run a deeper registered audit",
      id: "eVmVzJRp/f",
      description: "CTA to start a deeper registered audit from a localisation audit result",
    }),
    claimDomain: intl.formatMessage({
      defaultMessage: "Claim this domain",
      id: "GLCtWIg6Sl",
      description: "CTA to claim a domain from a public localisation audit result",
    }),
    openInWorkspace: intl.formatMessage({
      defaultMessage: "Open in workspace",
      id: "n9PAvhdA7/",
      description: "CTA to open a claimed domain from a localisation audit result",
    }),
    bookReview: intl.formatMessage({
      defaultMessage: "Book an audit review",
      id: "xUdbOFsZxg",
      description: "CTA to book a localisation audit review with the Hyperlocalise team",
    }),
    scoreInterpretationExcellent: intl.formatMessage({
      defaultMessage: "The localised experience is in strong shape.",
      id: "TMD1+Kb+4i",
      description: "Score interpretation for an excellent localisation audit",
    }),
    scoreInterpretationGood: intl.formatMessage({
      defaultMessage: "The website is generally well localised, with some issues to improve.",
      id: "3ji5Nvlz3D",
      description: "Score interpretation for a good localisation audit",
    }),
    scoreInterpretationNeedsImprovement: intl.formatMessage({
      defaultMessage: "Users may encounter noticeable localisation problems.",
      id: "gCHirWHVff",
      description: "Score interpretation for a needs-improvement localisation audit",
    }),
    scoreInterpretationPoor: intl.formatMessage({
      defaultMessage: "Significant localisation gaps are affecting the experience.",
      id: "2E7H5Qc2gc",
      description: "Score interpretation for a poor localisation audit",
    }),
    scoreInterpretationCritical: intl.formatMessage({
      defaultMessage: "The localised experience has major problems that should be addressed.",
      id: "nglFeiQ7o8",
      description: "Score interpretation for a critical localisation audit",
    }),
    methodologyLink: intl.formatMessage({
      defaultMessage: "How we score localisation audits",
      id: "vGQC+xjlop",
      description: "Link to the blog guide explaining localisation audit scoring",
    }),
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
