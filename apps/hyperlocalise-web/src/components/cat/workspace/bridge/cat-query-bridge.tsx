"use client";

import { useEffect } from "react";

import type { CatWorkspaceState } from "@/components/cat/shared/types";

import { useCatWorkspaceStore } from "../store/cat-workspace-store-context";

export function CatQueryBridge({
  snapshot,
  initialSegmentKeyOrId,
}: {
  snapshot: CatWorkspaceState | null;
  initialSegmentKeyOrId?: string | null;
}) {
  const store = useCatWorkspaceStore();

  useEffect(() => {
    if (!snapshot) {
      return;
    }

    store.hydrateFromServerSnapshot(snapshot, initialSegmentKeyOrId);
  }, [initialSegmentKeyOrId, snapshot, store]);

  return null;
}
