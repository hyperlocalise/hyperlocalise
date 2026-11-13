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
import { Hono } from "hono";
import path from "node:path";
import { validator } from "hono/validator";

import { requireApiKeyPermission, type ApiKeyAuthVariables } from "@/api/auth/api-key";
import { getAccessibleProjectForApiKey } from "@/api/auth/api-key-access";
import { publicApiAuthMiddleware } from "@/api/auth/workos-agent";
import type { FileStorageAdapter } from "@/lib/file-storage/types";
import { loadProjectFileVariant } from "@/lib/projects/files/file-variant-download";

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

export function createPublicImageRoutes(options: CreatePublicImageRoutesOptions = {}) {
  return new Hono<{ Variables: ApiKeyAuthVariables }>()
    .use("*", publicApiAuthMiddleware)
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
