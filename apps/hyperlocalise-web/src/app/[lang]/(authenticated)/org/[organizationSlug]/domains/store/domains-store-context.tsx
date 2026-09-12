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
import { createContext, useContext, useMemo, type ReactNode } from "react";

import type { DomainResearchNavId } from "@/lib/domains/research-prototype";

import { DomainResearchShellStore } from "./domain-research-shell-store";
import { DomainsPageStore } from "./domains-page-store";

const DomainsPageStoreContext = createContext<DomainsPageStore | null>(null);
const DomainResearchShellStoreContext = createContext<DomainResearchShellStore | null>(null);

export function DomainsPageStoreProvider({
  organizationSlug,
  children,
}: {
  organizationSlug: string;
  children: ReactNode;
}) {
  const store = useMemo(() => new DomainsPageStore(organizationSlug), [organizationSlug]);
  return (
    <DomainsPageStoreContext.Provider value={store}>{children}</DomainsPageStoreContext.Provider>
  );
}

export function DomainResearchShellStoreProvider({
  organizationSlug,
  linkedDomainId,
  surface,
  children,
}: {
  organizationSlug: string;
  linkedDomainId: string;
  surface: DomainResearchNavId;
  children: ReactNode;
}) {
  const store = useMemo(
    () =>
      new DomainResearchShellStore({
        organizationSlug,
        linkedDomainId,
        surface,
      }),
    [linkedDomainId, organizationSlug, surface],
  );

  return (
    <DomainResearchShellStoreContext.Provider value={store}>
      {children}
    </DomainResearchShellStoreContext.Provider>
  );
}

export function useDomainsPageStore() {
  const store = useContext(DomainsPageStoreContext);
  if (!store) {
    throw new Error("useDomainsPageStore must be used within DomainsPageStoreProvider");
  }
  return store;
}

export function useDomainResearchShellStore() {
  const store = useContext(DomainResearchShellStoreContext);
  if (!store) {
    throw new Error(
      "useDomainResearchShellStore must be used within DomainResearchShellStoreProvider",
    );
  }
  return store;
}
