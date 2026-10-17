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

import { QaProjectUiStore } from "./qa-project-ui-store";

const QaProjectUiStoreContext = createContext<QaProjectUiStore | null>(null);

export function QaProjectUiStoreProvider({
  organizationSlug,
  projectId,
  children,
}: {
  organizationSlug: string;
  projectId: string;
  children: ReactNode;
}) {
  const store = useMemo(
    () => new QaProjectUiStore(organizationSlug, projectId),
    [organizationSlug, projectId],
  );
  return (
    <QaProjectUiStoreContext.Provider value={store}>{children}</QaProjectUiStoreContext.Provider>
  );
}

export function useQaProjectUiStore() {
  const store = useContext(QaProjectUiStoreContext);
  if (!store) {
    throw new Error("useQaProjectUiStore must be used within QaProjectUiStoreProvider");
  }
  return store;
}
