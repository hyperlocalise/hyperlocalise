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
    defaultMessage: "Import/export history",
    id: "LNUnZ4sgEn",
    description: "Button that opens translation memory import and export history",
  },
  title: {
    defaultMessage: "Import/export history",
    id: "4/+3RXAa/C",
    description: "Translation memory import and export history dialog title",
  },
  description: {
    defaultMessage: "Review imports and exports, then open a report to download a finished export.",
    id: "gQaOHIIj8G",
    description: "Translation memory import and export history dialog description",
  },
  loading: {
    defaultMessage: "Loading import and export history",
    id: "RuyvQfr0dN",
    description: "Accessible text while import and export history loads",
  },
  emptyTitle: {
    defaultMessage: "No imports or exports yet",
    id: "+rVY1tG/6/",
    description: "Empty import and export history title",
  },
  emptyDescription: {
    defaultMessage: "Queued and completed imports and exports will appear here.",
    id: "LyPYie6GUZ",
    description: "Empty import and export history description",
  },
  errorTitle: {
    defaultMessage: "Import and export history could not be loaded",
    id: "RpaqVDCd+1",
    description: "Import and export history error title",
  },
  errorDescription: {
    defaultMessage: "Try again to load the latest import and export activity.",
    id: "B8yt0IjyM2",
    description: "Import and export history error description",
  },
  unauthorizedTitle: {
    defaultMessage: "Import and export history is unavailable",
    id: "Px1DmQ6Gxp",
    description: "Import and export history unauthorized state title",
  },
  unauthorizedDescription: {
    defaultMessage:
      "You do not have access to this translation memory's import and export history.",
    id: "MM0m7VaEfu",
    description: "Import and export history unauthorized state description",
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
  unnamedExport: {
    defaultMessage: "{format} export",
    id: "eIzQewHUyw",
    description: "Fallback name for an export that has no filename yet",
  },
  importOperation: {
    defaultMessage: "Import",
    id: "mV7baqXXbb",
    description: "Translation memory import operation label",
  },
  exportOperation: {
    defaultMessage: "Export",
    id: "GYwOqW2z7j",
    description: "Translation memory export operation label",
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
  exportCounts: {
    defaultMessage: "{entries, number} exported",
    id: "/WvxTFZmtz",
    description: "Compact export result count",
  },
  uploadPending: {
    defaultMessage: "Upload pending",
    id: "h+UBaWw3mM",
    description: "Pending translation memory import upload status",
  },
  queued: {
    defaultMessage: "Queued",
    id: "/9rdVrlT2+",
    description: "Queued translation memory import status",
  },
  running: {
    defaultMessage: "Running",
    id: "xgL5ochSWF",
    description: "Running translation memory import status",
  },
  previewCompleted: {
    defaultMessage: "Preview ready",
    id: "Wa3kCtjTDm",
    description: "Legacy translation memory import preview status (read-only)",
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
