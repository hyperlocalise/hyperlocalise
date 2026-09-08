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

export const tmImportHistoryMessages = defineMessages({
  action: {
    defaultMessage: "Import history",
    id: "9Dln9NUE9S",
    description: "Button that opens translation memory import history",
  },
  title: {
    defaultMessage: "Import history",
    id: "9lcqGrB1lq",
    description: "Translation memory import history dialog title",
  },
  description: {
    defaultMessage: "Review imports and open their full diagnostic reports.",
    id: "5d6Q8OXUl3",
    description: "Translation memory import history dialog description",
  },
  loading: {
    defaultMessage: "Loading import history",
    id: "oeaC1JAaH1",
    description: "Accessible text while import history loads",
  },
  emptyTitle: {
    defaultMessage: "No imports yet",
    id: "ZhhmEl6FUY",
    description: "Empty import history title",
  },
  emptyDescription: {
    defaultMessage: "Completed imports will appear here.",
    id: "acWtHwRkfG",
    description: "Empty import history description",
  },
  errorTitle: {
    defaultMessage: "Import history could not be loaded",
    id: "A8n3883pxm",
    description: "Import history error title",
  },
  errorDescription: {
    defaultMessage: "Try again to load the latest import activity.",
    id: "0+3ELrzEns",
    description: "Import history error description",
  },
  unauthorizedTitle: {
    defaultMessage: "Import history is unavailable",
    id: "xYD9jPAzEY",
    description: "Import history unauthorized state title",
  },
  unauthorizedDescription: {
    defaultMessage: "You do not have access to this translation memory's import history.",
    id: "imU5/8V6+u",
    description: "Import history unauthorized state description",
  },
  retry: {
    defaultMessage: "Retry",
    id: "DgJo9wiGFd",
    description: "Retry loading import history",
  },
  loadMore: {
    defaultMessage: "Load more",
    id: "ELUkide5r6",
    description: "Load another page of import history",
  },
  viewReport: {
    defaultMessage: "View report",
    id: "4i06vDK6Zc",
    description: "Open one translation memory import report",
  },
  unknownFile: {
    defaultMessage: "Unnamed import",
    id: "d79cEe2X/c",
    description: "Fallback when an import filename is unavailable",
  },
  unknownActor: {
    defaultMessage: "Unknown user",
    id: "Lj6tOvEMbc",
    description: "Fallback when an import actor is unavailable",
  },
  attemptMeta: {
    defaultMessage: "{actor} · {date}",
    id: "HzfHGExF2v",
    description: "Import actor and timestamp",
  },
  counts: {
    defaultMessage:
      "{created, number} created · {updated, number} updated · {failed, number} failed",
    id: "KX9N4t2DlB",
    description: "Compact import result counts",
  },
  running: {
    defaultMessage: "Running",
    id: "xgL5ochSWF",
    description: "Running translation memory import status",
  },
  completed: {
    defaultMessage: "Completed",
    id: "pxQacxRowI",
    description: "Completed translation memory import status",
  },
  partiallySuccessful: {
    defaultMessage: "Partially successful",
    id: "Wn4fduQvy1",
    description: "Partially successful translation memory import status",
  },
  failed: {
    defaultMessage: "Failed",
    id: "dqfMwoKwX/",
    description: "Failed translation memory import status",
  },
});
