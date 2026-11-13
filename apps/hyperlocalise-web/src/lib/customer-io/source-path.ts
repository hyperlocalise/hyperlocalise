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

/**
 * Client-safe Customer.io source-path helpers.
 *
 * `translation-map.ts` cannot be imported from Client Components: it depends
 * on `node:crypto` and (via `@/lib/file-storage/records`) the server-only
 * database client, which breaks the browser bundle (`server-only` / `pg`
 * build errors). Path matching for the content-editor buttons lives here so
 * it stays free of Node and database imports. `normalizeSourcePath` mirrors
 * `@/lib/file-storage/records` exactly.
 */
export function normalizeSourcePath(value: string): string {
  return value
    .replace(/\\/g, "/")
    .replace(/^(?:\.\/)+/, "")
    .replace(/\/+/g, "/");
}

export function isCustomerIoSourcePath(sourcePath: string): boolean {
  return normalizeSourcePath(sourcePath).startsWith("customer-io/");
}
