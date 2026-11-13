"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License 1.1,
 * use of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { defineMessages } from "react-intl";

export const contentEditorActivityFiltersMessages = defineMessages({
  actorLabel: {
    defaultMessage: "Done by",
    id: "8QfjDQMnF6",
    description: "Label for the activity filter on who made a change",
  },
  anyActor: {
    defaultMessage: "Anyone",
    id: "beUHgdKmcs",
    description: "Activity filter option that shows changes by everyone",
  },
  actorUser: {
    defaultMessage: "People",
    id: "BJJWAMmffk",
    description: "Activity filter option that shows changes made by people",
  },
  actorAgent: {
    defaultMessage: "AI agents",
    id: "+Yz1meRR5E",
    description: "Activity filter option that shows changes made by AI agents",
  },
  actorApiKey: {
    defaultMessage: "API keys",
    id: "kpFxgmzJ5+",
    description: "Activity filter option that shows changes made with API keys",
  },
  actorSystem: {
    defaultMessage: "Jobs and imports",
    id: "GbwiNPTafh",
    description: "Activity filter option that shows changes made by translation jobs and imports",
  },
  eventLabel: {
    defaultMessage: "Change",
    id: "qLyJylYCzA",
    description: "Label for the activity filter on the kind of change",
  },
  anyEvent: {
    defaultMessage: "All changes",
    id: "6bGxPAO+Pv",
    description: "Activity filter option that shows every kind of change",
  },
  eventTranslation: {
    defaultMessage: "Translation edits",
    id: "5QxCY0TeO9",
    description: "Activity filter option that shows translation edits",
  },
  eventReview: {
    defaultMessage: "Approvals and status",
    id: "9opg+oEQbk",
    description: "Activity filter option that shows approvals and status changes",
  },
  eventComment: {
    defaultMessage: "Comments",
    id: "2/3rTQoiy7",
    description: "Activity filter option that shows comments",
  },
  eventLockHide: {
    defaultMessage: "Locks and hiding",
    id: "cgtFQ4wcV0",
    description:
      "Activity filter option that shows strings being locked, unlocked, hidden or unhidden",
  },
  eventFile: {
    defaultMessage: "File uploads and imports",
    id: "EVQscu6Ihz",
    description: "Activity filter option that shows file uploads and translation imports",
  },
  dateLabel: {
    defaultMessage: "When",
    id: "AYfVNcVbT6",
    description: "Label for the activity filter on when a change was made",
  },
  anyTime: {
    defaultMessage: "Any time",
    id: "TlL0wKmuDC",
    description: "Activity filter option that shows changes from any time",
  },
  lastDay: {
    defaultMessage: "Last 24 hours",
    id: "zuMuHjuvlv",
    description: "Activity filter option that shows changes from the last 24 hours",
  },
  lastWeek: {
    defaultMessage: "Last 7 days",
    id: "QjMQ0YNYXB",
    description: "Activity filter option that shows changes from the last 7 days",
  },
  lastMonth: {
    defaultMessage: "Last 30 days",
    id: "ZjELFpCnqL",
    description: "Activity filter option that shows changes from the last 30 days",
  },
});
