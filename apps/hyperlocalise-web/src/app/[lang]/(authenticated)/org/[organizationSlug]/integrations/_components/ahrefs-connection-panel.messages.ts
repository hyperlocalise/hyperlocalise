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

export const ahrefsConnectionPanelMessages = defineMessages({
  rowName: {
    defaultMessage: "Ahrefs",
    id: "XIim2dhGAT",
    description: "Name shown for the Ahrefs integrations row",
  },
  rowDescription: {
    defaultMessage: "Connect Ahrefs through WorkOS Pipes for SEO data in automations.",
    id: "9mbxPN/dMr",
    description: "Description for the Ahrefs integrations row",
  },
  fetchFailed: {
    defaultMessage: "Failed to load Ahrefs connection.",
    id: "z3hAWnzQKx",
    description: "Error when Ahrefs Pipes status cannot be loaded",
  },
  tokenRequired: {
    defaultMessage: "Sign in again to manage the Ahrefs connection.",
    id: "4rrhdZuDqB",
    description: "Error when a WorkOS access token is missing for the Pipes widget",
  },
  reconnectHint: {
    defaultMessage: "Reconnect Ahrefs to keep automations working.",
    id: "glTclgNrLG",
    description: "Hint when the Ahrefs Pipes installation needs reauthorization",
  },
});
