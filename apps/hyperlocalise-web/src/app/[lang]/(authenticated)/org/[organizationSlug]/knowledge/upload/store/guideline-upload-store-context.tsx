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

import { GuidelineUploadPageStore } from "./guideline-upload-page-store";

const GuidelineUploadPageStoreContext = createContext<GuidelineUploadPageStore | null>(null);

export function GuidelineUploadPageStoreProvider({
  organizationSlug,
  initialProjectId,
  children,
}: {
  organizationSlug: string;
  initialProjectId?: string;
  children: ReactNode;
}) {
  const store = useMemo(
    () => new GuidelineUploadPageStore(organizationSlug, initialProjectId),
    [organizationSlug, initialProjectId],
  );
  return (
    <GuidelineUploadPageStoreContext.Provider value={store}>
      {children}
    </GuidelineUploadPageStoreContext.Provider>
  );
}

export function useGuidelineUploadPageStore() {
  const store = useContext(GuidelineUploadPageStoreContext);
  if (!store) {
    throw new Error(
      "useGuidelineUploadPageStore must be used within GuidelineUploadPageStoreProvider",
    );
  }
  return store;
}
