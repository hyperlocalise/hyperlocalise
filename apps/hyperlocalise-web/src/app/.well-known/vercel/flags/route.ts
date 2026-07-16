import { createFlagsDiscoveryEndpoint, getProviderData } from "flags/next";

import { releaseCatAllFilesFlag } from "../../../../lib/flags/release-flags";
import {
  workspaceAutomationsFlag,
  workspaceIssuesFlag,
  workspaceKnowledgeFlag,
} from "../../../../lib/flags/workspace-flags";

export const GET = createFlagsDiscoveryEndpoint(async () =>
  getProviderData({
    workspaceAutomationsFlag,
    workspaceIssuesFlag,
    workspaceKnowledgeFlag,
    releaseCatAllFilesFlag,
  }),
);
