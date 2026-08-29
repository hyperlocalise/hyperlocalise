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
import { useLayoutEffect } from "react";

import type { ContentEditorWorkspaceState } from "@/components/content-editor/shared/types";

import { useContentEditorWorkspace } from "../content-editor-workspace-context";

export function ContentEditorQueryBridge({
  snapshot,
  initialSegmentKeyOrId,
}: {
  snapshot: ContentEditorWorkspaceState | null;
  initialSegmentKeyOrId?: string | null;
}) {
  const store = useContentEditorWorkspace();

  // Cache hits clear isPlaceholderData on the same render the new snapshot
  // arrives. Ingest before paint so the store cannot lag that flag.
  useLayoutEffect(() => {
    if (!snapshot) {
      return;
    }

    store.ingestQueue(snapshot, initialSegmentKeyOrId);
  }, [initialSegmentKeyOrId, snapshot, store]);

  return null;
}
