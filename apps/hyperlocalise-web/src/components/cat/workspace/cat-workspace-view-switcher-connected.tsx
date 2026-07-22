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
import { observer } from "mobx-react-lite";

import { useOptionalCatWorkspace } from "./cat-workspace-context";
import { CatWorkspaceViewSwitcher } from "./cat-workspace-view-switcher";
import type { CatWorkspaceViewMode } from "./cat-workspace-view-mode";

export const CatWorkspaceViewSwitcherConnected = observer(
  function CatWorkspaceViewSwitcherConnected({
    value,
    onChange,
    className,
  }: {
    value?: CatWorkspaceViewMode;
    onChange?: (mode: CatWorkspaceViewMode) => void;
    className?: string;
  }) {
    const store = useOptionalCatWorkspace();
    const resolvedValue = store?.ui.viewMode ?? value ?? "comfortable";
    const resolvedOnChange = store
      ? (mode: CatWorkspaceViewMode) => store.ui.setViewMode(mode)
      : onChange;

    if (!resolvedOnChange) {
      return null;
    }

    return (
      <CatWorkspaceViewSwitcher
        value={resolvedValue}
        onChange={resolvedOnChange}
        className={className}
      />
    );
  },
);
