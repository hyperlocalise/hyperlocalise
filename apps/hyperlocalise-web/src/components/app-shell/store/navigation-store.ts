import { makeAutoObservable } from "mobx";

import type { NavigationGroup } from "@/components/app-shell/navigation-config";

export type NavigationProjectContext = {
  organizationSlug: string;
  projectId: string;
  projectName?: string;
};

export type NavigationCustomState = {
  groups: readonly NavigationGroup[];
  projectContext?: NavigationProjectContext;
};

export class NavigationStore {
  mode: "route" | "custom" = "route";
  customState: NavigationCustomState | null = null;

  constructor(private readonly defaultGroups: readonly NavigationGroup[]) {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  get defaultNavigationGroups(): readonly NavigationGroup[] {
    return this.defaultGroups;
  }

  get activeGroups(): readonly NavigationGroup[] {
    if (this.mode === "custom" && this.customState) {
      return this.customState.groups;
    }

    return this.defaultGroups;
  }

  get activeProjectContext(): NavigationProjectContext | null {
    return this.customState?.projectContext ?? null;
  }

  setCustomNavigation(
    groups: readonly NavigationGroup[],
    projectContext?: NavigationProjectContext,
  ) {
    this.mode = "custom";
    this.customState = { groups, projectContext };
  }

  clearCustomMode() {
    this.mode = "route";
    this.customState = null;
  }
}
