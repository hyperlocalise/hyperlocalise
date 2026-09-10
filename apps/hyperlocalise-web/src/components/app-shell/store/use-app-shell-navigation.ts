"use client";

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
import { useEffect, useRef } from "react";

import type { NavigationGroup } from "@/components/app-shell/navigation-config";

import type { NavigationDomainContext, NavigationProjectContext } from "./navigation-store";
import { useAppShellStore } from "./app-shell-store-context";

type AppShellNavigationCustomConfig = {
  /**
   * Navigation groups to render in custom mode. Pass a stable reference (module-level
   * constant or `useMemo`) when the groups do not change for the lifetime of the page.
   */
  groups: readonly NavigationGroup[];
  projectContext?: NavigationProjectContext;
  domainContext?: NavigationDomainContext;
};

function buildGroupsSignature(groups: readonly NavigationGroup[]) {
  return groups
    .flatMap((group) =>
      group.items.map((item) => `${group.label ?? ""}:${item.href}:${item.label}`),
    )
    .join("\0");
}

export function useAppShellNavigationCustom({
  groups,
  projectContext,
  domainContext,
}: AppShellNavigationCustomConfig) {
  const store = useAppShellStore();
  const groupsRef = useRef(groups);
  const projectContextRef = useRef(projectContext);
  const domainContextRef = useRef(domainContext);
  groupsRef.current = groups;
  projectContextRef.current = projectContext;
  domainContextRef.current = domainContext;

  const groupsSignature = buildGroupsSignature(groups);
  const organizationSlug = projectContext?.organizationSlug ?? domainContext?.organizationSlug;
  const projectId = projectContext?.projectId;
  const projectName = projectContext?.projectName;
  const linkedDomainId = domainContext?.linkedDomainId;
  const domainName = domainContext?.domainName;

  useEffect(() => {
    store.navigation.setCustomNavigation(groupsRef.current, {
      projectContext: projectContextRef.current,
      domainContext: domainContextRef.current,
    });

    return () => {
      store.navigation.clearCustomMode();
    };
  }, [store, groupsSignature, organizationSlug, projectId, projectName, linkedDomainId, domainName]);
}
