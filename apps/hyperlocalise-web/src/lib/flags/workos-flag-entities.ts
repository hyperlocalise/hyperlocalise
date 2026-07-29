/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
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
