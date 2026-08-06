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

export const issueWatchControlMessages = defineMessages({
  fieldWatch: {
    defaultMessage: "Notifications",
    id: "lPWJxlAqbq",
    description: "Label for the issue watch control in the detail sidebar",
  },
  watching: {
    defaultMessage: "Watching",
    id: "PrVMTdEIQS",
    description: "Button label when the current user is subscribed to issue updates",
  },
  notWatching: {
    defaultMessage: "Watch",
    id: "V7gYPd0v2H",
    description: "Button label when the current user is not subscribed to issue updates",
  },
  watchError: {
    defaultMessage: "Could not update watch settings",
    id: "KzyWBbcmTH",
    description: "Toast shown when watch or unwatch fails",
  },
});
