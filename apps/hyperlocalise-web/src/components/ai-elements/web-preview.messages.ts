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

export const webPreviewMessages = defineMessages({
  urlPlaceholder: {
    id: "iZaQ7K2itB",

    defaultMessage: "Enter URL...",
    description: "Placeholder for the web preview URL input",
  },
  previewTitle: {
    id: "usgyWI2m6M",

    defaultMessage: "Preview",
    description: "Title attribute for the web preview iframe",
  },
  console: {
    id: "tj9LSxTmXM",

    defaultMessage: "Console",
    description: "Label for the web preview console collapsible section",
  },
  noConsoleOutput: {
    id: "P7DyqhOghg",

    defaultMessage: "No console output",
    description: "Empty state when the web preview console has no logs",
  },
});
