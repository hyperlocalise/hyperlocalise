import type { Adapter } from "flags";

import { workosAdapter } from "./workos-adapter";
import {
  WORKSPACE_AUTOMATIONS_FLAG,
  WORKSPACE_KNOWLEDGE_FLAG,
  WORKSPACE_VISUAL_MOCK_FLAG,
  type WorkosFlagEntities,
} from "./workos-flag-entities";

export type WorkspaceFlagDefinition = {
  key: string;
  defaultValue: boolean;
  description: string;
  adapter: Adapter<boolean, WorkosFlagEntities>;
};

export const workspaceAutomationsFlagDefinition = {
  key: WORKSPACE_AUTOMATIONS_FLAG,
  defaultValue: false,
  description: "Workspace automations for scheduled and GitHub-triggered workflows.",
  adapter: workosAdapter(),
} satisfies WorkspaceFlagDefinition;

export const workspaceKnowledgeFlagDefinition = {
  key: WORKSPACE_KNOWLEDGE_FLAG,
  defaultValue: false,
  description: "Workspace knowledge memory for agents and teams.",
  adapter: workosAdapter(),
} satisfies WorkspaceFlagDefinition;

export const workspaceVisualMockFlagDefinition = {
  key: WORKSPACE_VISUAL_MOCK_FLAG,
  defaultValue: false,
  description: "Visual mock skill for repository-backed Hyperlocalise agent previews.",
  adapter: workosAdapter(),
} satisfies WorkspaceFlagDefinition;
