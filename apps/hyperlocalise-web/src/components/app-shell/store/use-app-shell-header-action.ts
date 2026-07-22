"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
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
