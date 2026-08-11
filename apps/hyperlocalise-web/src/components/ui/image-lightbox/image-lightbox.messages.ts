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

export const imageLightboxMessages = defineMessages({
  close: {
    defaultMessage: "Close",
    id: "KRRKR3H/tH",
    description: "Accessible label for closing the image lightbox",
  },
  zoomIn: {
    defaultMessage: "Zoom in",
    id: "NERy9XM6Cd",
    description: "Accessible label for zooming in within the image lightbox",
  },
  zoomOut: {
    defaultMessage: "Zoom out",
    id: "mSR1oODTzi",
    description: "Accessible label for zooming out within the image lightbox",
  },
  resetZoom: {
    defaultMessage: "Reset zoom",
    id: "kIG+JJHbzJ",
    description: "Accessible label for resetting zoom and pan in the image lightbox",
  },
  zoomLevel: {
    defaultMessage: "{percent}%",
    id: "xbAzhdR+Tu",
    description: "Current zoom percentage shown in the image lightbox toolbar",
  },
  openPreview: {
    defaultMessage: "Open screenshot preview",
    id: "ODRuwyxRYT",
    description: "Accessible label for opening a screenshot in the lightbox",
  },
});
