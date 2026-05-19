import { and, eq } from "drizzle-orm";
import { Hono } from "hono";

import type { AuthVariables } from "@/api/auth/workos";
import { workosAuthMiddleware } from "@/api/auth/workos";
import { db, schema } from "@/lib/database";
import { getFileStorageAdapter, type FileStorageAdapter } from "@/lib/file-storage";

import { fileParamsSchema } from "./file.schema";
import { fileNotFoundResponse } from "./file.shared";

type CreateFileRoutesOptions = {
  fileStorageAdapter?: FileStorageAdapter;
};

export function createFileRoutes(options: CreateFileRoutesOptions = {}) {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/:fileId", async (c) => {
      const parsed = fileParamsSchema.safeParse(c.req.param());
      if (!parsed.success) {
        return fileNotFoundResponse(c);
      }

      const { fileId } = parsed.data;
      const orgId = c.var.auth.activeOrganization.localOrganizationId;

      const [file] = await db
        .select({
          id: schema.storedFiles.id,
          organizationId: schema.storedFiles.organizationId,
          storageProvider: schema.storedFiles.storageProvider,
          storageKey: schema.storedFiles.storageKey,
          storageUrl: schema.storedFiles.storageUrl,
          filename: schema.storedFiles.filename,
          contentType: schema.storedFiles.contentType,
        })
        .from(schema.storedFiles)
        .where(and(eq(schema.storedFiles.id, fileId), eq(schema.storedFiles.organizationId, orgId)))
        .limit(1);

      if (!file) {
        return fileNotFoundResponse(c);
      }

      const adapter = options.fileStorageAdapter ?? getFileStorageAdapter();
      const storedObject = await adapter.get({ keyOrUrl: file.storageKey });

      if (!storedObject) {
        return fileNotFoundResponse(c);
      }

      c.header(
        "Content-Type",
        storedObject.contentType ?? file.contentType ?? "application/octet-stream",
      );
      c.header(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      );
      c.header("Content-Security-Policy", "default-src 'none'; sandbox;");
      c.header("X-Content-Type-Options", "nosniff");
      c.header("X-Download-Options", "noopen");
      c.header("Cache-Control", "no-store");

      return c.body(storedObject.body);
    });
}
