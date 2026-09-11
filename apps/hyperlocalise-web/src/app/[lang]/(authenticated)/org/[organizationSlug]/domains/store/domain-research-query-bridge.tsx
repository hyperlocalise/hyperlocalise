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
import { runInAction } from "mobx";
import { useLayoutEffect } from "react";

import { useLiveDomainResearch } from "../_components/use-live-domain-research";
import { useDomainResearchShellStore } from "./domains-store-context";

export function DomainResearchQueryBridge() {
  const store = useDomainResearchShellStore();
  const liveResearch = useLiveDomainResearch(store.organizationSlug, store.linkedDomainId);

  useLayoutEffect(() => {
    runInAction(() => {
      if (liveResearch.isPending) {
        store.setLoadStatus("loading");
        return;
      }
      if (liveResearch.isError) {
        store.setLoadStatus("error");
        return;
      }
      store.setResearchData({
        catalog: liveResearch.data?.catalog ?? null,
        linkedDomain: liveResearch.data?.linkedDomain,
      });
      store.setLoadStatus("success");
    });
  }, [
    liveResearch.data?.catalog,
    liveResearch.data?.linkedDomain,
    liveResearch.isError,
    liveResearch.isPending,
    store,
  ]);

  return null;
}
