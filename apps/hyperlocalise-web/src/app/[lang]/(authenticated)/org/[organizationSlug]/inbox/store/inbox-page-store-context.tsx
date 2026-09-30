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

import { InboxPageStore } from "./inbox-page-store";

const InboxPageStoreContext = createContext<InboxPageStore | null>(null);

export function InboxPageStoreProvider({
  organizationSlug,
  children,
}: {
  organizationSlug: string;
  children: ReactNode;
}) {
  const store = useMemo(() => new InboxPageStore(organizationSlug), [organizationSlug]);
  return <InboxPageStoreContext.Provider value={store}>{children}</InboxPageStoreContext.Provider>;
}

export function useInboxPageStore() {
  const store = useContext(InboxPageStoreContext);
  if (!store) {
    throw new Error("useInboxPageStore must be used within InboxPageStoreProvider");
  }
  return store;
}
