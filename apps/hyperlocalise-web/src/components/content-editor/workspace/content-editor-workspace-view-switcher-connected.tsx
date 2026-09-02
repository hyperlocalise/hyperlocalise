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

import { resolveCatFileViewCapabilities } from "./content-editor-file-view-capabilities";
import { useOptionalCatWorkspace } from "./content-editor-workspace-context";
import { ContentEditorWorkspaceViewSwitcher } from "./content-editor-workspace-view-switcher";
import type { ContentEditorWorkspaceViewMode } from "./content-editor-workspace-view-mode";

export const ContentEditorWorkspaceViewSwitcherConnected = observer(
  function ContentEditorWorkspaceViewSwitcherConnected({
    value,
    onChange,
    availableViews,
    className,
  }: {
    value?: ContentEditorWorkspaceViewMode;
    onChange?: (mode: ContentEditorWorkspaceViewMode) => void;
    availableViews?: readonly ContentEditorWorkspaceViewMode[];
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
      ? (mode: ContentEditorWorkspaceViewMode) => store.ui.setViewMode(mode)
      : onChange;

    if (!resolvedOnChange || resolvedAvailableViews.length <= 1) {
      return null;
    }

    return (
      <ContentEditorWorkspaceViewSwitcher
        value={resolvedValue}
        onChange={resolvedOnChange}
        availableViews={resolvedAvailableViews}
        className={className}
      />
    );
  },
);
