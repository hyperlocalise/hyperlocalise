import { del, get, head, put } from "@vercel/blob";

import type { PutCommandOptions } from "@vercel/blob";
import type {
  FileStorageAccess,
  FileStorageAdapter,
  GetStoredObjectInput,
  PutStoredObjectInput,
} from "./types";

type VercelBlobFileStorageOptions = {
  token?: string;
  defaultAccess: FileStorageAccess;
};

export function createVercelBlobFileStorage(
  options: VercelBlobFileStorageOptions,
): FileStorageAdapter {
  return {
    provider: "vercel_blob",
    async put(input: PutStoredObjectInput) {
      const blob = await put(input.key, input.body as Parameters<typeof put>[1], {
        access: input.access ?? options.defaultAccess,
        addRandomSuffix: false,
        contentType: input.contentType,
        token: options.token,
      } satisfies PutCommandOptions);

      return {
        provider: "vercel_blob",
        key: blob.pathname,
        url: blob.url,
        downloadUrl: blob.downloadUrl ?? null,
        contentType: blob.contentType,
        etag: blob.etag ?? null,
      };
    },
    async get(input: GetStoredObjectInput) {
      const blob = await get(input.keyOrUrl, {
        access: input.access ?? options.defaultAccess,
        token: options.token,
      });

      if (!blob?.stream) {
        return null;
      }

      return {
        body: blob.stream,
        contentType: blob.blob.contentType ?? null,
        etag: blob.blob.etag ?? null,
      };
    },
    async delete(input) {
      await del(input.keyOrUrl, { token: options.token });
    },
    async getSignedUrl(input) {
      const blob = await head(input.keyOrUrl, {
        token: options.token,
      });

      return blob?.url ?? null;
    },
  };
}
