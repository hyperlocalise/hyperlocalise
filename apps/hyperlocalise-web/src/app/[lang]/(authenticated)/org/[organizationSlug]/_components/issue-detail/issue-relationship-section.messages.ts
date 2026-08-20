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

export const issueRelationshipSectionMessages = defineMessages({
  heading: {
    defaultMessage: "Relationships",
    id: "mnQrjAyyw8",
    description: "Heading for the issue relationships section in the issue detail panel",
  },
  empty: {
    defaultMessage: "No relationships yet",
    id: "DQnt+zm1/q",
    description: "Shown when an issue has no relationships",
  },
  remove: {
    defaultMessage: "Remove relationship",
    id: "c0wyG2sMeU",
    description: "Accessible label for the remove-relationship button",
  },
  addError: {
    defaultMessage: "Could not add relationship",
    id: "WphtFQWMLA",
    description: "Fallback toast when creating a relationship fails",
  },
  removeError: {
    defaultMessage: "Could not remove relationship",
    id: "p22y6wrB6M",
    description: "Fallback toast when removing a relationship fails",
  },
  loadError: {
    defaultMessage: "Could not load relationships",
    id: "r3j9bzJdAk",
    description: "Shown when the relationships list fails to load",
  },
});
