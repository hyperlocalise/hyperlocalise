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
import { reaction } from "mobx";
import { observer } from "mobx-react-lite";
import { useEffect } from "react";

import {
  clampCatWorkspaceViewMode,
  resolveCatFileViewCapabilities,
  type CatFileViewFamily,
} from "./cat-file-view-capabilities";
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

  useEffect(() => {
    let previousFamily: CatFileViewFamily | null = null;

    return reaction(
      () => {
        const selected = store.selectedSegmentView;
        return {
          viewMode: store.ui.viewMode,
          sourcePath: selected?.sourcePath ?? store.fileContext.sourcePath,
          contentKind: selected?.contentKind,
        };
      },
      ({ viewMode, sourcePath, contentKind }) => {
        const capabilities = resolveCatFileViewCapabilities({ sourcePath, contentKind });
        let nextMode = clampCatWorkspaceViewMode(viewMode, capabilities);

        // Entering a binary-first family selects File view by default.
        // Staying in the same family keeps an explicit Comfortable / Side by side choice.
        if (
          (capabilities.family === "image" || capabilities.family === "office") &&
          previousFamily !== capabilities.family
        ) {
          nextMode = capabilities.defaultView;
        }

        previousFamily = capabilities.family;

        if (nextMode !== viewMode) {
          store.ui.setViewMode(nextMode);
        }
      },
      { fireImmediately: true },
    );
  }, [store]);

  return null;
});
