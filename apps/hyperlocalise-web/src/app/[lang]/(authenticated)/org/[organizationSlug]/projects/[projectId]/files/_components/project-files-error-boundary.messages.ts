"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { defineMessages } from "react-intl";

export const projectFilesErrorBoundaryMessages = defineMessages({
  treeFailed: {
    defaultMessage: "Files failed to load.",
    id: "DkpXUR9fM4",
    description: "Error title when the project files tree panel fails",
  },
  detailFailed: {
    defaultMessage: "File preview failed to load.",
    id: "C8yvKuxtRj",
    description: "Error title when the project file detail panel fails",
  },
  loadFailedFallback: {
    defaultMessage: "Failed to load files.",
    id: "wvvrX539Xf",
    description: "Fallback error message when a project files panel fails without details",
  },
  tryAgain: {
    defaultMessage: "Try again",
    id: "uEkaqKbwfV",
    description: "Button to retry loading a failed project files panel",
  },
});
