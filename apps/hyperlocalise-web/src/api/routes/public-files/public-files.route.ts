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
import {
  uploadSourceFile,
  type SourceFileUploadError,
} from "@/lib/projects/files/source-file-upload-service";
import { isErr } from "@/lib/primitives/result/results";
import { inferSupportedSourceUploadFormat } from "@/lib/translation/file-formats";

import { badRequestResponse, payloadTooLargeResponse } from "@/api/response.schema";

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

function sourceUploadErrorResponse(
  c: Parameters<typeof badRequestResponse>[0],
  error: SourceFileUploadError,
) {
  switch (error.code) {
    case "external_tms_project_not_found":
      return projectNotFoundResponse(c);
    case "provider_credential_not_found":
      return badRequestResponse(c, "provider_credential_not_found");
    case "invalid_crowdin_project_id":
    case "crowdin_branch_not_found":
    case "phrase_source_locale_not_found":
    case "phrase_source_file_format_required":
    case "lokalise_source_locale_required":
    case "lokalise_source_file_format_required":
    case "smartling_source_file_type_required":
      return badRequestResponse(c, "invalid_file_payload", error.code);
    case "source_upload_failed":
      return c.json(
        {
          error: "source_upload_failed",
          message: "External TMS source upload failed.",
        },
        502,
      );
  }
}

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
          sourceLocale: asString(body.sourceLocale),
          format: asString(body.format),
          branch: asString(body.branch),
        });

        if (!parsed.success) {
          return invalidFilePayloadResponse(c);
        }

        const file = asFile(body.file);
        if (!file) {
          return invalidFilePayloadResponse(c);
        }

        if (!inferSupportedSourceUploadFormat(parsed.data.sourcePath)) {
          return unsupportedFileResponse(c, parsed.data.sourcePath);
        }

        const organizationId = c.var.auth.organization.localOrganizationId;
        const project = await getAccessibleProjectForApiKey(
          c.var.auth.teamAccess,
          parsed.data.projectId,
        );

        if (!project) {
          return projectNotFoundResponse(c);
        }

        const content = new Uint8Array(await file.arrayBuffer());
        const result = await uploadSourceFile({
          organizationId,
          project,
          file: {
            filename: file.name,
            contentType: file.type || "application/octet-stream",
            content,
          },
          sourcePath: parsed.data.sourcePath,
          sourceHash: parsed.data.sourceHash,
          commitSha: parsed.data.commitSha,
          workflowRunId: parsed.data.workflowRunId,
          sourceLocale: parsed.data.sourceLocale,
          format: parsed.data.format,
          branch: parsed.data.branch,
          uploadSurface: "public_api",
          uploadedByApiKeyId: c.var.auth.apiKey.id,
          actorUserId: c.var.auth.teamAccess.user.localUserId,
          fileStorageAdapter: options.fileStorageAdapter,
        });
        if (isErr(result)) {
          return sourceUploadErrorResponse(c, result.error);
        }

        return c.json(
          {
            file: {
              ...result.value.file,
              destination: result.value.destination,
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
