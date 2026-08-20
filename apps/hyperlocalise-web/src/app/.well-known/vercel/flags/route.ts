import { createFlagsDiscoveryEndpoint, getProviderData } from "flags/next";

import {
  releaseCatAllFilesFlag,
  releaseSandboxVcrImageFlag,
} from "../../../../lib/flags/release-flags";
import {
  workspaceAutomationsFlag,
  workspaceDomainsFlag,
  workspaceKnowledgeFlag,
} from "../../../../lib/flags/workspace-flags";

export const GET = createFlagsDiscoveryEndpoint(async () =>
  getProviderData({
    workspaceAutomationsFlag,
    workspaceDomainsFlag,
    workspaceKnowledgeFlag,
    releaseCatAllFilesFlag,
    releaseSandboxVcrImageFlag,
  }),
);
