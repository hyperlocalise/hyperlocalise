import { makeAutoObservable } from "mobx";

import { ChatDockStore } from "@/components/app-shell/chat-dock/chat-dock-store";
import type { NavigationGroup } from "@/components/app-shell/navigation-config";

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

  constructor(defaultNavigationGroups: readonly NavigationGroup[]) {
    this.sidebar = new SidebarStore();
    this.navigation = new NavigationStore(defaultNavigationGroups);
    this.breadcrumb = new BreadcrumbStore();
    this.headerActions = new HeaderActionsStore();
    this.chatDock = new ChatDockStore();

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
  }
}

export function createAppShellStore(defaultNavigationGroups: readonly NavigationGroup[]) {
  return new AppShellStore(defaultNavigationGroups);
}
