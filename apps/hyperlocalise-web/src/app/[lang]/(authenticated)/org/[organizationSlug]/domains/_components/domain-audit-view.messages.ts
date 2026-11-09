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

export const domainAuditViewMessages = defineMessages({
  title: {
    defaultMessage: "Localisation audit",
    id: "4HNfhY9OdS",
    description: "Heading of the domain deep localisation audit page",
  },
  intro: {
    defaultMessage:
      "Checks every template and locale version on up to {pageLimit} pages, using the same scored checks as the free audit.",
    id: "zQ5x0hI+m6",
    description: "Introduction on the domain deep localisation audit page",
  },
  runAudit: {
    defaultMessage: "Run deep audit",
    id: "skro9v4c/V",
    description: "Button that starts a deep localisation audit",
  },
  cancelRun: {
    defaultMessage: "Cancel audit",
    id: "GjzkemGKrO",
    description: "Button that cancels a running deep localisation audit",
  },
  startFailed: {
    defaultMessage: "The deep audit could not be started.",
    id: "bOPvsWtQIR",
    description: "Toast when starting a deep localisation audit fails",
  },
  statusQueued: {
    defaultMessage: "Queued",
    id: "7z0lelZrj6",
    description: "Deep audit run status: waiting to start",
  },
  statusCrawling: {
    defaultMessage: "Rendering pages",
    id: "orcwaYGxyM",
    description: "Deep audit run status: rendering pages in a browser",
  },
  statusScoring: {
    defaultMessage: "Scoring",
    id: "oozQzIrtiI",
    description: "Deep audit run status: running checks on rendered pages",
  },
  statusSucceeded: {
    defaultMessage: "Complete",
    id: "yRoTNR8RVX",
    description: "Deep audit run status: finished successfully",
  },
  statusFailed: {
    defaultMessage: "Failed",
    id: "F/8QmcZXn2",
    description: "Deep audit run status: failed",
  },
  statusCancelled: {
    defaultMessage: "Cancelled",
    id: "twzBdVraAT",
    description: "Deep audit run status: cancelled by a user",
  },
  progress: {
    defaultMessage: "{rendered} of {discovered} pages rendered",
    id: "go8T/ow9x/",
    description: "Progress of a running deep audit",
  },
  emptyTitle: {
    defaultMessage: "No deep audit yet",
    id: "2IrqJqBzqP",
    description: "Empty state title when a domain has no deep audit runs",
  },
  emptyDescription: {
    defaultMessage:
      "Run a deep audit to check hreflang, language tags, translation coverage and layout on every template and locale.",
    id: "ZxikgHYAIB",
    description: "Empty state description when a domain has no deep audit runs",
  },
  prototypeTitle: {
    defaultMessage: "Deep audits run on linked domains",
    id: "qMU/OVhWNU",
    description: "Empty state title on sample domains where deep audits are unavailable",
  },
  prototypeDescription: {
    defaultMessage: "Link and verify your own domain to run a deep localisation audit.",
    id: "aIMxdX8r4L",
    description: "Empty state description on sample domains where deep audits are unavailable",
  },
  loadError: {
    defaultMessage: "Deep audits could not be loaded.",
    id: "z2FPygp7qk",
    description: "Error shown when deep audit runs fail to load",
  },
  failedTitle: {
    defaultMessage: "The audit did not finish",
    id: "CWmHhOw6zX",
    description: "Title for a failed deep audit run",
  },
  cancelledDescription: {
    defaultMessage: "This audit was cancelled before it finished.",
    id: "QHtSzYH7Cr",
    description: "Description for a cancelled deep audit run",
  },
  scoreLabel: {
    defaultMessage: "Score",
    id: "d/k+UaUVvy",
    description: "Label for the overall deep audit score",
  },
  dimensionTechnical: {
    defaultMessage: "Technical",
    id: "uXkk9nvslN",
    description: "Deep audit dimension: technical localisation checks",
  },
  dimensionLinguistic: {
    defaultMessage: "Linguistic",
    id: "V4vu37hA7r",
    description: "Deep audit dimension: linguistic checks",
  },
  dimensionContextual: {
    defaultMessage: "Contextual",
    id: "bomv3upOP5",
    description: "Deep audit dimension: contextual and cultural checks",
  },
  dimensionVisual: {
    defaultMessage: "Visual",
    id: "kfw6el48dX",
    description: "Deep audit dimension: layout and visual checks",
  },
  pagesLabel: {
    defaultMessage: "Pages audited",
    id: "du98BgXimW",
    description: "Label for the number of pages a deep audit rendered",
  },
  templatesLabel: {
    defaultMessage: "Templates",
    id: "IRlEjvWkjK",
    description: "Label for the number of page templates a deep audit covered",
  },
  localesLabel: {
    defaultMessage: "Locales",
    id: "wzRJGWlWN6",
    description: "Label for the number of locales a deep audit detected",
  },
  diffTitle: {
    defaultMessage: "Since the previous audit",
    id: "W21orpBvZU",
    description: "Heading of the comparison with the previous deep audit run",
  },
  diffSummary: {
    defaultMessage: "{new} new, {fixed} fixed, {unchanged} unchanged",
    id: "3P9pgPqjIr",
    description: "Counts of findings compared with the previous deep audit run",
  },
  diffFirstRun: {
    defaultMessage: "This is the first audit. The next audit will show what changed.",
    id: "6hX34Ne5Kx",
    description: "Shown when there is no previous deep audit to compare with",
  },
  checksTitle: {
    defaultMessage: "Checks",
    id: "BNXNoD2oRi",
    description: "Heading of the list of deep audit checks",
  },
  groupFailed: {
    defaultMessage: "Failing",
    id: "L4XIkXC3v1",
    description: "Group heading for failing deep audit checks",
  },
  groupWatch: {
    defaultMessage: "Needs attention",
    id: "PNjbS7/7rq",
    description: "Group heading for deep audit checks that need attention",
  },
  groupAiAssessed: {
    defaultMessage: "AI-assessed, not scored",
    id: "vEQ9DrE0lq",
    description: "Group heading for AI-assessed deep audit checks that do not affect the score",
  },
  groupPassed: {
    defaultMessage: "Passing",
    id: "8mxInItxoR",
    description: "Group heading for passing deep audit checks",
  },
  groupNotApplicable: {
    defaultMessage: "Not applicable",
    id: "vCIzfM9TWm",
    description: "Group heading for deep audit checks that do not apply to this site",
  },
  affectedPages: {
    defaultMessage: "{count, plural, one {# page affected} other {# pages affected}}",
    id: "LD1wAP4kgm",
    description: "How many pages a deep audit check found issues on",
  },
  affectedTemplates: {
    defaultMessage: "{count, plural, one {# template} other {# templates}}",
    id: "uoPgtNes5S",
    description: "How many page templates a deep audit check found issues on",
  },
  viewFindings: {
    defaultMessage: "View findings",
    id: "aw3ygbRl64",
    description: "Button that filters the findings list to one check",
  },
  findingsTitle: {
    defaultMessage: "Findings",
    id: "GhWCzPPWmj",
    description: "Heading of the deep audit findings list",
  },
  findingsCount: {
    defaultMessage: "{count, plural, one {# finding} other {# findings}}",
    id: "ar3vgqaNUj",
    description: "Number of deep audit findings matching the filters",
  },
  filterSeverity: {
    defaultMessage: "Severity",
    id: "n3askuKeVY",
    description: "Label of the severity filter on deep audit findings",
  },
  filterTemplate: {
    defaultMessage: "Template",
    id: "ng6B9bcK4+",
    description: "Label of the page template filter on deep audit findings",
  },
  filterLocale: {
    defaultMessage: "Locale",
    id: "WZx6Kx+bpQ",
    description: "Label of the locale filter on deep audit findings",
  },
  filterAll: {
    defaultMessage: "All",
    id: "nQakSpl73P",
    description: "Filter option that shows every value",
  },
  filterCheck: {
    defaultMessage: "Showing findings for {title}",
    id: "DNGDl5v9Mv",
    description: "Shown when the deep audit findings list is filtered to one check",
  },
  clearCheck: {
    defaultMessage: "Show all checks",
    id: "5z8bjLJkgw",
    description: "Button that removes the check filter on deep audit findings",
  },
  diffAll: {
    defaultMessage: "All",
    id: "wE2aWK0R0x",
    description: "Tab showing all current deep audit findings",
  },
  diffNew: {
    defaultMessage: "New",
    id: "z3hj82GD8T",
    description: "Tab and badge for deep audit findings not in the previous run",
  },
  diffUnchanged: {
    defaultMessage: "Unchanged",
    id: "mTauU9Q8fj",
    description: "Tab for deep audit findings also present in the previous run",
  },
  diffFixed: {
    defaultMessage: "Fixed",
    id: "26WUZcJUMs",
    description: "Tab and badge for previous-run findings that no longer occur",
  },
  severityCritical: {
    defaultMessage: "Critical",
    id: "/u6bFz8Pln",
    description: "Deep audit finding severity: critical",
  },
  severityHigh: {
    defaultMessage: "High",
    id: "TNM2OvflaH",
    description: "Deep audit finding severity: high",
  },
  severityMedium: {
    defaultMessage: "Medium",
    id: "6+1V85HtXZ",
    description: "Deep audit finding severity: medium",
  },
  severityLow: {
    defaultMessage: "Low",
    id: "K6xk5LlJsi",
    description: "Deep audit finding severity: low",
  },
  severityInfo: {
    defaultMessage: "Info",
    id: "OtMLs9Sjwt",
    description: "Deep audit finding severity: informational",
  },
  noFindings: {
    defaultMessage: "No findings match these filters.",
    id: "oRqlb6y7hR",
    description: "Empty state for the deep audit findings list",
  },
  adviceLabel: {
    defaultMessage: "How to fix",
    id: "q4syzSM3a9",
    description: "Label before the advice on a deep audit finding",
  },
  evidenceLabel: {
    defaultMessage: "Evidence",
    id: "hJ9zYcTEyA",
    description: "Label before the evidence on a deep audit finding",
  },
  previousPage: {
    defaultMessage: "Previous",
    id: "GaI70g/j4P",
    description: "Button that shows the previous page of deep audit findings",
  },
  nextPage: {
    defaultMessage: "Next",
    id: "fyGsiwzZTm",
    description: "Button that shows the next page of deep audit findings",
  },
  pageRange: {
    defaultMessage: "{from}–{to} of {total}",
    id: "xFt1TKRrap",
    description: "Range of deep audit findings shown on this page",
  },
  runsTitle: {
    defaultMessage: "Audit history",
    id: "bZAwREIvmP",
    description: "Heading of the list of past deep audit runs",
  },
  runPages: {
    defaultMessage: "{count, plural, one {# page} other {# pages}}",
    id: "fWsr0xOvHn",
    description: "Number of pages a past deep audit run rendered",
  },
  runScore: {
    defaultMessage: "Score {score}",
    id: "h8tdXE4S08",
    description: "Score of a past deep audit run",
  },
  viewRun: {
    defaultMessage: "View",
    id: "uxVxbJaX8k",
    description: "Button that opens a past deep audit run",
  },
  viewingRun: {
    defaultMessage: "Viewing",
    id: "/mekaAx3JX",
    description: "Label on the deep audit run that is currently shown",
  },
});
