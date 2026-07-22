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

export const issuesProjectImportDialogMessages = defineMessages({
  title: {
    defaultMessage: "Import issues",
    id: "ArlyHj1L4U",
    description: "Title of the workspace issues CSV import project picker dialog",
  },
  description: {
    defaultMessage: "Choose which project should receive the imported Issue Sheet rows.",
    id: "mL4jmlzo/F",
    description: "Description of the workspace issues CSV import project picker dialog",
  },
  emptyProjects: {
    defaultMessage: "Create a project first, then import issues into its Issue Sheet.",
    id: "ipVFcJ8AtN",
    description: "Empty state when there are no projects to import issues into",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "PFnRx7mFmC",
    description: "Cancel button in the workspace issues import project picker",
  },
  continue: {
    defaultMessage: "Continue",
    id: "rQ4NeDF7KU",
    description: "Continue button in the workspace issues import project picker",
  },
});
