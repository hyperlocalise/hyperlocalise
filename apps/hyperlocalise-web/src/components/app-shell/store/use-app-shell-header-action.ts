"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

import type { HeaderActionSlot } from "./header-actions-store";
import { useAppShellStore } from "./app-shell-store-context";

type AppShellHeaderActionConfig = {
  id: string;
  order?: number;
  visible?: boolean;
  render: () => ReactNode;
};

export function useAppShellHeaderAction({
  id,
  order = 0,
  visible = true,
  render,
}: AppShellHeaderActionConfig) {
  const store = useAppShellStore();
  const renderRef = useRef(render);
  renderRef.current = render;

  useEffect(() => {
    const slot: HeaderActionSlot = {
      id,
      order,
      visible,
      render: () => renderRef.current(),
    };

    store.headerActions.register(slot);

    return () => {
      store.headerActions.unregister(id);
    };
  }, [store, id, order, visible]);
}
