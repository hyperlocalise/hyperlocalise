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

export const googleDriveFolderManagementMessages = defineMessages({
  connectedFoldersTitle: {
    id: "N4v3tZaIsk",
    defaultMessage: "Connected folders",
    description: "Heading for saved Google Drive folders",
  },
  addFolders: {
    id: "KUQgECMYGp",
    defaultMessage: "Add folders",
    description: "Button to open folder picker dialog",
  },
  removeFolder: {
    id: "544e82KCxu",
    defaultMessage: "Remove",
    description: "Remove a connected folder",
  },
  showTranslatedFiles: {
    id: "D1xRfPiwPR",
    defaultMessage: "Show translated files",
    description: "Toggle to reveal locale-prefixed Drive files in the tree",
  },
  emptyFolders: {
    id: "CoKDecVAab",
    defaultMessage: "No folders connected yet. Add Shared Drive or My Drive folders to sync.",
    description: "Empty state for folder list",
  },
  browseFailed: {
    id: "BojhT/dBm8",
    defaultMessage: "Could not load Google Drive folders.",
    description: "Error when tree browse fails",
  },
});
