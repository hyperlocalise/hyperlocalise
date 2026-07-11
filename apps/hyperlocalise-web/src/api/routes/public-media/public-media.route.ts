import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";
import { z } from "zod";

import { db, schema } from "@/lib/database";
import { getFileStorageAdapter, type FileStorageAdapter } from "@/lib/file-storage";
import { isPublicMediaStoredFile } from "@/lib/projects/files/public-media";

import { fileNotFoundResponse } from "../file/file.shared";

const publicMediaParamsSchema = z.object({
  fileId: z.string().trim().min(1).max(128),
});

const validatePublicMediaParams = validator("param", (value, c) => {
  const parsed = publicMediaParamsSchema.safeParse(value);
  if (!parsed.success) {
    return fileNotFoundResponse(c);
  }
  return parsed.data;
});

/** One year — file IDs are immutable; CDN/browser cache absorbs repeat traffic. */
export const PUBLIC_MEDIA_CACHE_CONTROL = "public, max-age=31536000, immutable";

type CreatePublicMediaRoutesOptions = {
  fileStorageAdapter?: FileStorageAdapter;
};

export function createPublicMediaRoutes(options: CreatePublicMediaRoutesOptions = {}) {
  return new Hono().get("/:fileId", validatePublicMediaParams, async (c) => {
    const { fileId } = c.req.valid("param");

    const [file] = await db
      .select({
        id: schema.storedFiles.id,
        storageKey: schema.storedFiles.storageKey,
        filename: schema.storedFiles.filename,
        contentType: schema.storedFiles.contentType,
        sha256: schema.storedFiles.sha256,
        metadata: schema.storedFiles.metadata,
      })
      .from(schema.storedFiles)
      .where(eq(schema.storedFiles.id, fileId))
      .limit(1);

    if (!file || !isPublicMediaStoredFile(file)) {
      return fileNotFoundResponse(c);
    }

    const ifNoneMatch = c.req.header("if-none-match");
    const etag = `"${file.sha256}"`;
    if (ifNoneMatch && ifNoneMatch === etag) {
      c.header("ETag", etag);
      c.header("Cache-Control", PUBLIC_MEDIA_CACHE_CONTROL);
      c.header("X-Content-Type-Options", "nosniff");
      return c.body(null, 304);
    }

    const adapter = options.fileStorageAdapter ?? getFileStorageAdapter();
    const storedObject = await adapter.get({ keyOrUrl: file.storageKey });

    if (!storedObject) {
      return fileNotFoundResponse(c);
    }

    const contentType = storedObject.contentType ?? file.contentType ?? "application/octet-stream";

    c.header("Content-Type", contentType);
    c.header(
      "Content-Disposition",
      `inline; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
    );
    c.header("Content-Security-Policy", "default-src 'none'; sandbox;");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Cache-Control", PUBLIC_MEDIA_CACHE_CONTROL);
    c.header("CDN-Cache-Control", PUBLIC_MEDIA_CACHE_CONTROL);
    c.header("ETag", etag);

    return c.body(storedObject.body);
  });
}
