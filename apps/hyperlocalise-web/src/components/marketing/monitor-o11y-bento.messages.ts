"use client";

import { defineMessages } from "react-intl";

export const monitorO11yBentoMessages = defineMessages({
  pageTitle: {
    defaultMessage: "Locale ops observability",
    id: "8bdvniqgMi",
    description: "Main title of the monitoring observability bento illustration",
  },
  releaseWindowBadge: {
    defaultMessage: "Release window active",
    id: "s5vcFBwpaD",
    description: "Badge indicating an active release window on the monitoring bento",
  },
  pageSubtitle: {
    defaultMessage: "Ship confidence across eval health, review debt, and failure modes.",
    id: "WkSev+Z4gd",
    description: "Supporting copy under the monitoring bento title",
  },
  pulseShipSafe: {
    defaultMessage: "Ship-safe locales",
    id: "6XDIPXtsI4",
    description: "Release pulse metric label for ship-safe locale percentage",
  },
  pulseReviewSla: {
    defaultMessage: "Review SLA",
    id: "i4MOxqTP9L",
    description: "Release pulse metric label for review SLA",
  },
  pulseCriticalBlockers: {
    defaultMessage: "Critical blockers",
    id: "MHo9JPmBmB",
    description: "Release pulse metric label for critical blockers",
  },
  readinessEyebrow: {
    defaultMessage: "Release Readiness",
    id: "gllJHQX1Oz",
    description: "Eyebrow above the locale readiness heatmap card",
  },
  readinessTitle: {
    defaultMessage: "Locale readiness heatmap",
    id: "HNW71S2eWf",
    description: "Title of the locale readiness heatmap card",
  },
  columnQuality: {
    defaultMessage: "Quality",
    id: "WnsU0fSENZ",
    description: "Heatmap column label for quality score",
  },
  columnReview: {
    defaultMessage: "Review",
    id: "kBSyk8lLco",
    description: "Heatmap column label for review coverage",
  },
  columnDrift: {
    defaultMessage: "Drift",
    id: "79wF7UTpnH",
    description: "Heatmap column label for drift score",
  },
  columnSync: {
    defaultMessage: "Sync",
    id: "iUfm3OxPfC",
    description: "Heatmap column label for sync freshness",
  },
  columnStatus: {
    defaultMessage: "Status",
    id: "j1zSpi+EHj",
    description: "Heatmap column label for locale status summary",
  },
  summaryShipSafe: {
    defaultMessage: "Ship-safe",
    id: "JkzEXub4WI",
    description: "Locale readiness summary badge when ship-safe",
  },
  summaryReviewDue: {
    defaultMessage: "Review due",
    id: "ZWFR3jXEW2",
    description: "Locale readiness summary badge when review is due",
  },
  summaryBlocked: {
    defaultMessage: "Blocked",
    id: "zQIP2wjI8l",
    description: "Locale readiness summary badge when blocked",
  },
  evalEyebrow: {
    defaultMessage: "Eval Trend",
    id: "DpY33A3BZz",
    description: "Eyebrow above the quality score trend card",
  },
  evalTitle: {
    defaultMessage: "Quality score over recent runs",
    id: "EOf0Sf++K3",
    description: "Title of the quality score trend card",
  },
  currentCoverage: {
    defaultMessage: "current ship-safe coverage",
    id: "ieQJlirS+o",
    description: "Caption under the current quality percentage",
  },
  recoveryBadge: {
    defaultMessage: "+8 pts recovery",
    id: "jvPL5V5sSy",
    description: "Badge showing quality score recovery on the eval trend card",
  },
  runToday: {
    defaultMessage: "Today",
    id: "GftwLzyFL4",
    description: "X-axis label for today's quality run on the eval trend chart",
  },
  coverageEyebrow: {
    defaultMessage: "Coverage Mix",
    id: "krsyirH/ME",
    description: "Eyebrow above the review coverage chart card",
  },
  coverageTitle: {
    defaultMessage: "Review coverage by locale",
    id: "AH7mG/JAFC",
    description: "Title of the review coverage by locale card",
  },
  legendAiDrafted: {
    defaultMessage: "AI drafted",
    id: "hUsIV/tGFE",
    description: "Legend label for AI-drafted coverage in the review chart",
  },
  legendHumanReviewed: {
    defaultMessage: "Human reviewed",
    id: "m4IcL4/sul",
    description: "Legend label for human-reviewed coverage in the review chart",
  },
  legendBlocked: {
    defaultMessage: "Blocked",
    id: "iX/gIwfgxF",
    description: "Legend label for blocked coverage in the review chart",
  },
  failureEyebrow: {
    defaultMessage: "Failure Modes",
    id: "euw7+pF/Q3",
    description: "Eyebrow above the issue breakdown card",
  },
  failureTitle: {
    defaultMessage: "Issue breakdown",
    id: "0UxB4COk4w",
    description: "Title of the issue breakdown card",
  },
  failureCaption: {
    defaultMessage: "Ranked by impact across current release checks",
    id: "XIxg/0r3Uo",
    description: "Caption under the issue breakdown title",
  },
  totalFindings: {
    defaultMessage: "50 total findings",
    id: "QrQMEfiDGs",
    description: "Total findings count shown on the issue breakdown card",
  },
  issueTerminology: {
    defaultMessage: "Terminology",
    id: "vCtS9gwB31",
    description: "Issue category label on the failure modes chart",
  },
  issueIcu: {
    defaultMessage: "ICU",
    id: "//vEwL9Eob",
    description: "Issue category label for ICU problems on the failure modes chart",
  },
  issueBrandVoice: {
    defaultMessage: "Brand voice",
    id: "0KC/y8d3pT",
    description: "Issue category label for brand voice problems",
  },
  issueLength: {
    defaultMessage: "Length",
    id: "34dqk3P1PN",
    description: "Issue category label for length problems",
  },
  issueContext: {
    defaultMessage: "Context",
    id: "ZST2QZVgmk",
    description: "Issue category label for context problems",
  },
});
