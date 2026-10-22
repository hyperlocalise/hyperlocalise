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
import { useEffect, useState } from "react";

const OVERFLOW_HEADER = "x-hyperlocalise-overflow-keys";

/** Keys that did not fit in the last generated Office/PDF download for this URL. */
export function useOfficeDownloadOverflowKeys(downloadUrl: string | null | undefined) {
  const [overflowKeys, setOverflowKeys] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    if (!downloadUrl) {
      setOverflowKeys(new Set());
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch(downloadUrl, { method: "HEAD", credentials: "include" });
        if (!response.ok || cancelled) {
          return;
        }
        const raw = response.headers.get(OVERFLOW_HEADER);
        if (!raw?.trim()) {
          if (!cancelled) {
            setOverflowKeys(new Set());
          }
          return;
        }
        const keys = raw
          .split(",")
          .map((key) => key.trim())
          .filter(Boolean);
        if (!cancelled) {
          setOverflowKeys(new Set(keys));
        }
      } catch {
        if (!cancelled) {
          setOverflowKeys(new Set());
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [downloadUrl]);

  return overflowKeys;
}
