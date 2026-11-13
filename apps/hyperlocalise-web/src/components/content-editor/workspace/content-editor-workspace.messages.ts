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

export const contentEditorWorkspaceViewMessages = defineMessages({
  segmentPosition: {
    defaultMessage: "{position} / {total}",
    id: "8UnBVLcjgq",
    description: "Current segment index and total count in the compact CAT workspace header",
  },
  segmentPositionOpenEnded: {
    defaultMessage: "{position}+",
    id: "0x11s5ha3b",
    description: "Current segment index when more queue pages may exist and total count is unknown",
  },
  resizeQueuePanel: {
    defaultMessage: "Resize queue panel",
    id: "e/sLamxaMH",
    description: "Accessible name for the horizontal handle that resizes the CAT queue panel",
  },
  resizeIntelligencePanel: {
    defaultMessage: "Resize translation intelligence panel",
    id: "ml60MI46D3",
    description:
      "Accessible name for the horizontal handle that resizes the CAT translation intelligence panel",
  },
  resizeFilesPanel: {
    defaultMessage: "Resize files panel",
    id: "35isho44eM",
    description: "Accessible name for the horizontal handle that resizes the CAT files panel",
  },
  showFilesPanel: {
    defaultMessage: "Show files panel",
    id: "fyzfb0jEn1",
    description: "Tooltip for the button that expands the collapsed CAT files panel",
  },
  hideFilesPanel: {
    defaultMessage: "Hide files panel",
    id: "eUJApGyjuF",
    description: "Tooltip for the button that collapses the CAT files panel",
  },
  showDetailsPanel: {
    defaultMessage: "Show details panel",
    id: "0EcPa1ikHA",
    description: "Tooltip for the button that expands the collapsed CAT segment details panel",
  },
  hideDetailsPanel: {
    defaultMessage: "Hide details panel",
    id: "9WEcM4n9w3",
    description: "Tooltip for the button that collapses the CAT segment details panel",
  },
});
