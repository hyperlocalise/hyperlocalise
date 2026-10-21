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

export const googleDriveConnectionPanelMessages = defineMessages({
  authorizeUrlFailedToast: {
    id: "ak/7eZQvtU",
    defaultMessage: "Could not start Google Drive authorization.",
    description: "Toast when Google Drive OAuth URL request fails",
  },
  popupBlockedToast: {
    id: "3u8x1hrri6",
    defaultMessage: "Allow pop-ups to connect Google Drive.",
    description: "Toast when the Google Drive OAuth window is blocked",
  },
  disconnectFailed: {
    id: "tFFqz/8xPp",
    defaultMessage: "Could not disconnect Google Drive.",
    description: "Toast when Google Drive disconnect fails",
  },
  disconnectedToast: {
    id: "fyJXZt85Ww",
    defaultMessage: "Google Drive disconnected.",
    description: "Toast after Google Drive disconnect succeeds",
  },
  loadErrorDescription: {
    id: "OWsqdkxxfx",
    defaultMessage: "Could not load Google Drive connection status.",
    description: "Integration row description when status fetch fails",
  },
});
