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

export const issueDetailPageContentMessages = defineMessages({
  loadingAria: {
    defaultMessage: "Loading issue",
    id: "IKxY25Mtmd",
    description: "Accessible label while the full-page issue detail loads",
  },
  notFound: {
    defaultMessage: "Issue not found or you do not have access.",
    id: "QCQEKXAzmZ",
    description: "Shown when the issue detail page cannot load the issue",
  },
});
