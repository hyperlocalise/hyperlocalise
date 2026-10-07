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

export const intercomPushUiMessages = defineMessages({
  pushButton: {
    id: "cEmBHtXwxM",
    defaultMessage: "Push to Intercom",
    description:
      "Button to queue writing approved Help Center translations to Intercom as drafts (not published)",
  },
  pushQueued: {
    id: "mQ8WJAG0a1",
    defaultMessage: "Intercom push queued",
    description: "Toast after an Intercom push automation run is queued",
  },
  pushFailed: {
    id: "uFwOz05XQ5",
    defaultMessage: "Could not queue Intercom push",
    description: "Toast when queuing an Intercom push automation run fails",
  },
});
