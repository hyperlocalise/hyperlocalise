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

export type OtaStoredObject = {
  body: Buffer;
  contentType: string;
  cacheControl: string;
};

export type OtaObjectStore = {
  put(input: {
    key: string;
    body: Buffer;
    contentType: string;
    cacheControl: string;
  }): Promise<void>;
  get(key: string): Promise<OtaStoredObject | null>;
  deletePrefix(prefix: string): Promise<void>;
};

export function otaObjectKey(hash: string, relativePath: string): string {
  const trimmed = relativePath.replace(/^\/+/, "");
  return `${hash}/${trimmed}`;
}
