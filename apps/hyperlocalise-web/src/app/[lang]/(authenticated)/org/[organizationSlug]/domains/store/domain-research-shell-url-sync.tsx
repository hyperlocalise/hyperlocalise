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
import { observer } from "mobx-react-lite";
import { useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect } from "react";

import { useOrgRouter } from "@/lib/navigation/use-org-router";

import { useDomainResearchShellStore } from "./domains-store-context";

export const DomainResearchShellUrlSync = observer(function DomainResearchShellUrlSync() {
  const store = useDomainResearchShellStore();
  const router = useOrgRouter();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const requestedLocaleId = searchParams.get("locale");

  useLayoutEffect(() => {
    runInAction(() => {
      store.setSearch(search);
      store.setRequestedLocaleId(requestedLocaleId);
    });
  }, [requestedLocaleId, search, store]);

  useEffect(() => {
    if (!store.localeId || store.requestedLocaleId === store.localeId) {
      return;
    }
    router.replace(store.hrefForLocale(store.localeId), { scroll: false });
  }, [router, store, store.localeId, store.requestedLocaleId]);

  return null;
});
