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
import path from "node:path";
import { validator } from "hono/validator";

import {
  apiKeyAuthMiddleware,
  requireApiKeyPermission,
  type ApiKeyAuthVariables,
} from "@/api/auth/api-key";
import { getAccessibleProjectForApiKey } from "@/api/auth/api-key-access";
import { db, schema } from "@/lib/database/client";
import { getFileStorageAdapter } from "@/lib/file-storage/get-file-storage-adapter";
import type { FileStorageAdapter } from "@/lib/file-storage/types";

import {
  downloadPublicImageQuerySchema,
  publicImageProjectParamsSchema,
} from "./public-images.schema";
import {
  fileVariantNotFoundResponse,
  imageVariantNotFoundResponse,
  invalidImagePayloadResponse,
  projectNotFoundResponse,
} from "./public-images.shared";

const validateProjectParams = validator("param", (value, c) => {
  const parsed = publicImageProjectParamsSchema.safeParse(value);
  if (!parsed.success) {
    return projectNotFoundResponse(c);
  }
  return parsed.data;
});

const validateDownloadQuery = validator("query", (value, c) => {
  const parsed = downloadPublicImageQuerySchema.safeParse(value);
  if (!parsed.success) {
    return invalidImagePayloadResponse(c);
  }
  return parsed.data;
});

function downloadFilename(sourcePath: string, locale: string) {
  const extension = path.extname(sourcePath);
  const baseName = path.basename(sourcePath, extension);
  const suffix = baseName.endsWith(`-${locale}`) ? baseName : `${baseName}-${locale}`;
  return extension ? `${suffix}${extension}` : suffix;
}

type CreatePublicImageRoutesOptions = {
  fileStorageAdapter?: FileStorageAdapter;
};

type ProjectFileVariantDownload = {
  body: ReadableStream;
  contentType: string;
};

async function loadProjectFileVariant(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  locale: string;
  fileStorageAdapter?: FileStorageAdapter;
}): Promise<ProjectFileVariantDownload | null> {
  const [variant] = await db
    .select({
      storedFileId: schema.projectImageVariants.storedFileId,
    })
    .from(schema.projectImageVariants)
    .where(
      and(
        eq(schema.projectImageVariants.organizationId, input.organizationId),
        eq(schema.projectImageVariants.projectId, input.projectId),
        eq(schema.projectImageVariants.sourcePath, input.sourcePath),
        eq(schema.projectImageVariants.targetLocale, input.locale),
      ),
    )
    .limit(1);

  if (!variant?.storedFileId) {
    return null;
  }

  const [file] = await db
    .select({
      storageKey: schema.storedFiles.storageKey,
      contentType: schema.storedFiles.contentType,
    })
    .from(schema.storedFiles)
    .where(
      and(
        eq(schema.storedFiles.id, variant.storedFileId),
        eq(schema.storedFiles.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  if (!file) {
    return null;
  }

  const adapter = input.fileStorageAdapter ?? getFileStorageAdapter();
  const storedObject = await adapter.get({ keyOrUrl: file.storageKey });
  if (!storedObject) {
    return null;
  }

  return {
    body: storedObject.body,
    contentType: storedObject.contentType ?? file.contentType ?? "application/octet-stream",
  };
}

export function createPublicImageRoutes(options: CreatePublicImageRoutesOptions = {}) {
  return new Hono<{ Variables: ApiKeyAuthVariables }>()
    .use("*", apiKeyAuthMiddleware)
    .get(
      "/:projectId/files/download",
      requireApiKeyPermission("files:read"),
      validateProjectParams,
      validateDownloadQuery,
      async (c) => {
        const params = c.req.valid("param");
        const query = c.req.valid("query");
        const organizationId = c.var.auth.organization.localOrganizationId;

        const project = await getAccessibleProjectForApiKey(
          c.var.auth.teamAccess,
          params.projectId,
        );
        if (!project) {
          return projectNotFoundResponse(c);
        }

        const stored = await loadProjectFileVariant({
          organizationId,
          projectId: project.id,
          sourcePath: query.sourcePath,
          locale: query.locale,
          fileStorageAdapter: options.fileStorageAdapter,
        });
        if (!stored) {
          return fileVariantNotFoundResponse(c);
        }

        const filename = downloadFilename(query.sourcePath, query.locale);
        return c.body(stored.body, 200, {
          "Content-Type": stored.contentType,
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
          "Content-Security-Policy": "default-src 'none'; sandbox;",
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "no-store",
        });
      },
    )
    .get(
      "/:projectId/images/download",
      requireApiKeyPermission("files:read"),
      validateProjectParams,
      validateDownloadQuery,
      async (c) => {
        const params = c.req.valid("param");
        const query = c.req.valid("query");
        const organizationId = c.var.auth.organization.localOrganizationId;

        const project = await getAccessibleProjectForApiKey(
          c.var.auth.teamAccess,
          params.projectId,
        );
        if (!project) {
          return projectNotFoundResponse(c);
        }

        const stored = await loadProjectFileVariant({
          organizationId,
          projectId: project.id,
          sourcePath: query.sourcePath,
          locale: query.locale,
          fileStorageAdapter: options.fileStorageAdapter,
        });
        if (!stored) {
          return imageVariantNotFoundResponse(c);
        }

        const filename = downloadFilename(query.sourcePath, query.locale);
        return c.body(stored.body, 200, {
          "Content-Type": stored.contentType,
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
          "Content-Security-Policy": "default-src 'none'; sandbox;",
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "no-store",
        });
      },
    );
}
