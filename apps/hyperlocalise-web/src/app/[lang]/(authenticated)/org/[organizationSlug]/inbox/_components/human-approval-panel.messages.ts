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

export const humanApprovalPanelMessages = defineMessages({
  loading: {
    defaultMessage: "Loading approval request…",
    description: "Status shown while an approval request is loading in Inbox.",
    id: "UQPsFLITlV",
  },
  loadFailed: {
    defaultMessage: "Could not load this approval request.",
    description: "Error shown when an approval request cannot be loaded in Inbox.",
    id: "DtXtrgUH7z",
  },
  approve: {
    defaultMessage: "Approve",
    description: "Button that approves a workflow approval request.",
    id: "BAVhY/G3pP",
  },
  reject: {
    defaultMessage: "Reject",
    description: "Button that rejects a workflow approval request.",
    id: "0xu8XkGP+r",
  },
  requestChanges: {
    defaultMessage: "Request changes",
    description: "Button that requests changes for a workflow approval request.",
    id: "ufSIAHa2f9",
  },
  artifact: {
    defaultMessage: "Artifact: {value}",
    description: "Artifact reference attached to a workflow approval request.",
    id: "P/A+PICJO5",
  },
  job: {
    defaultMessage: "Job: {value}",
    description: "Job reference attached to a workflow approval request.",
    id: "ta/VRhWPxR",
  },
  deadline: {
    defaultMessage: "Decision due {value}",
    description: "Deadline for deciding a workflow approval request.",
    id: "jbhJ/zSXbe",
  },
  decided: {
    defaultMessage: "Decision: {status}",
    description: "Final status of a workflow approval request.",
    id: "1tmaWw5UnV",
  },
  decisionFailed: {
    defaultMessage: "Could not save the approval decision.",
    description: "Error shown when an approval decision cannot be saved.",
    id: "l8ozXVAWsC",
  },
});
