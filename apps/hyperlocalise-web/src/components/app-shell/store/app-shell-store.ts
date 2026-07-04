import { makeAutoObservable } from "mobx";

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

  constructor(defaultNavigationGroups: readonly NavigationGroup[]) {
    this.sidebar = new SidebarStore();
    this.navigation = new NavigationStore(defaultNavigationGroups);
    this.breadcrumb = new BreadcrumbStore();
    this.headerActions = new HeaderActionsStore();

    makeAutoObservable(this, {}, { autoBind: true });
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
