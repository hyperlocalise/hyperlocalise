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
import { reaction } from "mobx";
import { observer } from "mobx-react-lite";
import { useEffect } from "react";

import { useCatWorkspace } from "./cat-workspace-context";

export const CatWorkspaceViewModeSync = observer(function CatWorkspaceViewModeSync({
  onPageLimitChange,
}: {
  onPageLimitChange: (pageLimit: number) => void;
}) {
  const store = useCatWorkspace();

  useEffect(() => {
    return reaction(
      () => store.ui.pageLimit,
      (pageLimit) => {
        onPageLimitChange(pageLimit);
      },
      { fireImmediately: true },
    );
  }, [onPageLimitChange, store]);

  return null;
});
