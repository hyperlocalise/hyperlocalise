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

import { QaWorkspaceUiStore } from "./qa-workspace-ui-store";

const QaWorkspaceUiStoreContext = createContext<QaWorkspaceUiStore | null>(null);

export function QaWorkspaceUiStoreProvider({
  organizationSlug,
  children,
}: {
  organizationSlug: string;
  children: ReactNode;
}) {
  const store = useMemo(() => new QaWorkspaceUiStore(organizationSlug), [organizationSlug]);
  return (
    <QaWorkspaceUiStoreContext.Provider value={store}>
      {children}
    </QaWorkspaceUiStoreContext.Provider>
  );
}

export function useQaWorkspaceUiStore() {
  const store = useContext(QaWorkspaceUiStoreContext);
  if (!store) {
    throw new Error("useQaWorkspaceUiStore must be used within QaWorkspaceUiStoreProvider");
  }
  return store;
}
