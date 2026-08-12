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
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";

import { canAccessStoredFile } from "@/api/auth/team-access";
import type { AuthVariables } from "@/api/auth/workos";
import { workosAuthMiddleware } from "@/api/auth/workos";
import { badRequestResponse, payloadTooLargeResponse } from "@/api/response.schema";
import { db, schema } from "@/lib/database";
import { getFileStorageAdapter, type FileStorageAdapter } from "@/lib/file-storage";
import { createStoredFile } from "@/lib/file-storage/records";
import { isEncodedProviderProjectId } from "@/lib/providers/jobs/tms-provider-resource-id";
import { getOwnedProject } from "@/api/routes/project/project.shared";

import {
  editorImageContentTypes,
  editorImageUploadFormSchema,
  fileParamsSchema,
  maxEditorImageUploadBytes,
  maxEditorImageUploadRequestBytes,
} from "./file.schema";
import { fileNotFoundResponse } from "./file.shared";

type CreateFileRoutesOptions = {
  fileStorageAdapter?: FileStorageAdapter;
};

function buildOrganizationFileUrl(organizationSlug: string, fileId: string) {
  return `/api/orgs/${encodeURIComponent(organizationSlug)}/files/${fileId}`;
}

function resolveStoredFileProjectId(projectId: string | null | undefined): string | null {
  if (!projectId || isEncodedProviderProjectId(projectId)) {
    return null;
  }
  return projectId;
}

function isAllowedEditorImageContentType(contentType: string) {
  const normalized = contentType.toLowerCase().split(";")[0]?.trim() ?? "";
  return (editorImageContentTypes as readonly string[]).includes(normalized);
}

export function createFileRoutes(options: CreateFileRoutesOptions = {}) {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .post(
      "/",
      bodyLimit({
        maxSize: maxEditorImageUploadRequestBytes,
        onError: (c) => payloadTooLargeResponse(c, "file_upload_too_large"),
      }),
      async (c) => {
        const formData = await c.req.formData();
        const fileEntry = formData.get("file");
        if (!(fileEntry instanceof File)) {
          return badRequestResponse(c, "file_required", "An image file is required.");
        }

        const projectIdValue = formData.get("projectId");
        const parsedForm = editorImageUploadFormSchema.safeParse({
          projectId: typeof projectIdValue === "string" ? projectIdValue : undefined,
        });
        if (!parsedForm.success) {
          return badRequestResponse(c, "invalid_upload_payload");
        }

        const contentType = fileEntry.type || "application/octet-stream";
        if (!isAllowedEditorImageContentType(contentType)) {
          return badRequestResponse(
            c,
            "unsupported_image_type",
            "Only PNG, JPEG, and WebP images are supported.",
          );
        }

        if (fileEntry.size > maxEditorImageUploadBytes) {
          return payloadTooLargeResponse(c, "file_upload_too_large");
        }

        const orgId = c.var.auth.activeOrganization.localOrganizationId;
        const organizationSlug = c.var.auth.activeOrganization.slug ?? "";
        let projectId = resolveStoredFileProjectId(parsedForm.data.projectId ?? null);

        if (projectId) {
          const project = await getOwnedProject(c.var.auth, projectId);
          if (!project) {
            return badRequestResponse(c, "project_not_found");
          }
          projectId = project.id;
        }

        const adapter = options.fileStorageAdapter ?? getFileStorageAdapter();
        const storedFile = await createStoredFile({
          organizationId: orgId,
          projectId,
          createdByUserId: c.var.auth.user.localUserId,
          role: "asset",
          sourceKind: "editor_upload",
          filename: fileEntry.name || "image.png",
          contentType,
          content: await fileEntry.arrayBuffer(),
          metadata: {
            uploadSurface: "markdown_editor",
          },
          adapter,
        });

        return c.json(
          {
            file: {
              id: storedFile.id,
              url: buildOrganizationFileUrl(organizationSlug, storedFile.id),
              filename: storedFile.filename,
              contentType: storedFile.contentType,
              byteSize: storedFile.byteSize,
            },
          },
          201,
        );
      },
    )
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
