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
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { expect, it } from "vite-plus/test";
import { CAT_TARGET_CACHE_CELLS, enforceEditorCacheBudget } from "./content-editor-cache-budget";

it("evicts inactive translations by entry and byte budget while retaining visible subscriptions", () => {
  const client = new QueryClient();
  const prefix = "project-file-content-editor-segment-target";
  const key = [prefix, "visible"];
  client.setQueryData(key, { text: "visible" });
  const observer = new QueryObserver(client, { queryKey: key, enabled: false });
  const unsubscribe = observer.subscribe(() => {});
  for (let i = 0; i < CAT_TARGET_CACHE_CELLS + 100; i++)
    client.setQueryData([prefix, i], { text: "x".repeat(20_000) });
  enforceEditorCacheBudget(client);
  expect(client.getQueryData(key)).toEqual({ text: "visible" });
  expect(client.getQueryCache().getAll().length).toBeLessThan(220);
  unsubscribe();
  client.clear();
});
