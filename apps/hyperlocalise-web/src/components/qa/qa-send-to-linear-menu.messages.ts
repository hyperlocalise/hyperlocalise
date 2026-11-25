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
"use client";

import { defineMessages } from "react-intl";

export const qaSendToLinearMenuMessages = defineMessages({
  trigger: {
    defaultMessage: "Send to Linear",
    id: "g61fLD4F1a",
    description: "Button on the QA findings bar that files the selected findings as Linear issues",
  },
  chooseTeam: {
    defaultMessage: "Create issues in team",
    id: "xYAEn3Yicl",
    description: "Label above the list of Linear teams to file QA findings in",
  },
  loadingTeams: {
    defaultMessage: "Loading teams…",
    id: "w2cJysSXjy",
    description: "Shown while the Linear teams list loads",
  },
  noTeams: {
    defaultMessage: "No Linear teams found",
    id: "DJwiwpSIjB",
    description: "Shown when the connected Linear account has no teams",
  },
  notConnected: {
    defaultMessage: "Connect Linear in Integrations to send findings there.",
    id: "mRh696+WIu",
    description: "Shown when the person has not connected their Linear account",
  },
  loadError: {
    defaultMessage: "Could not load Linear teams.",
    id: "EFdSAgjqjW",
    description: "Shown when the Linear teams list fails to load",
  },
  sent: {
    defaultMessage:
      "Created {count, plural, one {# Linear issue} other {# Linear issues}} in {team}",
    id: "f/GttDI9Xi",
    description: "Toast after QA findings were filed as Linear issues",
  },
  partlySent: {
    defaultMessage: "Created {count} of {total} Linear issues in {team}. The rest were not sent.",
    id: "1kXBD4X9vj",
    description: "Toast when only some QA findings were filed as Linear issues",
  },
  sendError: {
    defaultMessage: "Could not create Linear issues.",
    id: "GgaVU1Vn/i",
    description: "Toast when no QA findings could be filed as Linear issues",
  },
  openIssue: {
    defaultMessage: "Open {identifier}",
    id: "HsjxzJIUuM",
    description: "Toast action that opens the Linear issue just created",
  },
});
