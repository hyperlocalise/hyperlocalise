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
import { Fragment } from "react";
import { observer } from "mobx-react-lite";

import { useAppShellStore } from "./app-shell-store-context";

export const AppShellHeaderActions = observer(function AppShellHeaderActions() {
  const store = useAppShellStore();

  return (
    <>
      {store.headerActions.orderedSlots.map((slot) => (
        <Fragment key={slot.id}>{slot.render()}</Fragment>
      ))}
    </>
  );
});
