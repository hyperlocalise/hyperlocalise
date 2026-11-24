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

export const qaProjectMessages = defineMessages({
  title: {
    defaultMessage: "Translation QA",
    id: "TaVUffauIB",
    description: "Project QA page title",
  },
  run: {
    defaultMessage: "Run QA check",
    id: "i/EBft9uxG",
    description: "Project QA run button",
  },
  runInProgress: {
    defaultMessage: "A QA scan is already running. Results will refresh when it finishes.",
    id: "RYm+Dvvove",
    description: "Project QA concurrent scan response",
  },
  viewLastCompleted: {
    defaultMessage: "View last completed scan",
    id: "av7mTiSfb9",
    description: "Project QA action after a failed scan",
  },
  running: {
    defaultMessage: "Running…",
    id: "Xe3fwkVyh6",
    description: "Project QA run in progress",
  },
  schedule: {
    defaultMessage: "Daily scan",
    id: "k+eA3j0O+p",
    description: "Project QA daily schedule toggle",
  },
  scheduleHelp: {
    defaultMessage: "Scan this project once a day when translations change overnight.",
    id: "uZalLkwS55",
    description: "Project QA schedule help",
  },
  unsupported: {
    defaultMessage: "QA reports run on native projects. Provider jobs are not scanned here.",
    id: "m8NpAC200k",
    description: "Project QA unsupported provider message",
  },
  empty: {
    defaultMessage: "No scan yet. Run a QA check to list translation issues.",
    id: "5pj50ZtP7a",
    description: "Project QA empty state",
  },
  noFindings: {
    defaultMessage: "No issues in this scan.",
    id: "mfdI/BnSCm",
    description: "Project QA zero findings",
  },
  segments: {
    defaultMessage: "Segments scanned",
    id: "0tbfPe4rk/",
    description: "Project QA segment count label",
  },
  errors: {
    defaultMessage: "Errors",
    id: "qz4n/WYI/r",
    description: "Project QA error count label",
  },
  warnings: {
    defaultMessage: "Warnings",
    id: "0A0B8c6FRK",
    description: "Project QA warning count label",
  },
  lastRun: {
    defaultMessage: "Last run",
    id: "m645TvmZkL",
    description: "Project QA last run label",
  },
  locale: {
    defaultMessage: "Locale",
    id: "nBr337kZJ1",
    description: "Project QA locale filter",
  },
  allLocales: {
    defaultMessage: "All locales",
    id: "adTqYP7Vjb",
    description: "Project QA all locales filter",
  },
  check: {
    defaultMessage: "Check",
    id: "4u1PmCjhti",
    description: "Project QA check type column",
  },
  allChecks: {
    defaultMessage: "All checks",
    id: "xQDNaOICNp",
    description: "Project QA all checks filter",
  },
  key: {
    defaultMessage: "Key",
    id: "bnIBIPeVFP",
    description: "Project QA key column",
  },
  source: {
    defaultMessage: "Source",
    id: "X+udgIpkfB",
    description: "Project QA source column",
  },
  target: {
    defaultMessage: "Target",
    id: "+teevJ7asc",
    description: "Project QA target column",
  },
  openEditor: {
    defaultMessage: "Open in editor",
    id: "M8XELItknC",
    description: "Project QA finding editor link",
  },
  loadError: {
    defaultMessage: "Could not load QA reports.",
    id: "RRjkhCG4Cs",
    description: "Project QA load error",
  },
  runError: {
    defaultMessage: "Could not start the QA scan.",
    id: "KxDSgHEwlN",
    description: "Project QA run error",
  },
  runStarted: {
    defaultMessage: "QA scan started.",
    id: "vxm9RJy+2w",
    description: "Project QA run success toast",
  },
  scanInProgress: {
    defaultMessage: "Scan in progress. Findings appear when it finishes.",
    id: "qg9c/jOJZY",
    description: "Project QA in-progress empty findings",
  },
  scheduleSaved: {
    defaultMessage: "Schedule updated.",
    id: "AgRRIfivV1",
    description: "Project QA schedule save toast",
  },
  history: {
    defaultMessage: "Recent scans",
    id: "CxIXwEUku/",
    description: "Project QA run history heading",
  },
  triggerManual: {
    defaultMessage: "Manual",
    id: "y430vZKHp5",
    description: "Project QA manual trigger label",
  },
  triggerScheduled: {
    defaultMessage: "Scheduled",
    id: "uXvES3jNQD",
    description: "Project QA scheduled trigger label",
  },
  loadMore: {
    defaultMessage: "Load more",
    id: "RcSX5Vc4DS",
    description: "Project QA load more findings",
  },
  loadingMore: {
    defaultMessage: "Loading…",
    id: "TqMzymk92f",
    description: "Project QA loading more findings",
  },
  findingsShown: {
    defaultMessage: "Showing {shown} of {total}",
    id: "iQ+Qd5bwId",
    description: "Project QA findings pagination count",
  },
  chartHint: {
    defaultMessage: "Select a bar to filter the findings, or a scan to open it.",
    id: "PjwQHAKIyC",
    description: "Project QA hint that chart bars filter findings or open a scan",
  },
  lastCheckedMetric: {
    defaultMessage: "Last checked",
    id: "vz3T4Z8Snp",
    description: "Project QA overview metric label for when the selected scan completed",
  },
  scansDaily: {
    defaultMessage: "Scans daily",
    id: "Nvgh1C7lWr",
    description: "Project QA overview detail when the daily schedule is on",
  },
  scansManual: {
    defaultMessage: "Manual scans only",
    id: "3ZTAwhOgvz",
    description: "Project QA overview detail when the daily schedule is off",
  },
  selectedScanDetail: {
    defaultMessage: "From the selected scan",
    id: "ZhKvDu+LHx",
    description: "Project QA overview metric detail for counts from the selected scan",
  },
  languagesWithFindings: {
    defaultMessage:
      "{count, plural, one {# language has findings} other {# languages have findings}}",
    id: "hI5mcHlF5p",
    description: "Project QA overview metric detail for languages with findings",
  },
  scanPicker: {
    defaultMessage: "Scan",
    id: "UYTcVt3FZK",
    description: "Accessible label for the project QA scan picker",
  },
  scanPickerValue: {
    defaultMessage: "Scan: {date}",
    id: "AhhKC7T2t0",
    description: "Project QA scan picker trigger showing the selected scan date",
  },
  scanOption: {
    defaultMessage: "{date} · {summary}",
    id: "XK7JWFwGaI",
    description: "Project QA scan picker option with the scan date and its result",
  },
  scanOptionLatest: {
    defaultMessage: "{date} · {summary} · Latest",
    id: "lxuJnb0riA",
    description: "Project QA scan picker option for the most recent scan",
  },
  scanOptionFailed: {
    defaultMessage: "Failed",
    id: "iRLdkcgIz1",
    description: "Project QA scan picker result for a failed scan",
  },
  scanOptionRunning: {
    defaultMessage: "In progress",
    id: "lDYWBRICCs",
    description: "Project QA scan picker result for a queued or running scan",
  },
  olderScanBanner: {
    defaultMessage: "You are viewing the scan from {date}, not the latest one.",
    id: "hzctviyEHQ",
    description: "Project QA banner shown while an older scan is selected",
  },
  openSettings: {
    defaultMessage: "Check settings",
    id: "UGP0Yv7lV2",
    description: "Project QA button that opens the check settings dialog",
  },
  settingsDescription: {
    defaultMessage:
      "Choose which checks run and how strict they are. Changes apply to the next scan and to the editor.",
    id: "TVGb1bgxbG",
    description: "Project QA check settings dialog description",
  },
  settingsReadOnly: {
    defaultMessage: "You don't have permission to change these settings.",
    id: "B45dmP3Ag+",
    description: "Project QA check settings note for members who cannot edit",
  },
  saveSettings: {
    defaultMessage: "Save changes",
    id: "ym+SefNrfo",
    description: "Project QA check settings dialog save button",
  },
  qualityScore: {
    defaultMessage: "Quality score",
    id: "y2u7doaXXd",
    description: "Project QA settings: switch that turns on MQM quality scoring",
  },
  qualityScoreHelp: {
    defaultMessage:
      "Score each scan out of 100. Every finding costs points per source word: minor 1, major 5, critical 25. A language passes when it reaches the threshold and has no critical finding. Run QA steps in workflows pass or fail on this score.",
    id: "MC7M/wi3wt",
    description: "Project QA settings: help text for MQM quality scoring",
  },
  passThreshold: {
    defaultMessage: "Pass threshold",
    id: "PSdpb4ZhsU",
    description: "Project QA settings: lowest passing quality score",
  },
  passThresholdHelp: {
    defaultMessage: "Lowest passing score, from 0 to 100.",
    id: "ba52MnbtYg",
    description: "Project QA settings: help text for the pass threshold",
  },
  penaltyLabel: {
    defaultMessage: "Penalty for {check}",
    id: "4P8Gr7Fd41",
    description: "Project QA settings: accessible label for a check's MQM penalty control",
  },
  penaltyMinor: {
    defaultMessage: "Minor",
    id: "QLTuspeSzC",
    description: "MQM penalty level: minor, 1 point",
  },
  penaltyMajor: {
    defaultMessage: "Major",
    id: "0oefDgMMaG",
    description: "MQM penalty level: major, 5 points",
  },
  penaltyCritical: {
    defaultMessage: "Critical",
    id: "uXu5iikA3V",
    description: "MQM penalty level: critical, 25 points; any critical finding fails the language",
  },
  qualityMetric: {
    defaultMessage: "Quality score",
    id: "34a9MdnGLI",
    description: "Project QA overview: metric card label for the scan's MQM score",
  },
  qualityPassedDetail: {
    defaultMessage: "Passed · threshold {threshold}",
    id: "bukf9DJ0yp",
    description: "Project QA overview: every language reached the pass threshold",
  },
  qualityFailedDetail: {
    defaultMessage:
      "{count, plural, one {# language} other {# languages}} below threshold {threshold}",
    id: "qodhPbECWl",
    description: "Project QA overview: languages that did not pass the quality threshold",
  },
});
