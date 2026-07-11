import { createFlagsDiscoveryEndpoint, getProviderData } from "flags/next";

import {
  workspaceAutomationsFlag,
  workspaceKnowledgeFlag,
} from "../../../../lib/flags/workspace-flags";

export const GET = createFlagsDiscoveryEndpoint(async () =>
  getProviderData({
    workspaceAutomationsFlag,
    workspaceKnowledgeFlag,
  }),
);
