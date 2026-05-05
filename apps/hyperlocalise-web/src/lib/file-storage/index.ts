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
