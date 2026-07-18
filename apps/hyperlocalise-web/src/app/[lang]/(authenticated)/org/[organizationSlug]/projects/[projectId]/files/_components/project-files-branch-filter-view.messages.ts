"use client";

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
