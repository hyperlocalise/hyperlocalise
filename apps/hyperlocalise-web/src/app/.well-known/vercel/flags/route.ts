import { createFlagsDiscoveryEndpoint, getProviderData } from "flags/next";

import { releaseCatAllFilesFlag } from "../../../../lib/flags/release-flags";
import {
  workspaceAutomationsFlag,
  workspaceKnowledgeFlag,
} from "../../../../lib/flags/workspace-flags";

export const GET = createFlagsDiscoveryEndpoint(async () =>
  getProviderData({
    workspaceAutomationsFlag,
    workspaceKnowledgeFlag,
    releaseCatAllFilesFlag,
  }),
);
