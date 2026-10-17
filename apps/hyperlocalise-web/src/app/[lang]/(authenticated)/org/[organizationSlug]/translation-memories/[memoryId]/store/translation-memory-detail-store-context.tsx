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

import { TranslationMemoryDetailStore } from "./translation-memory-detail-store";

const TranslationMemoryDetailStoreContext = createContext<TranslationMemoryDetailStore | null>(
  null,
);

export function TranslationMemoryDetailStoreProvider({
  organizationSlug,
  memoryId,
  children,
}: {
  organizationSlug: string;
  memoryId: string;
  children: ReactNode;
}) {
  const store = useMemo(
    () => new TranslationMemoryDetailStore(organizationSlug, memoryId),
    [organizationSlug, memoryId],
  );
  return (
    <TranslationMemoryDetailStoreContext.Provider value={store}>
      {children}
    </TranslationMemoryDetailStoreContext.Provider>
  );
}

export function useOptionalTranslationMemoryDetailStore() {
  return useContext(TranslationMemoryDetailStoreContext);
}

export function useTranslationMemoryDetailStore() {
  const store = useContext(TranslationMemoryDetailStoreContext);
  if (!store) {
    throw new Error(
      "useTranslationMemoryDetailStore must be used within TranslationMemoryDetailStoreProvider",
    );
  }
  return store;
}
