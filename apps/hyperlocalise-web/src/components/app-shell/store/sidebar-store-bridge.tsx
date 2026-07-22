"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { useEffect } from "react";
import { observer } from "mobx-react-lite";

import { useSidebar } from "@/components/ui/sidebar";

import { useAppShellStore } from "./app-shell-store-context";

export const SidebarStoreBridge = observer(function SidebarStoreBridge() {
  const store = useAppShellStore();
  const sidebar = useSidebar();
  const { forceCollapsed, preferredOpen } = store.sidebar;

  useEffect(() => {
    store.sidebar.bindSidebarApi(sidebar);

    return () => {
      store.sidebar.unbindSidebarApi();
    };
  }, [store, sidebar]);

  useEffect(() => {
    store.sidebar.sync();
  }, [store, forceCollapsed, preferredOpen]);

  return null;
});
