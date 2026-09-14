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

export const projectFileSegmentationDialogMessages = defineMessages({
  title: {
    defaultMessage: "Segmentation settings",
    id: "3f/xgt6ktq",
    description: "Dialog title for per-file SRX segmentation settings",
  },
  description: {
    defaultMessage:
      "Split long string values into smaller segments before translation using SRX 2.0 rules. Saving re-imports strings from the latest file version.",
    id: "44KTDhmt0k",
    description: "Intro text for segmentation settings dialog",
  },
  enableLabel: {
    defaultMessage: "Enable content segmentation",
    id: "AjdhtdiVlF",
    description: "Checkbox label to turn on SRX segmentation for a file",
  },
  useCustomLabel: {
    defaultMessage: "Use custom segmentation rules",
    id: "Oa16p7cBbD",
    description: "Checkbox label to use custom SRX XML instead of a built-in template",
  },
  templateLabel: {
    defaultMessage: "Built-in rules",
    id: "oaEdG+7zwQ",
    description: "Label for built-in SRX template select",
  },
  templateDefault: {
    defaultMessage: "Default (general prose)",
    id: "jOtw3PC362",
    description: "SRX template option: default",
  },
  templateHtml: {
    defaultMessage: "HTML",
    id: "C6lJp+tZ7H",
    description: "SRX template option: html",
  },
  templateMarkdown: {
    defaultMessage: "Markdown",
    id: "ePPBSyUp70",
    description: "SRX template option: markdown",
  },
  customRulesLabel: {
    defaultMessage: "Custom break rules",
    id: "Xkbjlp0OXt",
    description: "Label for custom SRX rule editor",
  },
  customXmlParseFailed: {
    defaultMessage:
      "Could not read the saved SRX XML. Showing a starter ruleset — review before saving.",
    id: "tx+ZfdCJg6",
    description: "Banner when stored custom SRX XML fails to parse",
  },
  validationFailed: {
    defaultMessage: "Fix SRX rule errors before saving: {detail}",
    id: "TXP1gdWAFX",
    description: "Toast when custom SRX validation fails on save",
  },
  unsupportedFormat: {
    defaultMessage: "This file format already has its own segments or cannot use SRX.",
    id: "Bdt3AHpUIr",
    description: "Shown when the selected file cannot use custom segmentation",
  },
  save: {
    defaultMessage: "Save",
    id: "0X2jSiOLsN",
    description: "Save segmentation settings button",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "tH7qCx3u9r",
    description: "Cancel segmentation settings dialog",
  },
  saveSuccess: {
    defaultMessage: "Segmentation settings saved. Re-import started.",
    id: "1bCz3MmLs1",
    description: "Toast after saving segmentation settings",
  },
  saveFailed: {
    defaultMessage: "Could not save segmentation settings.",
    id: "qLTb3YlEiM",
    description: "Toast when segmentation save fails",
  },
  loadFailed: {
    defaultMessage: "Could not load segmentation settings.",
    id: "xNyLesbCJO",
    description: "Error when segmentation settings fail to load",
  },
});
