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

import { GlossaryDetailPageStore } from "./glossary-detail-page-store";

const GlossaryDetailPageStoreContext = createContext<GlossaryDetailPageStore | null>(null);

export function GlossaryDetailPageStoreProvider({
  organizationSlug,
  glossaryId,
  children,
}: {
  organizationSlug: string;
  glossaryId: string;
  children: ReactNode;
}) {
  const store = useMemo(
    () => new GlossaryDetailPageStore(organizationSlug, glossaryId),
    [organizationSlug, glossaryId],
  );
  return (
    <GlossaryDetailPageStoreContext.Provider value={store}>
      {children}
    </GlossaryDetailPageStoreContext.Provider>
  );
}

export function useGlossaryDetailPageStore() {
  const store = useContext(GlossaryDetailPageStoreContext);
  if (!store) {
    throw new Error(
      "useGlossaryDetailPageStore must be used within GlossaryDetailPageStoreProvider",
    );
  }
  return store;
}
