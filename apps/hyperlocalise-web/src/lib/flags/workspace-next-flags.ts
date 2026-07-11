import { flag } from "flags/next";

import {
  workspaceAutomationsFlagDefinition,
  workspaceKnowledgeFlagDefinition,
  workspaceVisualMockFlagDefinition,
} from "./workspace-flag-definitions";
import type { WorkosFlagEntities } from "./workos-flag-entities";

export const workspaceAutomationsFlag = flag<boolean, WorkosFlagEntities>(
  workspaceAutomationsFlagDefinition,
);

export const workspaceKnowledgeFlag = flag<boolean, WorkosFlagEntities>(
  workspaceKnowledgeFlagDefinition,
);

export const workspaceVisualMockFlag = flag<boolean, WorkosFlagEntities>(
  workspaceVisualMockFlagDefinition,
);
