import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import type { AuthVariables } from "@/api/auth/workos";
import { workosAuthMiddleware } from "@/api/auth/workos";
import { db, schema } from "@/lib/database";
import { getFileStorageAdapter, type FileStorageAdapter } from "@/lib/file-storage";

const fileParamsSchema = z.object({
  organizationSlug: z.string().trim().min(1),
  fileId: z.string().trim().min(1),
});

function notFoundResponse(c: { json(body: { error: string }, status: 404): Response }) {
  return c.json({ error: "not_found" }, 404);
}

type CreateFileRoutesOptions = {
  fileStorageAdapter?: FileStorageAdapter;
};

export function createFileRoutes(options: CreateFileRoutesOptions = {}) {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/:fileId", async (c) => {
      const parsed = fileParamsSchema.safeParse(c.req.param());
      if (!parsed.success) {
        return notFoundResponse(c);
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
        return notFoundResponse(c);
      }

      const adapter = options.fileStorageAdapter ?? getFileStorageAdapter();
      const storedObject = await adapter.get({ keyOrUrl: file.storageKey });

      if (!storedObject) {
        return notFoundResponse(c);
      }

      c.header(
        "Content-Type",
        storedObject.contentType ?? file.contentType ?? "application/octet-stream",
      );
      c.header("Content-Disposition", `inline; filename="${file.filename}"`);

      return c.body(storedObject.body);
    });
}
