/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";

import { canAccessStoredFile } from "@/api/auth/team-access";
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
          projectId: schema.storedFiles.projectId,
          createdByUserId: schema.storedFiles.createdByUserId,
          storageProvider: schema.storedFiles.storageProvider,
          storageKey: schema.storedFiles.storageKey,
          storageUrl: schema.storedFiles.storageUrl,
          filename: schema.storedFiles.filename,
          contentType: schema.storedFiles.contentType,
        })
        .from(schema.storedFiles)
        .where(and(eq(schema.storedFiles.id, fileId), eq(schema.storedFiles.organizationId, orgId)))
        .limit(1);

      if (
        !file ||
        !(await canAccessStoredFile(c.var.auth, {
          organizationId: file.organizationId,
          projectId: file.projectId,
          createdByUserId: file.createdByUserId,
        }))
      ) {
        return fileNotFoundResponse(c);
      }

      const adapter = options.fileStorageAdapter ?? getFileStorageAdapter();
      const storedObject = await adapter.get({ keyOrUrl: file.storageKey });

      if (!storedObject) {
        return fileNotFoundResponse(c);
      }

      const contentType =
        storedObject.contentType ?? file.contentType ?? "application/octet-stream";
      const isImage = contentType.toLowerCase().startsWith("image/");
      c.header("Content-Type", contentType);
      c.header(
        "Content-Disposition",
        `${isImage ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      );
      c.header("Content-Security-Policy", "default-src 'none'; sandbox;");
      c.header("X-Content-Type-Options", "nosniff");
      if (!isImage) {
        c.header("X-Download-Options", "noopen");
      }
      c.header("Cache-Control", isImage ? "private, max-age=60" : "no-store");

      return c.body(storedObject.body);
    });
}
