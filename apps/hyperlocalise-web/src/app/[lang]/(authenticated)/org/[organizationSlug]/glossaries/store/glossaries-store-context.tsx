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

import { GlossariesPageStore } from "./glossaries-page-store";

const GlossariesPageStoreContext = createContext<GlossariesPageStore | null>(null);

export function GlossariesPageStoreProvider({
  organizationSlug,
  children,
}: {
  organizationSlug: string;
  children: ReactNode;
}) {
  const store = useMemo(() => new GlossariesPageStore(organizationSlug), [organizationSlug]);
  return (
    <GlossariesPageStoreContext.Provider value={store}>
      {children}
    </GlossariesPageStoreContext.Provider>
  );
}

export function useGlossariesPageStore() {
  const store = useContext(GlossariesPageStoreContext);
  if (!store) {
    throw new Error("useGlossariesPageStore must be used within GlossariesPageStoreProvider");
  }
  return store;
}
