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

export const calendarMessages = defineMessages({
  previousMonth: {
    defaultMessage: "Previous month",
    id: "TmsxbZMIfi",
    description: "Accessible name of the calendar button that shows the month before",
  },
  today: {
    defaultMessage: "Today, {date}",
    id: "Xsh+x2oIBp",
    description: "What a screen reader hears for today's day in a calendar; date is the full date",
  },
  selected: {
    defaultMessage: "{date}, selected",
    id: "j9LmfBHPxj",
    description: "What a screen reader hears for a chosen day in a calendar; date is the full date",
  },
  nextMonth: {
    defaultMessage: "Next month",
    id: "s1vMAssL4M",
    description: "Accessible name of the calendar button that shows the month after",
  },
});
