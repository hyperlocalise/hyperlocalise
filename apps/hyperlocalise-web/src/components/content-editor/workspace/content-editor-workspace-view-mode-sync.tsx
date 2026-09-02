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
} from "./content-editor-file-view-capabilities";
import { useContentEditorWorkspace } from "./content-editor-workspace-context";

export const ContentEditorWorkspaceViewModeSync = observer(
  function ContentEditorWorkspaceViewModeSync({
    onPageLimitChange,
  }: {
    onPageLimitChange: (pageLimit: number) => void;
  }) {
    const store = useContentEditorWorkspace();

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
          const nextMode = clampCatWorkspaceViewMode(viewMode, capabilities);

          if (nextMode !== viewMode) {
            store.ui.setViewMode(nextMode);
          }
        },
        { fireImmediately: true },
      );
    }, [store]);

    return null;
  },
);
