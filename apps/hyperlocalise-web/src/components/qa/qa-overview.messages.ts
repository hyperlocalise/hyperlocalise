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

export const qaOverviewMessages = defineMessages({
  changeSincePrevious: {
    defaultMessage: "{change} vs previous scan",
    id: "20xz2v3+tc",
    description:
      "QA metric card change compared with the previous completed scan, for example +3 vs previous scan",
  },
  noChange: {
    defaultMessage: "Same as previous scan",
    id: "RsVaeettZj",
    description:
      "QA metric card note when the count did not change since the previous completed scan",
  },
  overviewLabel: {
    defaultMessage: "QA overview",
    id: "JoynZtXibd",
    description: "QA overview section label",
  },
  errorsMetric: {
    defaultMessage: "Errors",
    id: "RduxbsDn4x",
    description: "QA overview metric label for errors",
  },
  warningsMetric: {
    defaultMessage: "Warnings",
    id: "+tIoU7x2PF",
    description: "QA overview metric label for warnings",
  },
  segmentsMetric: {
    defaultMessage: "Translations checked",
    id: "gTlvQnnMVi",
    description: "QA overview metric label for translations checked",
  },
  byLanguageTitle: {
    defaultMessage: "Findings by language",
    id: "LLFDy0yT5w",
    description: "QA overview chart title for findings per target language",
  },
  byCheckTitle: {
    defaultMessage: "Findings by check",
    id: "zPcYYvfPoo",
    description: "QA overview chart title for findings per QA check",
  },
  trendTitle: {
    defaultMessage: "Errors and warnings over time",
    id: "gFvQ/JVP4A",
    description: "QA overview chart title for errors and warnings across recent scans",
  },
  trendEmpty: {
    defaultMessage: "Run more scans to see a trend.",
    id: "H+qcGyZlrJ",
    description: "QA overview trend chart empty state when fewer than two scans completed",
  },
  topRows: {
    defaultMessage: "Top {shown} of {total}",
    id: "pCIZGjBgS+",
    description: "QA overview chart note when only the largest rows are shown",
  },
  chartEmpty: {
    defaultMessage: "No findings to chart.",
    id: "YIzAW7VJBY",
    description: "QA overview chart empty state",
  },
  findingsSeries: {
    defaultMessage: "Findings",
    id: "YW2bfmVhJb",
    description: "QA overview chart series label for finding counts",
  },
  chartAriaLabel: {
    defaultMessage: "{title}: {values}",
    id: "wRNSisg87G",
    description: "Accessible summary of a QA overview chart and its values",
  },
  chartValue: {
    defaultMessage: "{label} {count}",
    id: "yruH9NStXi",
    description: "Accessible label and count for one QA overview chart bar",
  },
  selectScan: {
    defaultMessage: "Select a scan",
    id: "kBixxU3NdD",
    description: "Accessible label for QA trend chart scan selection controls",
  },
  selectScanOption: {
    defaultMessage: "{label}: {errors} errors, {warnings} warnings",
    id: "UtHu3v+Njx",
    description: "Accessible name for one QA trend scan selection control",
  },
});
