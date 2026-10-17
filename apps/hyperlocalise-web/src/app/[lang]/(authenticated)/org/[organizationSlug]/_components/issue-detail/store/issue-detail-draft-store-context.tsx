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

import { IssueDetailDraftStore } from "./issue-detail-draft-store";

const IssueDetailDraftStoreContext = createContext<IssueDetailDraftStore | null>(null);

export function IssueDetailDraftStoreProvider({
  issueId,
  children,
}: {
  issueId: string;
  children: ReactNode;
}) {
  const store = useMemo(() => new IssueDetailDraftStore(), [issueId]);
  return (
    <IssueDetailDraftStoreContext.Provider value={store}>
      {children}
    </IssueDetailDraftStoreContext.Provider>
  );
}

export function useIssueDetailDraftStore() {
  const store = useContext(IssueDetailDraftStoreContext);
  if (!store) {
    throw new Error("useIssueDetailDraftStore must be used within IssueDetailDraftStoreProvider");
  }
  return store;
}
