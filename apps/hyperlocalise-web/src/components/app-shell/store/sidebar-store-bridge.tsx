"use client";

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
