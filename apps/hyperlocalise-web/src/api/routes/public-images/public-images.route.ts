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
import { db, schema } from "@/lib/database";
import { getFileStorageAdapter, type FileStorageAdapter } from "@/lib/file-storage";

import {
  downloadPublicImageQuerySchema,
  publicImageProjectParamsSchema,
} from "./public-images.schema";
import {
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
    .use("*", apiKeyAuthMiddleware)
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

        const [variant] = await db
          .select({
            storedFileId: schema.projectImageVariants.storedFileId,
          })
          .from(schema.projectImageVariants)
          .where(
            and(
              eq(schema.projectImageVariants.organizationId, organizationId),
              eq(schema.projectImageVariants.projectId, project.id),
              eq(schema.projectImageVariants.sourcePath, query.sourcePath),
              eq(schema.projectImageVariants.targetLocale, query.locale),
            ),
          )
          .limit(1);

        if (!variant?.storedFileId) {
          return imageVariantNotFoundResponse(c);
        }

        const [file] = await db
          .select({
            storageKey: schema.storedFiles.storageKey,
            filename: schema.storedFiles.filename,
            contentType: schema.storedFiles.contentType,
          })
          .from(schema.storedFiles)
          .where(
            and(
              eq(schema.storedFiles.id, variant.storedFileId),
              eq(schema.storedFiles.organizationId, organizationId),
            ),
          )
          .limit(1);

        if (!file) {
          return imageVariantNotFoundResponse(c);
        }

        const adapter = options.fileStorageAdapter ?? getFileStorageAdapter();
        const storedObject = await adapter.get({ keyOrUrl: file.storageKey });
        if (!storedObject) {
          return imageVariantNotFoundResponse(c);
        }

        const filename = downloadFilename(query.sourcePath, query.locale);

        return c.body(storedObject.body, 200, {
          "Content-Type":
            storedObject.contentType ?? file.contentType ?? "application/octet-stream",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
          "Content-Security-Policy": "default-src 'none'; sandbox;",
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "no-store",
        });
      },
    );
}
