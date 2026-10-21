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
    id: "wxyeiQHV02",
    defaultMessage: "Connected folders and files",
    description: "Heading for saved Google Drive folders and files",
  },
  browseFoldersTitle: {
    id: "zm2ME98OKj",
    defaultMessage: "Browse folders",
    description: "Heading for the in-panel Google Drive folder tree",
  },
  addFolders: {
    id: "VK5TocVhFz",
    defaultMessage: "Add folders",
    description: "Button to save checked Drive folders from the in-panel tree",
  },
  removeFolder: {
    id: "544e82KCxu",
    defaultMessage: "Remove",
    description: "Remove a connected folder",
  },
  showTranslatedFiles: {
    id: "FNuaJvXmwE",
    defaultMessage: "Show translation output files",
    description:
      "Toggle to reveal locale-named Drive files and folders such as [fr] Report.docx or fr/",
  },
  emptyFolders: {
    id: "adcrhyBSEG",
    defaultMessage: "Nothing connected yet. Add folders or supported files to sync.",
    description: "Empty state for connected Drive items",
  },
  browseFailed: {
    id: "BojhT/dBm8",
    defaultMessage: "Could not load Google Drive folders.",
    description: "Error when tree browse fails",
  },
  emptyChildFolders: {
    id: "5U5mHNwgSF",
    defaultMessage: "No items",
    description: "Empty state when an expanded Drive folder has no child folders or files",
  },
  expandFolder: {
    id: "jrCODWcJnu",
    defaultMessage: "Expand {name}",
    description: "Accessible label for expanding a Drive folder in the tree",
  },
  collapseFolder: {
    id: "ikhorRsHZ2",
    defaultMessage: "Collapse {name}",
    description: "Accessible label for collapsing a Drive folder in the tree",
  },
  loadingFolder: {
    id: "lnSP//rdDd",
    defaultMessage: "Loading {name}",
    description: "Accessible label while Drive folder children are loading",
  },
});
