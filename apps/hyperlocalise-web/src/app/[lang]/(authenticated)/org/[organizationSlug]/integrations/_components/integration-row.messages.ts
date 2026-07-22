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

export const integrationRowMessages = defineMessages({
  comingSoon: {
    defaultMessage: "Coming soon",
    id: "2Wk4xEwU1H",
    description: "Disabled button label for integrations not yet available",
  },
  adminsCanConnect: {
    defaultMessage: "Admins can connect",
    id: "D9igbLAS2O",
    description: "Hint shown when the user lacks permission to connect an integration",
  },
  connecting: {
    defaultMessage: "Connecting…",
    id: "pfwX+wkDSM",
    description: "Connect button label while an OAuth or install flow is starting",
  },
  connect: {
    defaultMessage: "Connect",
    id: "jLjTPaf/u5",
    description: "Button label to start connecting an integration",
  },
  manage: {
    defaultMessage: "Manage",
    id: "V5IhYqq1Fk",
    description: "Button label to expand integration settings",
  },
  viewOnly: {
    defaultMessage: "View only",
    id: "PLauAF+cPB",
    description: "Badge shown when the user can view but not manage a connected integration",
  },
});
