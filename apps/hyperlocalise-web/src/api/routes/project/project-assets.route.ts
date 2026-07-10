import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";
import { z } from "zod";

import { canAccessStoredFile } from "@/api/auth/team-access";
import type { AuthVariables } from "@/api/auth/workos";
import { db, schema } from "@/lib/database";
import { getFileStorageAdapter, type FileStorageAdapter } from "@/lib/file-storage";
import { projectIdSchema } from "@/lib/projects/identity/project-id";

import { fileNotFoundResponse } from "../file/file.shared";
import { getOwnedProject, projectNotFoundResponse } from "./project.shared";

const projectAssetParamsSchema = z.object({
  projectId: projectIdSchema,
  fileId: z.string().trim().min(1).max(128),
});

const validateProjectAssetParams = validator("param", (value, c) => {
  const parsed = projectAssetParamsSchema.safeParse(value);
  if (!parsed.success) {
    return fileNotFoundResponse(c);
  }
  return parsed.data;
});

type CreateProjectAssetRoutesOptions = {
  fileStorageAdapter?: FileStorageAdapter;
};

export function createProjectAssetRoutes(options: CreateProjectAssetRoutesOptions = {}) {
  return new Hono<{ Variables: AuthVariables }>().get(
    "/:fileId",
    validateProjectAssetParams,
    async (c) => {
      const params = c.req.valid("param");
      const organizationId = c.var.auth.organization.localOrganizationId;

      const project = await getOwnedProject(c.var.auth, params.projectId);
      if (!project) {
        return projectNotFoundResponse(c);
      }

      const [file] = await db
        .select({
          id: schema.storedFiles.id,
          organizationId: schema.storedFiles.organizationId,
          projectId: schema.storedFiles.projectId,
          createdByUserId: schema.storedFiles.createdByUserId,
          storageKey: schema.storedFiles.storageKey,
          filename: schema.storedFiles.filename,
          contentType: schema.storedFiles.contentType,
        })
        .from(schema.storedFiles)
        .where(
          and(
            eq(schema.storedFiles.id, params.fileId),
            eq(schema.storedFiles.organizationId, organizationId),
          ),
        )
        .limit(1);

      if (
        !file ||
        (file.projectId !== null && file.projectId !== params.projectId) ||
        !(await canAccessStoredFile(c.var.auth, {
          organizationId: file.organizationId,
          projectId: file.projectId ?? params.projectId,
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

      c.header(
        "Content-Type",
        storedObject.contentType ?? file.contentType ?? "application/octet-stream",
      );
      c.header(
        "Content-Disposition",
        `inline; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      );
      c.header("Content-Security-Policy", "default-src 'none'; sandbox;");
      c.header("X-Content-Type-Options", "nosniff");
      c.header("Cache-Control", "private, max-age=60");

      return c.body(storedObject.body);
    },
  );
}
