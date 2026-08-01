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
import { observer } from "mobx-react-lite";

import { resolveCatFileViewCapabilities } from "./cat-file-view-capabilities";
import { useOptionalCatWorkspace } from "./cat-workspace-context";
import { CatWorkspaceViewSwitcher } from "./cat-workspace-view-switcher";
import type { CatWorkspaceViewMode } from "./cat-workspace-view-mode";

export const CatWorkspaceViewSwitcherConnected = observer(
  function CatWorkspaceViewSwitcherConnected({
    value,
    onChange,
    availableViews,
    className,
  }: {
    value?: CatWorkspaceViewMode;
    onChange?: (mode: CatWorkspaceViewMode) => void;
    availableViews?: readonly CatWorkspaceViewMode[];
    className?: string;
  }) {
    const store = useOptionalCatWorkspace();
    const selectedSegment = store?.selectedSegmentView ?? null;
    const capabilities = resolveCatFileViewCapabilities({
      sourcePath: selectedSegment?.sourcePath ?? store?.fileContext.sourcePath,
      contentKind: selectedSegment?.contentKind,
    });
    const resolvedAvailableViews = availableViews ?? capabilities.availableViews;
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
        availableViews={resolvedAvailableViews}
        className={className}
      />
    );
  },
);
