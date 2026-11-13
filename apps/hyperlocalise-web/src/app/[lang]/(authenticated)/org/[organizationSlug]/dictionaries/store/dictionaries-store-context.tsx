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

import { DictionariesPageStore } from "./dictionaries-page-store";

const DictionariesPageStoreContext = createContext<DictionariesPageStore | null>(null);

export function DictionariesPageStoreProvider({
  organizationSlug,
  children,
}: {
  organizationSlug: string;
  children: ReactNode;
}) {
  const store = useMemo(() => new DictionariesPageStore(organizationSlug), [organizationSlug]);
  return (
    <DictionariesPageStoreContext.Provider value={store}>
      {children}
    </DictionariesPageStoreContext.Provider>
  );
}

export function useDictionariesPageStore() {
  const store = useContext(DictionariesPageStoreContext);
  if (!store) {
    throw new Error("useDictionariesPageStore must be used within DictionariesPageStoreProvider");
  }
  return store;
}
