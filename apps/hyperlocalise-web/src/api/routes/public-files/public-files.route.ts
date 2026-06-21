import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";

import { getAccessibleProjectForApiKey } from "@/api/auth/api-key-access";
import {
  apiKeyAuthMiddleware,
  requireApiKeyPermission,
  type ApiKeyAuthVariables,
} from "@/api/auth/api-key";
import { canAccessStoredFile } from "@/api/auth/team-access";
import { db, schema } from "@/lib/database";
import { getFileStorageAdapter, type FileStorageAdapter } from "@/lib/file-storage";
import { createRepositorySourceFileVersion, createStoredFile } from "@/lib/file-storage/records";
import { dispatchWorkspaceAutomationsForSourceUpload } from "@/lib/agents/workspace-automation-dispatcher";
import { inferSupportedFileTranslationFileFormat } from "@/lib/translation/file-formats";

import { payloadTooLargeResponse } from "@/api/response.schema";

import { uploadBodySchema, fileParamsSchema, maxPublicUploadBytes } from "./public-files.schema";
import {
  invalidFilePayloadResponse,
  projectNotFoundResponse,
  fileNotFoundResponse,
  unsupportedFileResponse,
} from "./public-files.shared";

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function asFile(value: unknown) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values.find((item): item is File => item instanceof File && item.size > 0) ?? null;
}

type CreatePublicFileRoutesOptions = {
  fileStorageAdapter?: FileStorageAdapter;
};

export function createPublicFileRoutes(options: CreatePublicFileRoutesOptions = {}) {
  return new Hono<{ Variables: ApiKeyAuthVariables }>()
    .use("*", apiKeyAuthMiddleware)
    .post(
      "/",
      requireApiKeyPermission("files:write"),
      bodyLimit({
        maxSize: maxPublicUploadBytes,
        onError: (c) => payloadTooLargeResponse(c, "file_upload_too_large"),
      }),
      async (c) => {
        const body = await c.req.parseBody({ all: true });
        const parsed = uploadBodySchema.safeParse({
          projectId: asString(body.projectId),
          sourcePath: asString(body.sourcePath),
          sourceHash: asString(body.sourceHash),
          commitSha: asString(body.commitSha),
          workflowRunId: asString(body.workflowRunId),
        });

        if (!parsed.success) {
          return invalidFilePayloadResponse(c);
        }

        const file = asFile(body.file);
        if (!file) {
          return invalidFilePayloadResponse(c);
        }

        if (!inferSupportedFileTranslationFileFormat(file.name)) {
          return unsupportedFileResponse(c, file.name);
        }

        const organizationId = c.var.auth.organization.localOrganizationId;
        const project = await getAccessibleProjectForApiKey(
          c.var.auth.teamAccess,
          parsed.data.projectId,
        );

        if (!project) {
          return projectNotFoundResponse(c);
        }

        const adapter = options.fileStorageAdapter ?? getFileStorageAdapter();
        let uploadedFile: typeof schema.storedFiles.$inferSelect | null = null;

        const { storedFile, version } = await db
          .transaction(async (tx) => {
            uploadedFile = await createStoredFile({
              organizationId,
              projectId: project.id,
              role: "source",
              sourceKind: "repository_file",
              filename: file.name,
              contentType: file.type || "application/octet-stream",
              content: await file.arrayBuffer(),
              metadata: {
                sourcePath: parsed.data.sourcePath,
                sourceHash: parsed.data.sourceHash,
                commitSha: parsed.data.commitSha,
                workflowRunId: parsed.data.workflowRunId,
                uploadSurface: "public_api",
              },
              adapter,
              db: tx,
            });

            const version = await createRepositorySourceFileVersion({
              storedFile: uploadedFile,
              sourcePath: parsed.data.sourcePath,
              sourceHash: parsed.data.sourceHash,
              commitSha: parsed.data.commitSha,
              workflowRunId: parsed.data.workflowRunId,
              uploadedByApiKeyId: c.var.auth.apiKey.id,
              uploadSurface: "public_api",
              db: tx,
            });

            return { storedFile: uploadedFile, version };
          })
          .catch(async (error) => {
            if (uploadedFile) {
              await adapter.delete({ keyOrUrl: uploadedFile.storageKey }).catch(() => {});
            }
            throw error;
          });

        void dispatchWorkspaceAutomationsForSourceUpload({
          organizationId,
          projectId: project.id,
          sourceFileId: storedFile.id,
          sourceFileVersionId: version.id,
          sourcePath: parsed.data.sourcePath,
        }).catch(() => undefined);

        return c.json(
          {
            file: {
              id: storedFile.id,
              sourceFileVersionId: version.id,
              filename: storedFile.filename,
              contentType: storedFile.contentType,
              byteSize: storedFile.byteSize,
              sha256: storedFile.sha256,
            },
          },
          201,
        );
      },
    )
    .get("/:fileId/download", requireApiKeyPermission("files:read"), async (c) => {
      const parsed = fileParamsSchema.safeParse(c.req.param());
      if (!parsed.success) {
        return fileNotFoundResponse(c);
      }

      const organizationId = c.var.auth.organization.localOrganizationId;
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
            eq(schema.storedFiles.id, parsed.data.fileId),
            eq(schema.storedFiles.organizationId, organizationId),
          ),
        )
        .limit(1);

      if (
        !file ||
        !(await canAccessStoredFile(c.var.auth.teamAccess, {
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
