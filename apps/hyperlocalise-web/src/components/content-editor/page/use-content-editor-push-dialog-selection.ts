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
import { useEffect, useRef, useState } from "react";

import { nextPushDialogSelection } from "./content-editor-integration-toolbar-visibility";

export function useContentEditorPushDialogSelection<T extends { sourcePath: string }>(input: {
  open: boolean;
  automationId: string;
  sourcePath: string | null;
  items: readonly T[] | undefined;
  defaultSelectedSourcePaths: (items: readonly T[], sourcePath: string | null) => string[];
}) {
  const [selectedSourcePaths, setSelectedSourcePaths] = useState<string[]>([]);
  const resetSelectionRef = useRef(true);

  useEffect(() => {
    if (!input.open) {
      setSelectedSourcePaths([]);
      resetSelectionRef.current = true;
    }
  }, [input.open]);

  useEffect(() => {
    resetSelectionRef.current = true;
  }, [input.automationId, input.sourcePath]);

  useEffect(() => {
    const items = input.items;
    if (!input.open || !items) {
      return;
    }
    setSelectedSourcePaths((current) => {
      if (resetSelectionRef.current) {
        resetSelectionRef.current = false;
        return input.defaultSelectedSourcePaths(items, input.sourcePath);
      }
      return nextPushDialogSelection(
        current,
        items.map((item) => item.sourcePath),
      );
    });
  }, [
    input.open,
    input.items,
    input.automationId,
    input.sourcePath,
    input.defaultSelectedSourcePaths,
  ]);

  return { selectedSourcePaths, setSelectedSourcePaths };
}
