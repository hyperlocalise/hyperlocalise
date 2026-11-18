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

export const jobComesAfterFieldMessages = defineMessages({
  label: {
    defaultMessage: "Comes after",
    id: "WDLvPq44w7",
    description:
      "Label of the row on a task's page naming the earlier task that must be finished before this one can start",
  },
  earlierTask: {
    defaultMessage: "Earlier task",
    id: "N9QT573W/v",
    description:
      "Link text on a task's page for the task it comes after, shown when that task's title cannot be read",
  },
  waiting: {
    defaultMessage: "This task opens when that one is marked done or cancelled.",
    id: "caOnhTFV4k",
    description: "Note on a waiting task's page, under the link to the earlier task it comes after",
  },
});
