export const WORKSPACE_AUTOMATIONS_FLAG = "workspace-automations";
export const WORKSPACE_KNOWLEDGE_FLAG = "workspace-knowledge";
export const WORKSPACE_VISUAL_MOCK_FLAG = "workspace-visual-mock";
export const WORKSPACE_ISSUES_FLAG = "workspace-issues";
export const WORKSPACE_FEATURE_UNAVAILABLE_REASON = "feature-unavailable";

export type WorkosFlagEntities = {
  user?: { id: string };
  organization?: { id: string };
};

export type WorkspaceFeatureFlagState = {
  automations: boolean;
  knowledge: boolean;
  visualMock: boolean;
  issues: boolean;
};

export const DISABLED_WORKSPACE_FEATURE_FLAGS: WorkspaceFeatureFlagState = {
  automations: false,
  knowledge: false,
  visualMock: false,
  issues: false,
};
