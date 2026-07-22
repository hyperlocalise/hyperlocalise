"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { useCallback, useState } from "react";

const STORAGE_KEY = "cat-queue:selection-mode:v1";

function readSelectionModePreference() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function useCatQueueSelectionMode() {
  const [selectionMode, setSelectionMode] = useState(() =>
    typeof window !== "undefined" ? readSelectionModePreference() : false,
  );

  const setSelectionModePersisted = useCallback((value: boolean) => {
    setSelectionMode(value);
    try {
      localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      // Ignore storage failures in private browsing or restricted contexts.
    }
  }, []);

  return [selectionMode, setSelectionModePersisted] as const;
}
