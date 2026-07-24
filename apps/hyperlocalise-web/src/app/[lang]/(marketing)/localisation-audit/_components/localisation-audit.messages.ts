"use client";

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
import { defineMessages } from "react-intl";

export const localisationAuditMessages = defineMessages({
  eyebrow: {
    defaultMessage: "Free localisation health audit",
    id: "QiRgMV5D5m",
    description: "Eyebrow above the localisation audit landing page heading",
  },
  title: {
    defaultMessage: "How ready is your website for global customers?",
    id: "eNlgAWtuHj",
    description: "Main heading on the localisation audit landing page",
  },
  lead: {
    defaultMessage:
      "Get an evidence-led health check covering technical setup, translation quality, and market fit. See your first findings before sharing any contact details.",
    id: "TD37NN4wcF",
    description: "Introductory paragraph on the localisation audit landing page",
  },
  urlLabel: {
    defaultMessage: "Website URL",
    id: "HGNA8Jzft3",
    description: "Label for the website URL field",
  },
  urlPlaceholder: {
    defaultMessage: "https://example.com/fr",
    id: "H6WGqCgI47",
    description: "Placeholder for the website URL field",
  },
  urlDescription: {
    defaultMessage:
      "Use a public page from the locale you want to assess. We only inspect that page and explicit locale alternatives.",
    id: "d/iklzyWkL",
    description: "Help text below the website URL field",
  },
  startAudit: {
    defaultMessage: "Check my website",
    id: "dXT/a0dKYC",
    description: "Button that starts a localisation audit",
  },
  discoveryTitle: {
    defaultMessage: "Discovering your locale setup",
    id: "IclkH2nRam",
    description: "Heading shown while locale alternatives are discovered",
  },
  discoveryDescription: {
    defaultMessage:
      "We are checking the submitted page, document language, hreflang links, and locale navigation.",
    id: "ThfNx+zDbl",
    description: "Description shown while locale alternatives are discovered",
  },
  confirmEyebrow: {
    defaultMessage: "Confirm the audit context",
    id: "Ehhlog/nK7",
    description: "Eyebrow above locale and market confirmation",
  },
  confirmTitle: {
    defaultMessage: "We found your localisation footprint",
    id: "LilQ/7MatW",
    description: "Heading above locale and market confirmation",
  },
  detectedLocale: {
    defaultMessage: "Detected locale",
    id: "dZaWoBfTmV",
    description: "Label for the automatically detected locale",
  },
  alternatives: {
    defaultMessage: "Discovered alternatives",
    id: "pJdtVbInId",
    description: "Label for discovered locale alternatives",
  },
  noAlternatives: {
    defaultMessage: "No explicit locale alternatives were found on this page.",
    id: "xPpUL07RES",
    description: "Empty state when no locale alternatives are found",
  },
  targetLocaleLabel: {
    defaultMessage: "Target locale",
    id: "9zoBMpc6Se",
    description: "Label for the target locale field",
  },
  targetLocaleDescription: {
    defaultMessage: "Use a BCP 47 locale such as fr-FR, de-DE, or en-GB.",
    id: "bVlzg8F+ca",
    description: "Help text for the target locale field",
  },
  targetMarketLabel: {
    defaultMessage: "Target market country code",
    id: "yprulwCnhD",
    description: "Label for the target market field",
  },
  targetMarketPlaceholder: {
    defaultMessage: "FR",
    id: "CoXn5VFRR1",
    description: "Placeholder for the target market field",
  },
  targetMarketDescription: {
    defaultMessage: "Use a two-letter ISO country code such as FR, DE, or GB.",
    id: "sEAQ4SkKdC",
    description: "Help text for the target market field",
  },
  runAudit: {
    defaultMessage: "Run the full health check",
    id: "+YlTkw0Ix2",
    description: "Button that confirms locale and market and runs the audit",
  },
  changeUrl: {
    defaultMessage: "Use a different URL",
    id: "Qu/Jwr9p3E",
    description: "Button that returns to the website URL step",
  },
  auditProgressTitle: {
    defaultMessage: "Building your evidence-led audit",
    id: "eC0BjCOLKg",
    description: "Heading shown while the audit runs",
  },
  auditProgressDescription: {
    defaultMessage:
      "We are checking technical readiness, reviewing customer-facing language, and evaluating the target-market experience.",
    id: "fLRLdWOPMG",
    description: "Description shown while the audit runs",
  },
  progressDiscover: {
    defaultMessage: "Locale discovery complete",
    id: "vpW8rC5/ef",
    description: "Completed audit progress step for locale discovery",
  },
  progressTechnical: {
    defaultMessage: "Checking technical localisation signals",
    id: "FK3silV7Zf",
    description: "Audit progress step for technical checks",
  },
  progressLanguage: {
    defaultMessage: "Reviewing language and market evidence",
    id: "/dg1YuoOmY",
    description: "Audit progress step for language and market checks",
  },
  progressLabel: {
    defaultMessage: "Audit progress",
    id: "uALKQ/bcAx",
    description: "Accessible label for audit progress",
  },
  technicalReadinessShort: {
    defaultMessage: "Technical readiness",
    id: "yAjmSKLE/o",
    description: "Short benefit label for technical localisation readiness",
  },
  languageQualityShort: {
    defaultMessage: "Language quality",
    id: "DxoQlK1C3S",
    description: "Short benefit label for language quality",
  },
  marketFitShort: {
    defaultMessage: "Market fit",
    id: "wE62n9OzMb",
    description: "Short benefit label for market fit",
  },
  notDetected: {
    defaultMessage: "Not detected",
    id: "voLjxXNTIH",
    description: "Fallback when the submitted page locale cannot be detected",
  },
  requestFailed: {
    defaultMessage: "We couldn't complete that request. Please try again.",
    id: "bA1sXATwWq",
    description: "Fallback error shown when an audit API request fails",
  },
  retry: {
    defaultMessage: "Try again",
    id: "xCk/UtnXH/",
    description: "Button that retries a failed audit action",
  },
  unlockTitle: {
    defaultMessage: "Unlock the complete report",
    id: "oJ6y2R4an4",
    description: "Heading above the work email report unlock form",
  },
  unlockDescription: {
    defaultMessage:
      "Get every finding, its evidence, business impact, and a practical recommendation. We will also email a private access link.",
    id: "z5B4sRmCaQ",
    description: "Description of what the visitor receives after unlocking",
  },
  workEmailLabel: {
    defaultMessage: "Work email",
    id: "kl7OHQHi3d",
    description: "Label for the required work email field",
  },
  nameLabel: {
    defaultMessage: "Name (optional)",
    id: "BMYClNiBi9",
    description: "Label for the optional name field",
  },
  unlockButton: {
    defaultMessage: "Email me the full report",
    id: "wfSk0ebnkG",
    description: "Button that unlocks the private audit report",
  },
  preparingReport: {
    defaultMessage: "Preparing your private report",
    id: "bDKd8Zqp+d",
    description: "Progress label shown while the private report is unlocked",
  },
  unlockedTitle: {
    defaultMessage: "Your complete report is ready",
    id: "4i+4Te/1Wj",
    description: "Heading shown when the private report link is ready",
  },
  openReport: {
    defaultMessage: "Open the complete report",
    id: "5pKaWvWB+S",
    description: "Link that opens the private audit report",
  },
  reportEyebrow: {
    defaultMessage: "Localisation health",
    id: "/69VfAUag5",
    description: "Eyebrow above an audit report heading",
  },
  reportTitle: {
    defaultMessage: "Localisation health report",
    id: "IYGIANb1Va",
    description: "Heading for public and private localisation audit reports",
  },
  auditedOn: {
    defaultMessage: "Audited {date}",
    id: "PUhGAWoLRR",
    description: "Audit date shown on a report",
  },
  overallScore: {
    defaultMessage: "Overall score",
    id: "dXoPyfF4EG",
    description: "Label for the overall audit score",
  },
  technical: {
    defaultMessage: "Technical readiness",
    id: "FqUUKybaOd",
    description: "Label for the technical readiness score",
  },
  linguistic: {
    defaultMessage: "Linguistic quality",
    id: "bdvoCvx2Yj",
    description: "Label for the linguistic quality score",
  },
  market: {
    defaultMessage: "Market experience",
    id: "Dl193MrSIu",
    description: "Label for the market experience score",
  },
  insufficientEvidence: {
    defaultMessage: "Insufficient evidence",
    id: "E8h14FdS5F",
    description: "State shown when a category cannot be scored reliably",
  },
  evaluatedRules: {
    defaultMessage: "{count, plural, one {# rule evaluated} other {# rules evaluated}}",
    id: "vndU973UWB",
    description: "Number of rules evaluated for an audit score",
  },
  previewFindings: {
    defaultMessage: "Highest-impact findings",
    id: "Mh/xcC5aRt",
    description: "Heading above the preview findings list",
  },
  allFindings: {
    defaultMessage: "All findings",
    id: "IelLd3kVog",
    description: "Heading above the complete findings list",
  },
  evidence: {
    defaultMessage: "Evidence",
    id: "6SfJ0+UaZc",
    description: "Label for evidence supporting an audit finding",
  },
  businessImpact: {
    defaultMessage: "Business impact",
    id: "+4AARGw4TH",
    description: "Label for the business impact of an audit finding",
  },
  recommendation: {
    defaultMessage: "Recommended action",
    id: "RTDH8WfqoF",
    description: "Label for an audit finding recommendation",
  },
  confidence: {
    defaultMessage: "Confidence: {value}",
    id: "mmf3D9G6N+",
    description: "Confidence level shown on an audit finding",
  },
  lockedFindings: {
    defaultMessage:
      "{count, plural, one {# additional finding is in the full report} other {# additional findings are in the full report}}",
    id: "BnN4qVzr8S",
    description: "Count of findings hidden behind the email unlock",
  },
  limitations: {
    defaultMessage: "Report limitations",
    id: "Zw9mUkXMO5",
    description: "Heading above audit report limitations",
  },
  limitationsDescription: {
    defaultMessage: "These notes identify evidence the audit could not reliably evaluate.",
    id: "swiSUSAhMW",
    description: "Explanation shown above audit report limitations",
  },
  missingEvidenceNote: {
    defaultMessage: "Missing evidence does not reduce a score.",
    id: "o43UuFVBLP",
    description: "Scoring note shown below report limitations",
  },
  strategyTitle: {
    defaultMessage: "Turn these findings into a localisation plan",
    id: "17og2/qE30",
    description: "Heading above report calls to action",
  },
  strategyDescription: {
    defaultMessage:
      "Book a localisation strategy call to prioritise the highest-impact fixes, or create a workspace to bring review into your delivery workflow.",
    id: "7jR4RVKU2P",
    description: "Description above report calls to action",
  },
  bookCall: {
    defaultMessage: "Book a strategy call",
    id: "uL/Q9PYRdF",
    description: "Primary button for booking a localisation strategy call",
  },
  createWorkspace: {
    defaultMessage: "Create a workspace or sign in",
    id: "2qORT9DJ/g",
    description: "Secondary link for creating a workspace or signing in",
  },
  reportUnavailable: {
    defaultMessage: "No report findings are available yet.",
    id: "aPc3GIB/QJ",
    description: "Empty state when a report has no available findings",
  },
});
