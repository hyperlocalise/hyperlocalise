"use client";

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
