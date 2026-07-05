import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import type { FileStorageAdapter } from "@/lib/file-storage";
import { getFileStorageAdapter } from "@/lib/file-storage";
import { createRepositorySourceFileVersion, createStoredFile } from "@/lib/file-storage/records";
import { getTmsProviderAdapter } from "@/lib/providers/adapters/tms-provider-adapter-registry";
import type { ExternalTmsProviderKind } from "@/lib/providers/contracts/external-tms-provider-kind";
import { resolveExternalTmsSecretMaterialForActor } from "@/lib/providers/tms-provider-content";
import { enqueueSourceFileIngestAfterUpload } from "./source-file-ingest";

type ProjectRecord = typeof schema.projects.$inferSelect;

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

export async function uploadSourceFile(input: SourceFileUploadInput): Promise<SourceFileUploadResult> {
  if (input.project.source === "external_tms") {
    return uploadExternalTmsSourceFile(input);
  }

  return uploadNativeSourceFile(input);
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
  }).catch(() => {});

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
): Promise<ExternalTmsSourceFileUploadResult> {
  const providerKind = input.project.externalProviderKind as ExternalTmsProviderKind | null;
  const externalProjectId = input.project.externalProjectId?.trim();
  if (!providerKind || !externalProjectId) {
    throw new Error("external_tms_project_not_found");
  }
  if (!input.project.externalProviderCredentialId) {
    throw new Error("provider_credential_not_found");
  }

  const [credential] = await db
    .select()
    .from(schema.organizationExternalTmsProviderCredentials)
    .where(
      and(
        eq(schema.organizationExternalTmsProviderCredentials.id, input.project.externalProviderCredentialId),
        eq(schema.organizationExternalTmsProviderCredentials.organizationId, input.organizationId),
        eq(schema.organizationExternalTmsProviderCredentials.providerKind, providerKind),
      ),
    )
    .limit(1);

  if (!credential) {
    throw new Error("provider_credential_not_found");
  }

  const secretMaterial = await resolveExternalTmsSecretMaterialForActor({
    credential,
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
  });
  const providerResult = await getTmsProviderAdapter(providerKind).uploadSourceFile({
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

  return {
    destination: "external_tms",
    file: {
      id: providerResult.externalResourceId ?? null,
      sourcePath: providerResult.sourcePath,
      providerKind,
      externalProjectId,
      externalResourceId: providerResult.externalResourceId ?? null,
      revision: providerResult.revision ?? null,
      asyncOperation: providerResult.asyncOperation ?? null,
      providerPayload: providerResult.providerPayload ?? {},
    },
  };
}
