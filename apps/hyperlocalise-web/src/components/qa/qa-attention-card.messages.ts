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

export const qaAttentionCardMessages = defineMessages({
  errorsTitle: {
    defaultMessage:
      "{count, plural, one {# QA error needs fixing} other {# QA errors need fixing}}",
    id: "Bgyo2hNqP1",
    description: "Attention card title with the number of errors in the latest completed QA scans",
  },
  workspaceErrorsDetail: {
    defaultMessage:
      "{count, plural, one {Found in # project by the latest completed scan.} other {Found across # projects by the latest completed scans.}}",
    id: "QVYvqDfxVC",
    description: "Attention card detail on the dashboard naming how many projects have QA errors",
  },
  projectErrorsDetail: {
    defaultMessage:
      "Found by the latest completed scan. Errors block saving and approving in the editor.",
    id: "X9T1ws0nO6",
    description:
      "Attention card detail on the project overview when the latest QA scan found errors",
  },
  failedTitle: {
    defaultMessage: "{count, plural, one {# QA scan failed} other {# QA scans failed}}",
    id: "+850lhlwsw",
    description: "Attention card title when the latest QA scan failed in one or more projects",
  },
  failedDetail: {
    defaultMessage: "QA results may be out of date until the scan runs again.",
    id: "aWosi+RkPv",
    description: "Attention card detail when the latest QA scan failed",
  },
  reviewQa: {
    defaultMessage: "Review QA",
    id: "w3u7P94HBh",
    description: "Attention card link to the QA page",
  },
});
