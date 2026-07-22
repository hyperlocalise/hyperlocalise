/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { makeAutoObservable } from "mobx";

import { ChatDockStore } from "@/components/app-shell/chat-dock/chat-dock-store";
import type { NavigationGroup } from "@/components/app-shell/navigation-config";
import {
  DISABLED_WORKSPACE_FEATURE_FLAGS,
  type WorkspaceFeatureFlagState,
} from "@/lib/flags/workos-flag-entities";

import { BreadcrumbStore } from "./breadcrumb-store";
import { HeaderActionsStore } from "./header-actions-store";
import { NavigationStore } from "./navigation-store";
import { SidebarStore } from "./sidebar-store";

export class AppShellStore {
  sidebar: SidebarStore;
  navigation: NavigationStore;
  breadcrumb: BreadcrumbStore;
  headerActions: HeaderActionsStore;
  chatDock: ChatDockStore;
  workspaceFeatureFlags: WorkspaceFeatureFlagState;

  constructor(
    defaultNavigationGroups: readonly NavigationGroup[],
    workspaceFeatureFlags: WorkspaceFeatureFlagState,
  ) {
    this.sidebar = new SidebarStore();
    this.navigation = new NavigationStore(defaultNavigationGroups);
    this.breadcrumb = new BreadcrumbStore();
    this.headerActions = new HeaderActionsStore();
    this.chatDock = new ChatDockStore();
    this.workspaceFeatureFlags = workspaceFeatureFlags;

    makeAutoObservable(
      this,
      {
        chatDock: false,
      },
      { autoBind: true },
    );
  }

  resetPageScope() {
    this.breadcrumb.clearOverrides();
    this.headerActions.clearAll();
    this.navigation.clearCustomMode();
    this.sidebar.setForceCollapsed(false);
    this.sidebar.setPreferredOpen(null);
    this.chatDock.clearPageContext();
  }
}

export function createAppShellStore(
  defaultNavigationGroups: readonly NavigationGroup[],
  workspaceFeatureFlags: WorkspaceFeatureFlagState = DISABLED_WORKSPACE_FEATURE_FLAGS,
) {
  return new AppShellStore(defaultNavigationGroups, workspaceFeatureFlags);
}
