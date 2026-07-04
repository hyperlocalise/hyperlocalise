"use client";

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
