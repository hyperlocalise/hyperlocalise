import { createFlagsDiscoveryEndpoint, getProviderData } from "flags/next";

import {
  releaseContentEditorAllFilesFlag,
  releaseCatAdaptiveWorkspaceFlag,
  releaseSandboxVcrImageFlag,
} from "../../../../lib/flags/release-flags";
import {
  workspaceAutomationsFlag,
  workspaceDomainsFlag,
  workspaceKnowledgeFlag,
  workspaceReportsFlag,
} from "../../../../lib/flags/workspace-flags";

export const GET = createFlagsDiscoveryEndpoint(async () =>
  getProviderData({
    workspaceAutomationsFlag,
    workspaceDomainsFlag,
    workspaceKnowledgeFlag,
    workspaceReportsFlag,
    releaseContentEditorAllFilesFlag,
    releaseCatAdaptiveWorkspaceFlag,
    releaseSandboxVcrImageFlag,
  }),
);
