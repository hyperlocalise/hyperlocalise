/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import type { NavigationGroup, NavigationItem } from "@/components/app-shell/navigation-config";

import {
  WORKSPACE_AUTOMATIONS_FLAG,
  WORKSPACE_ISSUES_FLAG,
  WORKSPACE_KNOWLEDGE_FLAG,
  WORKSPACE_VISUAL_MOCK_FLAG,
  type WorkspaceFeatureFlagState,
} from "./workos-flag-entities";

function workspaceFlagEnabledByKey(flags: WorkspaceFeatureFlagState): Record<string, boolean> {
  return {
    [WORKSPACE_AUTOMATIONS_FLAG]: flags.automations,
    [WORKSPACE_KNOWLEDGE_FLAG]: flags.knowledge,
    [WORKSPACE_VISUAL_MOCK_FLAG]: flags.visualMock,
    [WORKSPACE_ISSUES_FLAG]: flags.issues,
  };
}

function isNavigationItemEnabledByWorkspaceFlags(
  item: Pick<NavigationItem, "featureFlagKey">,
  enabledByKey: Record<string, boolean>,
) {
  if (!item.featureFlagKey) {
    return true;
  }

  if (!(item.featureFlagKey in enabledByKey)) {
    return true;
  }

  return enabledByKey[item.featureFlagKey] ?? false;
}

export function filterNavigationItemsByWorkspaceFlags(
  items: readonly NavigationItem[],
  flags: WorkspaceFeatureFlagState,
): readonly NavigationItem[] {
  const enabledByKey = workspaceFlagEnabledByKey(flags);
  return items.filter((item) => isNavigationItemEnabledByWorkspaceFlags(item, enabledByKey));
}

export function filterNavigationByWorkspaceFlags(
  groups: readonly NavigationGroup[],
  flags: WorkspaceFeatureFlagState,
): readonly NavigationGroup[] {
  const enabledByKey = workspaceFlagEnabledByKey(flags);

  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        isNavigationItemEnabledByWorkspaceFlags(item, enabledByKey),
      ),
    }))
    .filter((group) => group.items.length > 0);
}
