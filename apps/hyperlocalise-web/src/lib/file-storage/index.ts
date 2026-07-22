/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { env } from "@/lib/env";

import { createVercelBlobFileStorage } from "./vercel-blob";

import type { FileStorageAdapter } from "./types";

let adapter: FileStorageAdapter | null = null;

export function getFileStorageAdapter(): FileStorageAdapter {
  if (adapter) {
    return adapter;
  }

  switch (env.FILE_STORAGE_PROVIDER) {
    case "vercel_blob":
      adapter = createVercelBlobFileStorage({
        token: env.BLOB_READ_WRITE_TOKEN,
        defaultAccess: env.FILE_STORAGE_ACCESS,
      });
      return adapter;
  }
}

export type {
  DeleteStoredObjectInput,
  FileStorageAccess,
  FileStorageAdapter,
  FileStorageProvider,
  GetSignedUrlInput,
  GetStoredObjectInput,
  GetStoredObjectResult,
  PutStoredObjectInput,
  PutStoredObjectResult,
} from "./types";
