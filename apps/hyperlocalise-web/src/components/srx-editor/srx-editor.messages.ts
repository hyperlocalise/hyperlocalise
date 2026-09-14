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

export const srxEditorMessages = defineMessages({
  cascadeLabel: {
    defaultMessage: "Cascade rules in order",
    id: "6oJ/wWf1lW",
    description: "Checkbox to enable SRX header cascade=yes",
  },
  cascadeHint: {
    defaultMessage:
      "When enabled, rules are evaluated top to bottom and later rules can override earlier ones.",
    id: "bWKdTq2/9D",
    description: "Help text for SRX cascade",
  },
  languageRulesHeading: {
    defaultMessage: "Language rules",
    id: "yGlzNd8XCz",
    description: "Section heading for SRX language rule sets",
  },
  addLanguageRule: {
    defaultMessage: "Add language rule set",
    id: "g4o2iQRQ/A",
    description: "Button to add another languagerule group",
  },
  languageNameLabel: {
    defaultMessage: "Rule set name",
    id: "mq4F9HRaBq",
    description: "Label for languagename attribute",
  },
  removeLanguageRule: {
    defaultMessage: "Remove rule set",
    id: "pST/WJmynJ",
    description: "Remove a language rule set",
  },
  rulesHeading: {
    defaultMessage: "Break rules",
    id: "LS6346EmLF",
    description: "Subheading for individual SRX rules",
  },
  addRule: {
    defaultMessage: "Add rule",
    id: "ydDpJd3kaY",
    description: "Add a break rule within a language rule set",
  },
  removeRule: {
    defaultMessage: "Remove",
    id: "blaz/Tdo6f",
    description: "Remove a single break rule",
  },
  breakLabel: {
    defaultMessage: "Action",
    id: "MZOe0RlKZ3",
    description: "Label for break yes/no select",
  },
  breakYes: {
    defaultMessage: "Split segment here",
    id: "Od2ADXS9xw",
    description: "SRX rule break=yes",
  },
  breakNo: {
    defaultMessage: "Do not split",
    id: "cRtcug0AF8",
    description: "SRX rule break=no",
  },
  beforeBreakLabel: {
    defaultMessage: "Before break (regex)",
    id: "zWF8Xri9PZ",
    description: "Label for beforebreak pattern",
  },
  afterBreakLabel: {
    defaultMessage: "After break (regex)",
    id: "DHw/85SGxB",
    description: "Label for afterbreak pattern",
  },
  mapsHeading: {
    defaultMessage: "Language mapping",
    id: "2NCNOSLgB8",
    description: "Section for maprules",
  },
  mapsHint: {
    defaultMessage:
      "Maps locale or language codes to a rule set. Use .* to apply one set to all languages.",
    id: "Q2A0dp4HQJ",
    description: "Help for language maps",
  },
  addMap: {
    defaultMessage: "Add mapping",
    id: "j8sxjUaev9",
    description: "Add languagemap row",
  },
  removeMap: {
    defaultMessage: "Remove mapping",
    id: "bYcdZbeKnZ",
    description: "Remove languagemap row",
  },
  patternLabel: {
    defaultMessage: "Language pattern",
    id: "WSkNEsSC15",
    description: "languagepattern attribute",
  },
  targetRuleLabel: {
    defaultMessage: "Use rule set",
    id: "HZT9XXFcQC",
    description: "languagerulename select label",
  },
  loadTemplateLabel: {
    defaultMessage: "Start from template",
    id: "ogeFAmaF0r",
    description: "Label for loading built-in SRX into custom editor",
  },
  templateDefault: {
    defaultMessage: "Default (general prose)",
    id: "dieI9i0S9r",
    description: "Load default SRX template",
  },
  templateHtml: {
    defaultMessage: "HTML",
    id: "Qa2OXtJ4Ug",
    description: "Load HTML SRX template",
  },
  templateMarkdown: {
    defaultMessage: "Markdown",
    id: "y+bELTU1GC",
    description: "Load Markdown SRX template",
  },
  viewXml: {
    defaultMessage: "View generated XML",
    id: "jYA+KoUGAs",
    description: "Collapsible to show serialized SRX",
  },
});
