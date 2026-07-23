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

export const projectFilesBranchFilterViewMessages = defineMessages({
  loadingBranches: {
    defaultMessage: "Loading branches…",
    id: "0r2uyKvHbT",
    description: "Loading state while provider project branches are fetched",
  },
  branchLabel: {
    defaultMessage: "Branch",
    id: "bJPgIG0M7T",
    description: "Label next to the project files branch filter select",
  },
  allBranches: {
    defaultMessage: "All branches",
    id: "IC7HPRYydx",
    description: "Option and placeholder to show files from all branches",
  },
  branchWithTitle: {
    defaultMessage: "{title} ({name})",
    id: "LjtFEh0HMb",
    description: "Branch option showing display title and branch name",
  },
});
