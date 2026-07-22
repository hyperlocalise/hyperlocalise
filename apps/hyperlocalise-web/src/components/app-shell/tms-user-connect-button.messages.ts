"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { defineMessages } from "react-intl";

export const tmsUserConnectButtonMessages = defineMessages({
  connect: {
    defaultMessage: "Connect {provider}",
    id: "Aa0lbVkG8M",
    description: "Button label to start connecting a TMS user account",
  },
  connecting: {
    defaultMessage: "Connecting...",
    id: "P+9nP38ODj",
    description: "Pending label while a TMS OAuth connection is starting",
  },
  startFailed: {
    defaultMessage: "Failed to start {provider} connection",
    id: "RWrEpStLhj",
    description: "Toast error when starting a TMS OAuth connection fails",
  },
});
