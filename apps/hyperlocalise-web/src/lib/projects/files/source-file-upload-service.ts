import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import type { FileStorageAdapter } from "@/lib/file-storage";
import { getFileStorageAdapter } from "@/lib/file-storage";
import { createRepositorySourceFileVersion, createStoredFile } from "@/lib/file-storage/records";
import { createLogger } from "@/lib/log";
import { getTmsProvider } from "@/lib/providers/adapters/tms-provider-registry";
import type { ExternalTmsProviderKind } from "@/lib/providers/contracts/external-tms-provider-kind";
import type { ExternalTmsSourceFileUploadError } from "@/lib/providers/jobs/tms-provider-types";
import { resolveExternalTmsSecretMaterialForActor } from "@/lib/providers/shared/tms-provider-content";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";
import { enqueueSourceFileIngestAfterUpload } from "./source-file-ingest";

type ProjectRecord = typeof schema.projects.$inferSelect;

const logger = createLogger("source-file-upload-service");

export type SourceFileUploadInput = {
  organizationId: string;
  project: ProjectRecord;
  file: {
    filename: string;
    contentType: string;
    content: Uint8Array;
  };
  sourcePath: string;
  sourceHash?: string | null;
  commitSha?: string | null;
  workflowRunId?: string | null;
  sourceLocale?: string | null;
  format?: string | null;
  branch?: string | null;
  uploadSurface: string;
  uploadedByApiKeyId?: string | null;
  uploadedByUserId?: string | null;
  actorUserId?: string | null;
  fileStorageAdapter?: FileStorageAdapter;
};

export type NativeSourceFileUploadResult = {
  destination: "native";
  file: {
    id: string;
    sourceFileVersionId: string;
    filename: string;
    contentType: string;
    byteSize: number;
    sha256: string;
  };
};

export type ExternalTmsSourceFileUploadResult = {
  destination: "external_tms";
  file: {
    id: string | null;
    sourcePath: string;
    providerKind: ExternalTmsProviderKind;
    externalProjectId: string;
    externalResourceId: string | null;
    revision: string | null;
    asyncOperation: Record<string, unknown> | null;
    providerPayload: Record<string, unknown>;
  };
};

export type SourceFileUploadResult =
  | NativeSourceFileUploadResult
  | ExternalTmsSourceFileUploadResult;

export type SourceFileUploadError =
  | { code: "external_tms_project_not_found" }
  | { code: "provider_credential_not_found" }
  | { code: "source_upload_failed" }
  | ExternalTmsSourceFileUploadError;

export async function uploadSourceFile(
  input: SourceFileUploadInput,
): Promise<Result<SourceFileUploadResult, SourceFileUploadError>> {
  if (input.project.source === "external_tms") {
    return uploadExternalTmsSourceFile(input);
  }

  return ok(await uploadNativeSourceFile(input));
}

async function uploadNativeSourceFile(
  input: SourceFileUploadInput,
): Promise<NativeSourceFileUploadResult> {
  const adapter = input.fileStorageAdapter ?? getFileStorageAdapter();
  let uploadedFile: typeof schema.storedFiles.$inferSelect | null = null;

  const { storedFile, version } = await db
    .transaction(async (tx) => {
      uploadedFile = await createStoredFile({
        organizationId: input.organizationId,
        projectId: input.project.id,
        createdByUserId: input.uploadedByUserId ?? undefined,
        role: "source",
        sourceKind: "repository_file",
        filename: input.file.filename,
        contentType: input.file.contentType,
        content: input.file.content,
        metadata: {
          sourcePath: input.sourcePath,
          sourceHash: input.sourceHash ?? null,
          commitSha: input.commitSha ?? null,
          workflowRunId: input.workflowRunId ?? null,
          uploadSurface: input.uploadSurface,
        },
        adapter,
        db: tx,
      });

      const version = await createRepositorySourceFileVersion({
        storedFile: uploadedFile,
        sourcePath: input.sourcePath,
        sourceHash: input.sourceHash ?? undefined,
        commitSha: input.commitSha ?? undefined,
        workflowRunId: input.workflowRunId ?? undefined,
        uploadedByApiKeyId: input.uploadedByApiKeyId ?? undefined,
        uploadedByUserId: input.uploadedByUserId ?? undefined,
        uploadSurface: input.uploadSurface,
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

  void enqueueSourceFileIngestAfterUpload({
    organizationId: input.organizationId,
    projectId: input.project.id,
    storedFileId: storedFile.id,
    sourceFileVersionId: version.id,
    sourcePath: input.sourcePath,
    sourceHash: input.sourceHash ?? storedFile.sha256,
  }).catch((error) => {
    logger.warn(
      {
        projectId: input.project.id,
        sourceFileVersionId: version.id,
        error: error instanceof Error ? error.message : "unknown",
      },
      "source-file-upload source ingest enqueue failed",
    );
  });

  return {
    destination: "native",
    file: {
      id: storedFile.id,
      sourceFileVersionId: version.id,
      filename: storedFile.filename,
      contentType: storedFile.contentType,
      byteSize: storedFile.byteSize,
      sha256: storedFile.sha256,
    },
  };
}

async function uploadExternalTmsSourceFile(
  input: SourceFileUploadInput,
): Promise<Result<ExternalTmsSourceFileUploadResult, SourceFileUploadError>> {
  const providerKind = input.project.externalProviderKind as ExternalTmsProviderKind | null;
  const externalProjectId = input.project.externalProjectId?.trim();
  if (!providerKind || !externalProjectId) {
    return err({ code: "external_tms_project_not_found" });
  }
  if (!input.project.externalProviderCredentialId) {
    return err({ code: "provider_credential_not_found" });
  }

  const [credential] = await db
    .select()
    .from(schema.organizationExternalTmsProviderCredentials)
    .where(
      and(
        eq(
          schema.organizationExternalTmsProviderCredentials.id,
          input.project.externalProviderCredentialId,
        ),
        eq(schema.organizationExternalTmsProviderCredentials.organizationId, input.organizationId),
        eq(schema.organizationExternalTmsProviderCredentials.providerKind, providerKind),
      ),
    )
    .limit(1);

  if (!credential) {
    return err({ code: "provider_credential_not_found" });
  }

  let providerResult;
  try {
    const secretMaterial = await resolveExternalTmsSecretMaterialForActor({
      credential,
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
    });
    providerResult = await getTmsProvider(providerKind).uploadSourceFile({
      organizationId: input.organizationId,
      projectId: input.project.id,
      externalProjectId,
      credential,
      project: input.project,
      secretMaterial,
      file: {
        sourcePath: input.sourcePath,
        filename: input.file.filename,
        contentType: input.file.contentType,
        content: input.file.content,
        sourceHash: input.sourceHash ?? null,
        sourceLocale: input.sourceLocale ?? input.project.sourceLocale ?? null,
        format: input.format ?? null,
        branch: input.branch ?? null,
      },
    });
  } catch (error) {
    logger.warn(
      {
        projectId: input.project.id,
        providerKind,
        error: error instanceof Error ? error.message : "unknown",
      },
      "external TMS source upload failed",
    );
    return err({ code: "source_upload_failed" });
  }

  if (isErr(providerResult)) {
    return providerResult;
  }

  return ok({
    destination: "external_tms",
    file: {
      id: providerResult.value.externalResourceId ?? null,
      sourcePath: providerResult.value.sourcePath,
      providerKind,
      externalProjectId,
      externalResourceId: providerResult.value.externalResourceId ?? null,
      revision: providerResult.value.revision ?? null,
      asyncOperation: providerResult.value.asyncOperation ?? null,
      providerPayload: providerResult.value.providerPayload ?? {},
    },
  });
}
