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

export const messageMessages = defineMessages({
  previousBranchAria: {
    defaultMessage: "Previous branch",
    id: "nEmus6iEdf",
    description: "Accessible label and tooltip for navigating to the previous message branch",
  },
  nextBranchAria: {
    defaultMessage: "Next branch",
    id: "p5GCpw9x8C",
    description: "Accessible label and tooltip for navigating to the next message branch",
  },
  branchPage: {
    defaultMessage: "{current} of {total}",
    id: "Wh0P2263Np",
    description: "Message branch pager showing the current branch index and total branches",
  },
});
