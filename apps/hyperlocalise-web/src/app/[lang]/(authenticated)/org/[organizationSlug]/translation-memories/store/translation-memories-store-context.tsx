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

import { TranslationMemoriesPageStore } from "./translation-memories-page-store";

const TranslationMemoriesPageStoreContext = createContext<TranslationMemoriesPageStore | null>(
  null,
);

export function TranslationMemoriesPageStoreProvider({
  organizationSlug,
  searchParams,
  children,
}: {
  organizationSlug: string;
  searchParams: URLSearchParams;
  children: ReactNode;
}) {
  const initialSearch = searchParams.toString();
  const store = useMemo(
    () => new TranslationMemoriesPageStore(organizationSlug, new URLSearchParams(initialSearch)),
    [organizationSlug, initialSearch],
  );
  return (
    <TranslationMemoriesPageStoreContext.Provider value={store}>
      {children}
    </TranslationMemoriesPageStoreContext.Provider>
  );
}

export function useTranslationMemoriesPageStore() {
  const store = useContext(TranslationMemoriesPageStoreContext);
  if (!store) {
    throw new Error(
      "useTranslationMemoriesPageStore must be used within TranslationMemoriesPageStoreProvider",
    );
  }
  return store;
}
