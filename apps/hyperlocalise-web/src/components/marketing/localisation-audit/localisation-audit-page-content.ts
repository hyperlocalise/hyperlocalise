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
      defaultMessage: "Up to two, separated by commas. We'll look more closely at these.",
      id: "VN0xcE3Kek",
      description: "Hint under the optional focus languages field on the localisation audit form",
    }),
    crawlAccessNoteBody: intl.formatMessage({
      defaultMessage:
        "If your site uses a firewall, CDN, bot check, or login wall, allow ordinary browser traffic to public pages so we can complete the audit.",
      id: "Xd2aSOHzDN",
      description: "Guidance for site owners to allow the localisation audit crawler",
    }),
    crawlAccessNoteUserAgent: intl.formatMessage({
      defaultMessage: "User agent",
      id: "gyNaN2JbUy",
      description: "Label for the localisation audit crawler user agent",
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
    notices: [
      {
        title: intl.formatMessage({
          defaultMessage: "Technical",
          id: "26WPvvCIx0",
          description:
            "Title of the technical dimension on the localisation audit landing page methodology",
        }),
        body: intl.formatMessage({
          defaultMessage:
            "Can people and search engines find the right version of each page — hreflang, routing, sitemaps?",
          id: "SYIZFG7njP",
          description:
            "Body of the technical dimension on the localisation audit landing page methodology",
        }),
      },
      {
        title: intl.formatMessage({
          defaultMessage: "Linguistic",
          id: "DoXSBl+jxH",
          description:
            "Title of the linguistic dimension on the localisation audit landing page methodology",
        }),
        body: intl.formatMessage({
          defaultMessage:
            "Is every page fully translated, and does the writing still sound like you?",
          id: "3IN5K2pGkM",
          description:
            "Body of the linguistic dimension on the localisation audit landing page methodology",
        }),
      },
      {
        title: intl.formatMessage({
          defaultMessage: "Contextual",
          id: "wEfVjS52RW",
          description:
            "Title of the contextual dimension on the localisation audit landing page methodology",
        }),
        body: intl.formatMessage({
          defaultMessage: "Do prices, dates, buttons, and examples make sense in each market?",
          id: "vhieXbkbZZ",
          description:
            "Body of the contextual dimension on the localisation audit landing page methodology",
        }),
      },
      {
        title: intl.formatMessage({
          defaultMessage: "Visual",
          id: "fhU1eNTuT6",
          description:
            "Title of the visual dimension on the localisation audit landing page methodology",
        }),
        body: intl.formatMessage({
          defaultMessage: "Do layouts, fonts, and images hold up when the text gets longer?",
          id: "tGpj/Eb7w4",
          description:
            "Body of the visual dimension on the localisation audit landing page methodology",
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
    heroEyebrow: intl.formatMessage({
      defaultMessage: "Free localisation audit",
      id: "q6qq+eJm6l",
      description: "Eyebrow above the headline on the localisation audit landing page",
    }),
    heroFactSpeed: intl.formatMessage({
      defaultMessage: "Results in 1–3 minutes",
      id: "MfVWtzqnIQ",
      description: "Trust fact under the audit form on the localisation audit landing page",
    }),
    heroFactScope: intl.formatMessage({
      defaultMessage: "Public pages only, never logged in",
      id: "TfI9AnwYOK",
      description: "Trust fact under the audit form on the localisation audit landing page",
    }),
    heroFactChecks: (values: { checks: number }) =>
      intl.formatMessage(
        {
          defaultMessage: "{checks} checks across 4 dimensions",
          id: "JKGBq8hN2k",
          description: "Trust fact under the audit form on the localisation audit landing page",
        },
        values,
      ),
    focusToggle: intl.formatMessage({
      defaultMessage: "Focus on specific languages",
      id: "vMsrvarQKp",
      description:
        "Button that reveals the optional focus languages field on the localisation audit landing page",
    }),
    exampleReportLabel: intl.formatMessage({
      defaultMessage: "Example report",
      id: "NPRPX7MaAo",
      description:
        "Label on the illustrative sample report card on the localisation audit landing page",
    }),
    exampleReportSite: intl.formatMessage({
      defaultMessage: "Your site",
      id: "P4BmkDDMFU",
      description:
        "Placeholder site name on the illustrative sample report card on the localisation audit landing page",
    }),
    scoringHeading: intl.formatMessage({
      defaultMessage: "How the score works",
      id: "lFh1uklTox",
      description: "Heading for the scoring explainer on the localisation audit landing page",
    }),
    scoringSubcopy: intl.formatMessage({
      defaultMessage:
        "Every site gets the same checks with the same weights, so you can compare scores across sites and over time.",
      id: "5jmxLZ2HOa",
      description:
        "Supporting copy for the scoring explainer on the localisation audit landing page",
    }),
    scoringDimensionShare: (values: { percent: number }) =>
      intl.formatMessage(
        {
          defaultMessage: "{percent}% of the score",
          id: "QOTLUcG5qS",
          description:
            "Share of the overall score carried by one audit dimension on the localisation audit landing page",
        },
        values,
      ),
    scoringDimensionChecks: (values: { checks: number }) =>
      intl.formatMessage(
        {
          defaultMessage: "{checks, plural, one {# check} other {# checks}}",
          id: "r97emx0LZj",
          description:
            "Number of checks in one audit dimension on the localisation audit landing page",
        },
        values,
      ),
    scoringStepMeasureTitle: intl.formatMessage({
      defaultMessage: "Measure each check",
      id: "Xje9ahL4QG",
      description: "Title of scoring step one on the localisation audit landing page",
    }),
    scoringStepMeasureBody: intl.formatMessage({
      defaultMessage:
        "Each check scores 0–100 based on what we find on the sampled pages: markup, URLs, copy and rendered layouts.",
      id: "FpN3rnPsKf",
      description: "Body of scoring step one on the localisation audit landing page",
    }),
    scoringStepWeightTitle: intl.formatMessage({
      defaultMessage: "Weight what matters",
      id: "h7YN2sTjNN",
      description: "Title of scoring step two on the localisation audit landing page",
    }),
    scoringStepWeightBody: (values: { max: number }) =>
      intl.formatMessage(
        {
          defaultMessage:
            "Checks that stop people or search engines from finding the right page count more, up to {max}× a minor check.",
          id: "9svghWzz9z",
          description: "Body of scoring step two on the localisation audit landing page",
        },
        values,
      ),
    scoringStepCoverageTitle: intl.formatMessage({
      defaultMessage: "Adjust for language coverage",
      id: "PUFdzvzYEk",
      description: "Title of scoring step three on the localisation audit landing page",
    }),
    scoringStepCoverageBody: intl.formatMessage({
      defaultMessage:
        "Sites with fewer languages are scaled down, so a site in one language can't top the leaderboard.",
      id: "o7+5KQDmgX",
      description: "Body of scoring step three on the localisation audit landing page",
    }),
    scoringCoverageLocales: (values: { count: number }) =>
      intl.formatMessage(
        {
          defaultMessage: "{count, plural, =0 {No languages} one {# language} other {# languages}}",
          id: "qkSeIqaeSL",
          description:
            "Number of languages in the coverage factor table on the localisation audit landing page",
        },
        values,
      ),
    scoringCoverageLocalesPlus: (values: { count: number }) =>
      intl.formatMessage(
        {
          defaultMessage: "{count} or more languages",
          id: "V/3PJDmV4F",
          description:
            "Top row of the coverage factor table on the localisation audit landing page",
        },
        values,
      ),
    thresholdsHeading: intl.formatMessage({
      defaultMessage: "What each check result means",
      id: "B3O6RmNRrM",
      description: "Heading for the check result legend on the localisation audit landing page",
    }),
    thresholdPassLabel: intl.formatMessage({
      defaultMessage: "Pass",
      id: "6eYIcycRJa",
      description: "Legend label for a passed check on the localisation audit landing page",
    }),
    thresholdPassBody: intl.formatMessage({
      defaultMessage: "Meets the bar. Nothing to do.",
      id: "f+03CnOQns",
      description: "Legend explanation for a passed check on the localisation audit landing page",
    }),
    thresholdWatchLabel: intl.formatMessage({
      defaultMessage: "Watch",
      id: "LTzJmEDEky",
      description:
        "Legend label for a check close to passing on the localisation audit landing page",
    }),
    thresholdWatchBody: intl.formatMessage({
      defaultMessage: "Close to passing. Worth a look.",
      id: "NGePCzoCQg",
      description:
        "Legend explanation for a check close to passing on the localisation audit landing page",
    }),
    thresholdFixLabel: intl.formatMessage({
      defaultMessage: "Fix",
      id: "nAO4tt9UbS",
      description: "Legend label for a failing check on the localisation audit landing page",
    }),
    thresholdFixBody: intl.formatMessage({
      defaultMessage: "Costs you points. Fix these first.",
      id: "J7LEq6sUbI",
      description: "Legend explanation for a failing check on the localisation audit landing page",
    }),
    thresholdAiLabel: intl.formatMessage({
      defaultMessage: "AI-reviewed",
      id: "Qk1QL2BxcT",
      description: "Legend label for an AI-assessed check on the localisation audit landing page",
    }),
    thresholdAiBody: intl.formatMessage({
      defaultMessage:
        "Judged by AI from samples. Flagged for review but never counted in the score.",
      id: "Rdk2oirDw9",
      description:
        "Legend explanation for an AI-assessed check on the localisation audit landing page",
    }),
    thresholdBelow: (values: { value: number }) =>
      intl.formatMessage(
        {
          defaultMessage: "Below {value}",
          id: "NGLZAKg5JL",
          description:
            "Score range label for scores under a threshold on the localisation audit landing page",
        },
        values,
      ),
    thresholdNotScored: intl.formatMessage({
      defaultMessage: "Not scored",
      id: "YxHZB+SRUr",
      description:
        "Score range label for checks that do not affect the score on the localisation audit landing page",
    }),
    faqHeading: intl.formatMessage({
      defaultMessage: "Questions",
      id: "GgENm3BRpj",
      description: "Heading for the FAQ section on the localisation audit landing page",
    }),
    faqScopeQuestion: intl.formatMessage({
      defaultMessage: "What do you look at?",
      id: "pAtOBvLaY6",
      description: "FAQ question about audit scope on the localisation audit landing page",
    }),
    faqPublicQuestion: intl.formatMessage({
      defaultMessage: "Is my report public?",
      id: "x9DcqOH0Xj",
      description: "FAQ question about report visibility on the localisation audit landing page",
    }),
    faqBlockedQuestion: intl.formatMessage({
      defaultMessage: "What if my site blocks the audit?",
      id: "cuXvOghZMR",
      description: "FAQ question about crawler access on the localisation audit landing page",
    }),
    faqFindingQuestion: intl.formatMessage({
      defaultMessage: "What does a finding look like?",
      id: "aEy8L3zxvF",
      description: "FAQ question about report findings on the localisation audit landing page",
    }),
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
    blockedTitle: intl.formatMessage({
      defaultMessage: "Audit blocked",
      id: "fU9GF3etrw",
      description: "Title when a domain blocks the public localisation audit crawler",
    }),
    blockedBody: intl.formatMessage({
      defaultMessage: "This domain blocked the crawler, so we did not score the site.",
      id: "i/10E+WnLM",
      description: "Body explaining that a blocked crawl did not produce a localisation score",
    }),
    blockedGuidance: intl.formatMessage({
      defaultMessage:
        "Allow ordinary browser traffic through your firewall, CDN, bot protection, or login wall, then start a new audit.",
      id: "fC01ZiLItd",
      description: "Guidance for a site owner whose domain blocked the localisation audit crawler",
    }),
    blockedUserAgent: intl.formatMessage({
      defaultMessage: "User agent",
      id: "ryGOjbG4Wd",
      description: "Label for the blocked localisation audit crawler user agent",
    }),
    startNewAudit: intl.formatMessage({
      defaultMessage: "Start a new audit",
      id: "k3eu1T7STw",
      description: "Button to start a fresh localisation audit after a domain block",
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
    freshnessLabel: intl.formatMessage({
      defaultMessage: "Audited",
      id: "ZNAwtFUkzx",
      description: "Label for the completed-at date on a localisation audit result",
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
    unlockBody: intl.formatMessage({
      defaultMessage:
        "We'll email a short summary — score, top fixes, and a link back to this report — so it's easy to forward.",
      id: "NDXmA1pbVL",
      description: "Body for the email-summary form on a localisation audit result",
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
    companyProductLabel: intl.formatMessage({
      defaultMessage: "Product",
      id: "2Ma/LzB+bC",
      description: "Label for the company product summary on a localisation audit result",
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
    otherFindingsHeading: intl.formatMessage({
      defaultMessage: "Other findings",
      id: "TA6Yq+oOXe",
      description:
        "Heading for localisation audit findings that are not shown under a failing or watched criterion",
    }),
    otherFindingsBody: intl.formatMessage({
      defaultMessage: "Findings not listed under a criterion above.",
      id: "EKyvEH55l4",
      description: "Intro under the other findings heading on a localisation audit result",
    }),
    fixFirstSeeDetails: intl.formatMessage({
      defaultMessage: "See details",
      id: "7+2d5ot9yA",
      description: "Link from a fix-first item to its full finding on a localisation audit result",
    }),
    evidenceShowMore: intl.formatMessage({
      defaultMessage: "Show more",
      id: "L1kbT9LQu4",
      description: "Expands long evidence on a localisation audit finding",
    }),
    evidenceShowLess: intl.formatMessage({
      defaultMessage: "Show less",
      id: "p0+iOS1jKZ",
      description: "Collapses long evidence on a localisation audit finding",
    }),
    reportNavLabel: intl.formatMessage({
      defaultMessage: "Report sections",
      id: "R4pAZFit9e",
      description: "Accessible label for the in-page section links on a localisation audit result",
    }),
    creditsHeading: intl.formatMessage({
      defaultMessage: "Audit criteria",
      id: "XN2gagpvC2",
      description: "Heading for the criteria list on a localisation audit result",
    }),
    criteriaSummary: (values: { passed: number; watch: number; failed: number; na: number }) =>
      intl.formatMessage(
        {
          defaultMessage:
            "{passed} passed · {watch} to watch · {failed} to fix · {na} not applicable",
          id: "674eGK4ons",
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
    criteriaWatchHeading: (values: { count: number }) =>
      intl.formatMessage(
        {
          defaultMessage: "Worth a look ({count})",
          id: "GwtVJbyKbN",
          description:
            "Heading for localisation audit criteria that scored just under the pass threshold",
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
    criteriaWatchLabel: intl.formatMessage({
      defaultMessage: "Watch",
      id: "fO4X7c0JA4",
      description:
        "Status badge for a localisation audit criterion that scored just under the pass threshold",
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
    criteriaAiAssessedHeading: (values: { count: number }) =>
      intl.formatMessage(
        {
          defaultMessage: "AI-assessed, not scored ({count})",
          id: "58rI5iuou2",
          description:
            "Heading for localisation audit criteria reviewed by a language model that do not affect the score",
        },
        values,
      ),
    criteriaAiAssessedBody: intl.formatMessage({
      defaultMessage:
        "A language model reviewed these checks. They can point you to issues worth a look, but they do not affect the score because model judgements can vary between runs.",
      id: "Clx4aOGiiD",
      description:
        "Explanation of why AI-assessed localisation audit criteria are excluded from the score",
    }),
    criteriaExpandAiAssessed: intl.formatMessage({
      defaultMessage: "Show AI-assessed checks",
      id: "/q7tj4NaYr",
      description: "Control to expand AI-assessed localisation audit criteria",
    }),
    criteriaCollapseAiAssessed: intl.formatMessage({
      defaultMessage: "Hide AI-assessed checks",
      id: "FKhi2+Kwrj",
      description: "Control to collapse AI-assessed localisation audit criteria",
    }),
    scoreCoverageAdjustment: (values: { percent: number }) =>
      intl.formatMessage(
        {
          defaultMessage:
            "The overall score is reduced by {percent}% because we found few locales on the site.",
          id: "CjUoMPR8JB",
          description:
            "Note under the localisation audit score explaining the locale coverage adjustment",
        },
        values,
      ),
    scoreLegacyMethodology: intl.formatMessage({
      defaultMessage:
        "This score uses an earlier scoring method. Run the audit again to compare it with current reports.",
      id: "EaqWpTaaGg",
      description:
        "Note on a localisation audit report that was scored before the current methodology",
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
    pagesExpand: (values: { count: number }) =>
      intl.formatMessage(
        {
          defaultMessage: "{count, plural, one {Show # page} other {Show all # pages}}",
          id: "8SYhKATZ36",
          description: "Control to expand the sampled pages list on a localisation audit result",
        },
        values,
      ),
    pagesCollapse: intl.formatMessage({
      defaultMessage: "Hide pages",
      id: "ljM3NRfDH1",
      description: "Control to collapse the sampled pages list on a localisation audit result",
    }),
    pagesHttpStatus: (values: { status: number }) =>
      intl.formatMessage(
        {
          defaultMessage: "HTTP {status}",
          id: "aZJfFdGVsu",
          description:
            "Badge for a sampled page that did not load successfully on a localisation audit result",
        },
        values,
      ),
    localeSourceHreflang: intl.formatMessage({
      defaultMessage: "hreflang",
      id: "4OtY5abyua",
      description: "Detected-locale source: found in hreflang link tags",
    }),
    localeSourceHtmlLang: intl.formatMessage({
      defaultMessage: "page language",
      id: "xWfYWzBNtl",
      description: "Detected-locale source: found in the html lang attribute",
    }),
    localeSourceUrlPrefix: intl.formatMessage({
      defaultMessage: "URL path",
      id: "Zmyn4vetdi",
      description: "Detected-locale source: found as a URL path prefix such as /fr/",
    }),
    localeSourceUrlSubdomain: intl.formatMessage({
      defaultMessage: "subdomain",
      id: "lgwEY2kWZQ",
      description: "Detected-locale source: found as a subdomain such as fr.example.com",
    }),
    localeSourceFocus: intl.formatMessage({
      defaultMessage: "you asked",
      id: "DDkCNI/bRQ",
      description: "Detected-locale source: requested by the visitor as a focus language",
    }),
    localesEmpty: intl.formatMessage({
      defaultMessage: "We did not find any language versions on the sampled pages.",
      id: "S46qITlTKj",
      description: "Empty state when a localisation audit detected no locales",
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
        "Critical gaps showed up. Claim this domain to track fixes in a workspace, or book a review with our team.",
      id: "8aChGc1qtS",
      description: "Next-step body for a low localisation audit score",
    }),
    reauditBodyMid: intl.formatMessage({
      defaultMessage:
        "Solid baseline with room to improve. Claim this domain to monitor locales as you ship, or book an audit review.",
      id: "oFnZSOUSL4",
      description: "Next-step body for a mid localisation audit score",
    }),
    reauditBodyHigh: intl.formatMessage({
      defaultMessage:
        "Strong localisation signals. Claim this domain to keep locales healthy as you ship, or book a deeper review.",
      id: "5ZM/k6uYbC",
      description: "Next-step body for a high localisation audit score",
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
    runningHeading: (values: { domain: string }) =>
      intl.formatMessage(
        {
          defaultMessage: "Auditing {domain}",
          id: "re5SgeGMLQ",
          description:
            "Heading while a localisation audit runs on a localisation audit result page",
        },
        values,
      ),
    liveHeading: intl.formatMessage({
      defaultMessage: "Found so far",
      id: "dCrcIcRfS2",
      description:
        "Heading for the live crawl summary while an audit runs on a localisation audit result page",
    }),
    liveWaiting: intl.formatMessage({
      defaultMessage: "Waiting for the first pages…",
      id: "J3KlN+W33c",
      description:
        "Live crawl summary before any page is sampled on a localisation audit result page",
    }),
    livePages: (values: { count: number }) =>
      intl.formatMessage(
        {
          defaultMessage: "{count, plural, one {# page sampled} other {# pages sampled}}",
          id: "9gSVnFD8Pb",
          description:
            "Live count of sampled pages while an audit runs on a localisation audit result page",
        },
        values,
      ),
    liveLanguages: (values: { count: number }) =>
      intl.formatMessage(
        {
          defaultMessage:
            "{count, plural, =0 {No languages found yet} one {# language found} other {# languages found}}",
          id: "9tchrBuFpi",
          description:
            "Live count of detected languages while an audit runs on a localisation audit result page",
        },
        values,
      ),
    liveAnalyzing: intl.formatMessage({
      defaultMessage: "Now checking these pages against every audit check.",
      id: "FCjafnfiZy",
      description:
        "Live crawl summary note once crawling finishes on a localisation audit result page",
    }),
    overviewChecksPassed: intl.formatMessage({
      defaultMessage: "Checks passed",
      id: "spO0rZndA4",
      description: "Label for the checks passed stat on a localisation audit result page",
    }),
    overviewChecksValue: (values: { passed: number; total: number }) =>
      intl.formatMessage(
        {
          defaultMessage: "{passed} of {total}",
          id: "psXbxeB5Gm",
          description: "Value for the checks passed stat on a localisation audit result page",
        },
        values,
      ),
    overviewToFix: intl.formatMessage({
      defaultMessage: "Checks to fix",
      id: "WFGGfbNq0L",
      description: "Label for the failing checks stat on a localisation audit result page",
    }),
    overviewLanguages: intl.formatMessage({
      defaultMessage: "Languages found",
      id: "hj/m1ef3J6",
      description: "Label for the detected languages stat on a localisation audit result page",
    }),
    overviewPages: intl.formatMessage({
      defaultMessage: "Pages sampled",
      id: "a5rqDl0nQy",
      description: "Label for the sampled pages stat on a localisation audit result page",
    }),
    overviewRank: intl.formatMessage({
      defaultMessage: "Public rank",
      id: "Kacs8vBvJh",
      description: "Label for the leaderboard rank stat on a localisation audit result page",
    }),
    overviewRankValue: (values: { rank: number; total: number }) =>
      intl.formatMessage(
        {
          defaultMessage: "#{rank} of {total}",
          id: "w6oCFrAuXh",
          description: "Value for the leaderboard rank stat on a localisation audit result page",
        },
        values,
      ),
    dimensionsHeading: intl.formatMessage({
      defaultMessage: "Score by dimension",
      id: "QBPMBBZvas",
      description: "Heading for the dimension score card on a localisation audit result page",
    }),
    dimensionShare: (values: { percent: number }) =>
      intl.formatMessage(
        {
          defaultMessage: "{percent}% of score",
          id: "//QJ3Z/+ZO",
          description:
            "Share of the overall score carried by a dimension on a localisation audit result page",
        },
        values,
      ),
    dimensionToFix: (values: { count: number }) =>
      intl.formatMessage(
        {
          defaultMessage: "{count} to fix",
          id: "l2/rWXKcSi",
          description: "Failing check count for a dimension on a localisation audit result page",
        },
        values,
      ),
    dimensionToWatch: (values: { count: number }) =>
      intl.formatMessage(
        {
          defaultMessage: "{count} to watch",
          id: "EON1Lu3hAe",
          description: "Watch check count for a dimension on a localisation audit result page",
        },
        values,
      ),
    dimensionAllPassed: intl.formatMessage({
      defaultMessage: "All checks passed",
      id: "rH6bMXLw4f",
      description:
        "Dimension summary when every scored check passed on a localisation audit result page",
    }),
    dimensionNotMeasured: intl.formatMessage({
      defaultMessage: "Not measured on this site",
      id: "UQfmUbFpLw",
      description:
        "Dimension summary when no check could be scored on a localisation audit result page",
    }),
    fixFirstSubcopy: intl.formatMessage({
      defaultMessage: "Ranked by how many points each fix would add to your score.",
      id: "NUgUDRmaBN",
      description: "Supporting copy for the fix first section on a localisation audit result page",
    }),
    fixFirstGain: (values: { points: string }) =>
      intl.formatMessage(
        {
          defaultMessage: "+{points} pts",
          id: "MsVi4t8UD6",
          description:
            "Points a fix would add to the overall score on a localisation audit result page",
        },
        values,
      ),
    fixFirstGainLabel: intl.formatMessage({
      defaultMessage: "potential gain",
      id: "J6dpkmdNHF",
      description: "Caption under the points a fix would add on a localisation audit result page",
    }),
    fixFirstViewCheck: intl.formatMessage({
      defaultMessage: "View check",
      id: "SeXAIH1H+r",
      description: "Link from a fix first card to its check on a localisation audit result page",
    }),
    breakdownHeading: intl.formatMessage({
      defaultMessage: "How your score is built",
      id: "64ML6tGnxx",
      description: "Heading for the score breakdown section on a localisation audit result page",
    }),
    breakdownSubcopy: intl.formatMessage({
      defaultMessage: "Every lost point comes from a specific check. Close the biggest gaps first.",
      id: "chtmx2IDC3",
      description:
        "Supporting copy for the score breakdown section on a localisation audit result page",
    }),
    breakdownStart: intl.formatMessage({
      defaultMessage: "Perfect score",
      id: "MwSO0+vGDF",
      description: "First row of the score breakdown on a localisation audit result page",
    }),
    breakdownLost: (values: { dimension: string }) =>
      intl.formatMessage(
        {
          defaultMessage: "Lost on {dimension}",
          id: "UEGzjQDo3v",
          description:
            "Score breakdown row for points lost in one dimension on a localisation audit result page",
        },
        values,
      ),
    breakdownWeighted: (values: { count: number }) =>
      intl.formatMessage(
        {
          defaultMessage:
            "Weighted average of {count, plural, one {# measured check} other {# measured checks}}",
          id: "uOsoHzdrB/",
          description:
            "Score breakdown row for the weighted average before coverage on a localisation audit result page",
        },
        values,
      ),
    breakdownCoverage: (values: { factor: string }) =>
      intl.formatMessage(
        {
          defaultMessage: "Language coverage × {factor}",
          id: "7DthU3HVWr",
          description:
            "Score breakdown row for the locale coverage adjustment on a localisation audit result page",
        },
        values,
      ),
    breakdownFinal: intl.formatMessage({
      defaultMessage: "Your score",
      id: "oq5tlWuBk9",
      description: "Final row of the score breakdown on a localisation audit result page",
    }),
    breakdownMismatch: intl.formatMessage({
      defaultMessage:
        "This report was scored under earlier rules, so we can't break the score down by check. Re-run the audit to get the full breakdown.",
      id: "jJeB2ae5xE",
      description:
        "Note when the score breakdown cannot reproduce a legacy score on a localisation audit result page",
    }),
    checksFilterLabel: intl.formatMessage({
      defaultMessage: "Filter checks by dimension",
      id: "01FJo1wB1v",
      description:
        "Accessible label for the check dimension filter on a localisation audit result page",
    }),
    checksFilterAll: intl.formatMessage({
      defaultMessage: "All",
      id: "ltUMSD0wJw",
      description:
        "Filter option showing checks from every dimension on a localisation audit result page",
    }),
    checkCost: (values: { points: string }) =>
      intl.formatMessage(
        {
          defaultMessage: "−{points} pts",
          id: "ToCen1+d0x",
          description: "Points a check costs the overall score on a localisation audit result page",
        },
        values,
      ),
    checkRubricLabel: intl.formatMessage({
      defaultMessage: "What we check",
      id: "EbVzh1bCcZ",
      description: "Label above a check's rubric on a localisation audit result page",
    }),
    checkNoFindings: intl.formatMessage({
      defaultMessage: "No issues recorded for this check.",
      id: "La2J6ANaGA",
      description: "Expanded check with no findings on a localisation audit result page",
    }),
    checkAiBadge: intl.formatMessage({
      defaultMessage: "AI-reviewed",
      id: "/wq2Fueqfr",
      description:
        "Badge for an AI-assessed check that does not affect the score on a localisation audit result page",
    }),
    scoreBandsLabel: intl.formatMessage({
      defaultMessage: "Score bands",
      id: "WUNo2jL+pM",
      description: "Accessible label for the score band scale on a localisation audit result page",
    }),
    emailSummaryHeading: intl.formatMessage({
      defaultMessage: "Get a copy by email",
      id: "b4sdHwdRw/",
      description:
        "Heading for the email summary form in the next step section on a localisation audit result page",
    }),
  };
}

export type LocalisationAuditResultCopy = ReturnType<typeof getLocalisationAuditResultCopy>;

export type LocalisationAuditPageCopy = ReturnType<typeof getLocalisationAuditPageCopy>;

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
