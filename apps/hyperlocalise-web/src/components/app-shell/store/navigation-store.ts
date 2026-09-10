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
import { makeAutoObservable } from "mobx";

import type { NavigationGroup } from "@/components/app-shell/navigation-config";

export type NavigationProjectContext = {
  organizationSlug: string;
  projectId: string;
  projectName?: string;
};

export type NavigationDomainContext = {
  organizationSlug: string;
  linkedDomainId: string;
  domainName?: string;
};

export type NavigationCustomOptions = {
  projectContext?: NavigationProjectContext;
  domainContext?: NavigationDomainContext;
};

export type NavigationCustomState = {
  groups: readonly NavigationGroup[];
  projectContext?: NavigationProjectContext;
  domainContext?: NavigationDomainContext;
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

  get activeDomainContext(): NavigationDomainContext | null {
    return this.customState?.domainContext ?? null;
  }

  setCustomNavigation(groups: readonly NavigationGroup[], options?: NavigationCustomOptions) {
    this.mode = "custom";
    this.customState = {
      groups,
      projectContext: options?.projectContext,
      domainContext: options?.domainContext,
    };
  }

  clearCustomMode() {
    this.mode = "route";
    this.customState = null;
  }
}
