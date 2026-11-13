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
import type { QueryClient } from "@tanstack/react-query";

export const CAT_TARGET_CACHE_BYTES = 8 * 1024 * 1024;
export const CAT_TARGET_CACHE_CELLS = 600;
export const CAT_QUEUE_CACHE_BYTES = 4 * 1024 * 1024;
export const CAT_QUEUE_MAX_PAGES = 3;
export const CAT_CACHE_GC_TIME = 30_000;
const installed = new WeakSet<QueryClient>();
const payloadSizes = new WeakMap<object, number>();

/** UTF-16 payload estimate. Entry count separately bounds observer/query overhead. */
export function retainedBytes(value: unknown): number {
  if (typeof value !== "object" || value === null) return JSON.stringify(value)?.length * 2 || 0;
  const cached = payloadSizes.get(value);
  if (cached !== undefined) return cached;
  const size = JSON.stringify(value).length * 2;
  payloadSizes.set(value, size);
  return size;
}

export function enforceEditorCacheBudget(client: QueryClient) {
  for (const [prefix, budget, maxEntries] of [
    ["project-file-content-editor-segment-target", CAT_TARGET_CACHE_BYTES, CAT_TARGET_CACHE_CELLS],
    ["project-file-content-editor-queue", CAT_QUEUE_CACHE_BYTES, 6],
  ] as const) {
    const queries = client.getQueryCache().findAll({ queryKey: [prefix] });
    let bytes = queries.reduce((sum, query) => sum + retainedBytes(query.state.data), 0);
    let count = queries.length;
    const candidates = queries
      .filter((query) => query.getObserversCount() === 0 && query.state.fetchStatus === "idle")
      .sort((a, b) => a.state.dataUpdatedAt - b.state.dataUpdatedAt);
    for (const query of candidates) {
      if (bytes <= budget && count <= maxEntries) break;
      bytes -= retainedBytes(query.state.data);
      count--;
      client.removeQueries({ queryKey: query.queryKey, exact: true });
    }
  }
}

export function installEditorCacheBudget(client: QueryClient) {
  if (installed.has(client)) return;
  installed.add(client);
  let scheduled = false;
  client.getQueryCache().subscribe((event) => {
    if (
      event.type === "removed" ||
      scheduled ||
      !String(event.query.queryKey[0]).startsWith("project-file-content-editor-")
    )
      return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      enforceEditorCacheBudget(client);
    });
  });
}
