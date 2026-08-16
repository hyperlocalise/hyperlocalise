import { createFlagsDiscoveryEndpoint, getProviderData } from "flags/next";

import {
  releaseCatAllFilesFlag,
  releaseSandboxVcrImageFlag,
} from "../../../../lib/flags/release-flags";
import {
  workspaceAutomationsFlag,
  workspaceDomainsFlag,
  workspaceIssuesFlag,
  workspaceKnowledgeFlag,
} from "../../../../lib/flags/workspace-flags";

export const GET = createFlagsDiscoveryEndpoint(async () =>
  getProviderData({
    workspaceAutomationsFlag,
    workspaceDomainsFlag,
    workspaceIssuesFlag,
    workspaceKnowledgeFlag,
    releaseCatAllFilesFlag,
    releaseSandboxVcrImageFlag,
  }),
);
