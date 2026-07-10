"use client";

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
