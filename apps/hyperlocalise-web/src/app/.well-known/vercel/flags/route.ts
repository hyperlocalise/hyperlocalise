import { createFlagsDiscoveryEndpoint, getProviderData } from "flags/next";

import {
  releaseContentEditorAllFilesFlag,
  releaseCatAdaptiveWorkspaceFlag,
  releaseQaSandboxVcrImageFlag,
  releaseSandboxVcrImageFlag,
} from "../../../../lib/flags/release-flags";
import {
  workspaceAutomationsFlag,
  workspaceDomainsFlag,
} from "../../../../lib/flags/workspace-flags";

export const GET = createFlagsDiscoveryEndpoint(async () =>
  getProviderData({
    workspaceAutomationsFlag,
    workspaceDomainsFlag,
    releaseContentEditorAllFilesFlag,
    releaseCatAdaptiveWorkspaceFlag,
    releaseSandboxVcrImageFlag,
    releaseQaSandboxVcrImageFlag,
  }),
);
