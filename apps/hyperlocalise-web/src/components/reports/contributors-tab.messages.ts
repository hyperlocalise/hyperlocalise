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

export const contributorsTabMessages = defineMessages({
  people: {
    id: "2MefOaLoI3",
    defaultMessage: "People who finished work",
    description: "Contributors card: how many people finished strings or logged time",
  },
  finished: {
    id: "34HUmRsk4k",
    defaultMessage: "Finished by people",
    description: "Contributors card: units people finished in the dates",
  },
  unchangedDetail: {
    id: "Fx/7PrGw0Y",
    defaultMessage: "{share} kept unchanged",
    description:
      "Detail under the finished card: the share of finished work people kept as they were given it",
  },
  spent: {
    id: "emTBdZEwuC",
    defaultMessage: "Paid for people's work",
    description: "Contributors card: what people's finished work and logged time cost",
  },
  unpricedDetail: {
    id: "s6bGwMkqQh",
    defaultMessage: "{count, plural, one {# string has no rate} other {# strings have no rate}}",
    description: "Detail under the spent card: finished strings no rate card priced",
  },
  ownWorkOnly: {
    id: "QxqsicM/iW",
    defaultMessage: "You see only your own work.",
    description: "Note on the Contributors tab for members without billing access",
  },
  tableLabel: {
    id: "wgHYL67Rfn",
    defaultMessage: "Work by person",
    description: "Accessible label for the contributors table",
  },
  personColumn: {
    id: "FB0sNVXcL0",
    defaultMessage: "Person",
    description: "Column heading: the person who did the work",
  },
  languagesColumn: {
    id: "3paNHiKLtX",
    defaultMessage: "Languages",
    description: "Column heading: the target languages the person worked on",
  },
  finishedColumn: {
    id: "58CdeEANig",
    defaultMessage: "Finished",
    description: "Column heading: units the person finished",
  },
  unchangedColumn: {
    id: "72umAa8/V7",
    defaultMessage: "Kept unchanged",
    description: "Column heading: units the person finished without changing the given text",
  },
  heavyEditColumn: {
    id: "16Sso7esDq",
    defaultMessage: "Heavily edited",
    description:
      "Column heading: units whose given text the person changed so much it matched under 75%",
  },
  timeColumn: {
    id: "f5e+xCnr6D",
    defaultMessage: "Time logged",
    description: "Column heading: time the person logged",
  },
  spentColumn: {
    id: "sqlMQdTjGd",
    defaultMessage: "Paid",
    description: "Column heading: what the person's work cost",
  },
  removedMember: {
    id: "tIwYtMcHZ5",
    defaultMessage: "Removed member",
    description: "Name shown for work by someone no longer in the workspace",
  },
  noContributors: {
    id: "d0iPSvX4/W",
    defaultMessage: "No one finished strings or logged time in these dates.",
    description: "Empty state of the Contributors tab",
  },
  postEditTitle: {
    id: "G7jdVVU8KY",
    defaultMessage: "Post-edit analysis",
    description: "Heading of the table of how much people changed the text they were given",
  },
  postEditDetail: {
    id: "4/2rftovSG",
    defaultMessage:
      "How close each finished string is to the AI, machine or imported {unit} the person was given, banded as memory matches are. A rate line set to post-edit pricing pays by these bands.",
    description: "Explanation under the post-edit analysis heading",
  },
  postEditTableLabel: {
    id: "A5Dlc8pBMa",
    defaultMessage: "Finished work by post-edit band",
    description: "Accessible label for the post-edit bands table",
  },
  bandColumn: {
    id: "0kUEL0SBUJ",
    defaultMessage: "Band",
    description: "Column heading: the post-edit band",
  },
  unitsColumn: {
    id: "CiaqTCq5cb",
    defaultMessage: "Units",
    description: "Column heading: how many units fall in the band",
  },
  shareColumn: {
    id: "gREWvARrBa",
    defaultMessage: "Share",
    description: "Column heading: the band's share of all finished work",
  },
  postEdit_100: {
    id: "i/4l6v66eY",
    defaultMessage: "Unchanged (100%)",
    description: "Post-edit band: the person kept the given text exactly",
  },
  "postEdit_95-99": {
    id: "l6VIMP822w",
    defaultMessage: "Light edit (95–99%)",
    description: "Post-edit band: the person changed the given text very little",
  },
  "postEdit_85-94": {
    id: "okGZlyV3+n",
    defaultMessage: "Moderate edit (85–94%)",
    description: "Post-edit band: the person changed the given text a little",
  },
  "postEdit_75-84": {
    id: "frMroytoHO",
    defaultMessage: "Substantial edit (75–84%)",
    description: "Post-edit band: the person changed the given text noticeably",
  },
  "postEdit_50-74": {
    id: "EiQWl58S91",
    defaultMessage: "Heavy edit (50–74%)",
    description: "Post-edit band: the person rewrote much of the given text",
  },
  postEdit_new: {
    id: "rXiH4Vb72C",
    defaultMessage: "Rewritten (under 50%)",
    description: "Post-edit band: the person rewrote the given text almost entirely",
  },
  postEdit_none: {
    id: "B1TfQ5oM9Z",
    defaultMessage: "No text given",
    description:
      "Post-edit band: the person wrote the text without a draft to edit, or it is unknown",
  },
});
