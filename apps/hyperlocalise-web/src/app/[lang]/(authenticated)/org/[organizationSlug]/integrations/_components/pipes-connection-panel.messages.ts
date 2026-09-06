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

export const pipesConnectionPanelMessages = defineMessages({
  fetchFailed: {
    defaultMessage: "Failed to load the {providerName} connection.",
    id: "pipesPanelFetchFailed",
    description: "Error when a WorkOS Pipes connection status cannot be loaded",
  },
  tokenRequired: {
    defaultMessage: "Sign in again to manage the {providerName} connection.",
    id: "pipesPanelTokenRequired",
    description: "Error when a WorkOS access token is missing for the Pipes widget",
  },
  reconnectHint: {
    defaultMessage: "Reconnect {providerName} to keep this integration working.",
    id: "pipesPanelReconnectHint",
    description: "Hint when a WorkOS Pipes installation needs reauthorization",
  },
});
