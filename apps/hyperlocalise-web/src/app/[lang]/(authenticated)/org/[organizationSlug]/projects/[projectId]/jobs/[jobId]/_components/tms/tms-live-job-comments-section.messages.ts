"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { defineMessages } from "react-intl";

export const tmsLiveJobCommentsSectionMessages = defineMessages({
  failedToLoadComments: {
    defaultMessage: "Failed to load task comments ({status})",
    id: "FL4JOA6ty3",
    description: "Error when the live TMS job comments request fails",
  },
  loadingComments: {
    defaultMessage: "Loading comments…",
    id: "d/9ffbWC5T",
    description: "Loading state while task comments are fetching",
  },
  unableToLoadComments: {
    defaultMessage: "Unable to load task comments.",
    id: "NITlc8aQr0",
    description: "Error state when task comments fail to load",
  },
  noCommentsYet: {
    defaultMessage: "No comments yet.",
    id: "ne4Ygl2/V7",
    description: "Empty state when a task has no comments",
  },
  userLabel: {
    defaultMessage: "User {userId}",
    id: "qCfni2dOxG",
    description: "Comment author label when only a numeric user id is available",
  },
  timeSpentMinutes: {
    defaultMessage: "{minutes} min",
    id: "K2qrpmrlsF",
    description: "Time spent on a comment when under one hour",
  },
  timeSpentHours: {
    defaultMessage: "{hours} hr",
    id: "dC80UX3i75",
    description: "Time spent on a comment in whole hours",
  },
  timeSpentHoursMinutes: {
    defaultMessage: "{hours} hr {minutes} min",
    id: "FZJSisAX7z",
    description: "Time spent on a comment with hours and remaining minutes",
  },
  timeSpentLabel: {
    defaultMessage: "Time spent: {duration}",
    id: "zfKDF52Xgo",
    description: "Label showing how long was logged on a comment",
  },
});
