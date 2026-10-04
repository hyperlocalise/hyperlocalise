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
import { useCallback, useEffect, useRef, useState } from "react";

export const DOCUMENT_AUTOSAVE_DELAY_MS = 3_000;

export type DocumentAutosaveStatus =
  | { kind: "idle" }
  | { kind: "dirty" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  | { kind: "error" };

/**
 * Saves `value` after it stops changing, one save at a time. Edits made while
 * a save is running queue exactly one follow-up save of the latest value.
 * A failed save stops automatic retries until `retry` or `saveNow`.
 */
export function useDocumentAutosave({
  value,
  baseline,
  save,
  enabled = true,
  delayMs = DOCUMENT_AUTOSAVE_DELAY_MS,
}: {
  value: string;
  /** Last value known to be stored. `null` while the document is loading. */
  baseline: string | null;
  save: (value: string) => Promise<void>;
  enabled?: boolean;
  delayMs?: number;
}) {
  const [status, setStatus] = useState<DocumentAutosaveStatus>({ kind: "idle" });
  const savedValueRef = useRef<string | null>(baseline);
  const latestValueRef = useRef(value);
  const saveRef = useRef(save);
  const inFlightRef = useRef(false);
  const pendingRef = useRef(false);
  const failedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  latestValueRef.current = value;
  saveRef.current = save;

  useEffect(() => {
    savedValueRef.current = baseline;
    failedRef.current = false;
    setStatus({ kind: "idle" });
  }, [baseline]);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const flush = useCallback(async () => {
    clearTimer();
    if (savedValueRef.current === null) {
      return;
    }
    if (inFlightRef.current) {
      pendingRef.current = true;
      return;
    }
    const next = latestValueRef.current;
    if (next === savedValueRef.current) {
      return;
    }
    inFlightRef.current = true;
    failedRef.current = false;
    setStatus({ kind: "saving" });
    try {
      await saveRef.current(next);
      savedValueRef.current = next;
      setStatus(
        latestValueRef.current === next ? { kind: "saved", at: Date.now() } : { kind: "dirty" },
      );
    } catch {
      failedRef.current = true;
      pendingRef.current = false;
      setStatus({ kind: "error" });
    } finally {
      inFlightRef.current = false;
    }
    if (pendingRef.current) {
      pendingRef.current = false;
      await flush();
    }
  }, []);

  useEffect(() => {
    if (savedValueRef.current === null || value === savedValueRef.current) {
      return;
    }
    if (!inFlightRef.current && !failedRef.current) {
      setStatus({ kind: "dirty" });
    }
    if (!enabled || failedRef.current) {
      return;
    }
    clearTimer();
    timerRef.current = setTimeout(() => void flush(), delayMs);
    return clearTimer;
  }, [delayMs, enabled, flush, value]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        void flush();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [enabled, flush]);

  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  useEffect(
    () => () => {
      if (enabledRef.current && !failedRef.current) void flush();
    },
    [flush],
  );

  const hasUnsavedChanges = savedValueRef.current !== null && value !== savedValueRef.current;

  useEffect(() => {
    if (!hasUnsavedChanges) {
      return;
    }
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsavedChanges]);

  return {
    status,
    hasUnsavedChanges,
    saveNow: flush,
    retry: flush,
  };
}
