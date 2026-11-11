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

import { GlossaryConceptDetailStore } from "./glossary-concept-detail-store";

const GlossaryConceptDetailStoreContext = createContext<GlossaryConceptDetailStore | null>(null);

export function GlossaryConceptDetailStoreProvider({
  organizationSlug,
  glossaryId,
  conceptId,
  children,
}: {
  organizationSlug: string;
  glossaryId: string;
  conceptId: string;
  children: ReactNode;
}) {
  const store = useMemo(
    () => new GlossaryConceptDetailStore(organizationSlug, glossaryId, conceptId),
    [organizationSlug, glossaryId, conceptId],
  );
  return (
    <GlossaryConceptDetailStoreContext.Provider value={store}>
      {children}
    </GlossaryConceptDetailStoreContext.Provider>
  );
}

export function useGlossaryConceptDetailStore() {
  const store = useContext(GlossaryConceptDetailStoreContext);
  if (!store) {
    throw new Error(
      "useGlossaryConceptDetailStore must be used within GlossaryConceptDetailStoreProvider",
    );
  }
  return store;
}
