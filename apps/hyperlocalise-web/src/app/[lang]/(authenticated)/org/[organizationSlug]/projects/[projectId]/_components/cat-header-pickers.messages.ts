"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { defineMessages } from "react-intl";

export const catHeaderPickersMessages = defineMessages({
  allFiles: {
    defaultMessage: "All Files",
    id: "xC7u8V65Ad",
    description: "Label for selecting every source file in the CAT header file picker",
  },
  sourceFileAriaLabel: {
    defaultMessage: "Source file",
    id: "mGMHPd7U67",
    description: "Accessible label for the CAT header source file picker trigger",
  },
  chooseSourceFileTitle: {
    defaultMessage: "Choose source file",
    id: "v4h0afylvD",
    description: "Title of the CAT header dialog for picking a source file",
  },
  chooseSourceFileDescription: {
    defaultMessage: "Browse the file tree, or choose All Files to view strings across every file.",
    id: "vem1yM2hIl",
    description: "Description of the CAT header source file picker dialog",
  },
  sourceFilesAriaLabel: {
    defaultMessage: "Source files",
    id: "tmfZmWyVtO",
    description: "Accessible label for the source files tree in the CAT file picker dialog",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "x3OopfTeHB",
    description: "Cancel button that closes the CAT source file picker dialog",
  },
  openFile: {
    defaultMessage: "Open file",
    id: "1fbz+5ygrq",
    description: "Confirm button that opens the selected source file in the CAT header",
  },
  targetLocaleAriaLabel: {
    defaultMessage: "Target locale",
    id: "McaXYZeuHm",
    description: "Accessible label for the CAT header target locale select",
  },
  localePlaceholder: {
    defaultMessage: "Locale",
    id: "YOYL3H2qOe",
    description: "Placeholder for the CAT header target locale select when empty",
  },
  localeCode: {
    defaultMessage: "({locale})",
    id: "ZBPKpZ5WZT",
    description: "Locale code shown in parentheses next to the locale display name",
  },

  githubRepositoryAriaLabel: {
    defaultMessage: "GitHub repository",
    id: "nRa4VGuM7T",
    description: "Accessible label for the CAT header GitHub repository select",
  },
  githubRepoPlaceholder: {
    defaultMessage: "GitHub repo",
    id: "dVKtjZIVrj",
    description: "Placeholder for the CAT header GitHub repository select when empty",
  },
});
