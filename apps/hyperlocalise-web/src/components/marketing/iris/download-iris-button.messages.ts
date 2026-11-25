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

export const downloadIrisButtonMessages = defineMessages({
  downloadIris: {
    defaultMessage: "Download Iris",
    id: "5OqquqGiMa",
    description:
      "Primary marketing call-to-action that downloads the Iris desktop app on a Mac, or opens the Iris page elsewhere",
  },
  freeBadge: {
    defaultMessage: "Free",
    id: "DBpkRRnvyH",
    description: "Small badge inside the Download Iris button saying Iris is free to start using",
  },
  downloadStartedTitle: {
    defaultMessage: "Iris is downloading",
    id: "NPzSWXmSze",
    description: "Toast title shown after a visitor starts downloading the Iris Mac app",
  },
  downloadStartedBody: {
    defaultMessage:
      "Open the Iris file in your Downloads folder, then drag Iris into Applications.",
    id: "/gZRu7p4LI",
    description:
      "Toast body telling a visitor how to install the Iris Mac app they just downloaded",
  },
  availabilityNote: {
    defaultMessage: "Free to download. Mac only for now.",
    id: "aYIs6jAO+Z",
    description:
      "Short note under an Iris download button saying the app costs nothing to download and only runs on macOS today",
  },
  seePricing: {
    defaultMessage: "See pricing",
    id: "quTg02JT7U",
    description: "Link after the Iris availability note that opens the pricing page",
  },
});
