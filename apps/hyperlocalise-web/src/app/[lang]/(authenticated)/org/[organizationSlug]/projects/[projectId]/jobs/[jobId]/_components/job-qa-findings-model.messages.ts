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

export const jobQaFindingsModelMessages = defineMessages({
  unknownLocale: {
    defaultMessage: "Unknown locale",
    id: "A7MsbubEL0",
    description: "Group label when a QA finding has no locale",
  },
  commentPosted: {
    defaultMessage: "Comment posted",
    id: "iyeC0lBvav",
    description: "Write-back status when a provider comment was posted for a finding",
  },
  alreadyInTms: {
    defaultMessage: "Already in TMS",
    id: "x3PUnnOYom",
    description: "Write-back status when a finding already had a provider comment",
  },
  commentFailed: {
    defaultMessage: "Comment failed",
    id: "+FuW5t+7ZR",
    description: "Write-back status when posting a provider comment failed",
  },
});
