"use client";

import { useEffect } from "react";

import type { CatWorkspaceState } from "@/components/cat/shared/types";

import { useCatWorkspace } from "../cat-workspace-context";

export function CatQueryBridge({
  snapshot,
  initialSegmentKeyOrId,
}: {
  snapshot: CatWorkspaceState | null;
  initialSegmentKeyOrId?: string | null;
}) {
  const store = useCatWorkspace();

  useEffect(() => {
    if (!snapshot) {
      return;
    }

    store.ingestQueue(snapshot, initialSegmentKeyOrId);
  }, [initialSegmentKeyOrId, snapshot, store]);

  return null;
}
