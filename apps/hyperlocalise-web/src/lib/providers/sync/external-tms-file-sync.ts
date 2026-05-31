import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import type { ProviderSyncRunStatus } from "@/lib/database/types";
import {
  decryptProviderCredential,
  unwrapProviderCredentialCrypto,
} from "@/lib/security/provider-credential-crypto";

import type { ExternalTmsProviderKind } from "../organization-external-tms-provider-credentials";
import { upsertExternalTmsFile } from "./organization-external-tms-files";
import {
  completeProviderSyncRun,
  failProviderSyncRun,
  startProviderSyncRun,
} from "./provider-sync-runs";

type ExternalTmsCredential = typeof schema.organizationExternalTmsProviderCredentials.$inferSelect;
type ExternalTmsProject = typeof schema.projects.$inferSelect;

export type ExternalTmsFileKeyMetadata = {
  externalResourceId: string;
  resourceType: "file" | "key";
  sourcePath: string;
  displayName?: string | null;
  format?: string | null;
  sourceLocale?: string | null;
  targetLocales?: string[];
  sourceHash?: string | null;
  revision?: string | null;
  externalUrl?: string | null;
  syncState?: string;
  localeReadiness?: Record<string, unknown>;
  providerPayload?: Record<string, unknown>;
  syncErrorMessage?: string | null;
};

export type ExternalTmsFileKeyFetcher = (input: {
  organizationId: string;
  projectId: string;
  providerKind: ExternalTmsProviderKind;
  externalProjectId: string;
  credential: ExternalTmsCredential;
  project: ExternalTmsProject;
  secretMaterial: string;
}) => Promise<ExternalTmsFileKeyMetadata[]>;

export type ExternalTmsFileKeySyncFailure = {
  externalResourceId: string | null;
  sourcePath: string | null;
  message: string;
};

export type ExternalTmsFileKeySyncResult = {
  runId: string;
  status: Extract<ProviderSyncRunStatus, "succeeded" | "failed">;
  providerKind: ExternalTmsProviderKind;
  providerCredentialId: string;
  projectId: string;
  counts: {
    filesDiscovered: number;
    filesSynced: number;
    filesFailed: number;
  };
  failures: ExternalTmsFileKeySyncFailure[];
};

export async function syncExternalTmsFileKeys(input: {
  organizationId: string;
  projectId: string;
  providerKind: ExternalTmsProviderKind;
  fetchFileKeys: ExternalTmsFileKeyFetcher;
}): Promise<ExternalTmsFileKeySyncResult> {
  const project = await getExternalTmsProject(input);

  if (!project?.externalProjectId) {
    throw new Error("external_tms_project_not_found");
  }

  const credential = await getExternalTmsCredential({
    organizationId: input.organizationId,
    providerKind: input.providerKind,
    credentialId: project.externalProviderCredentialId,
  });

  if (!credential) {
    throw new Error("provider_credential_not_found");
  }

  const run = await startProviderSyncRun({
    organizationId: input.organizationId,
    providerKind: input.providerKind,
    providerCredentialId: credential.id,
    kind: "file_key_scan",
    projectId: project.id,
    externalProjectId: project.externalProjectId,
    resourceType: "file_key",
    providerMetadata: { credentialId: credential.id },
  });

  const counts: ExternalTmsFileKeySyncResult["counts"] = {
    filesDiscovered: 0,
    filesSynced: 0,
    filesFailed: 0,
  };
  const failures: ExternalTmsFileKeySyncFailure[] = [];

  try {
    const secretMaterial = unwrapProviderCredentialCrypto(
      decryptProviderCredential({
        algorithm: credential.encryptionAlgorithm,
        keyVersion: credential.keyVersion,
        ciphertext: credential.ciphertext,
        iv: credential.iv,
        authTag: credential.authTag,
      }),
    );
    const fileKeys = await input.fetchFileKeys({
      organizationId: input.organizationId,
      projectId: project.id,
      providerKind: input.providerKind,
      externalProjectId: project.externalProjectId,
      credential,
      project,
      secretMaterial,
    });

    counts.filesDiscovered = fileKeys.length;

    for (const fileKey of fileKeys) {
      try {
        if (fileKey.syncErrorMessage) {
          counts.filesFailed += 1;
          failures.push({
            externalResourceId: fileKey.externalResourceId ?? null,
            sourcePath: fileKey.sourcePath ?? null,
            message: fileKey.syncErrorMessage,
          });
          continue;
        }

        await upsertExternalTmsFile({
          organizationId: input.organizationId,
          projectId: project.id,
          providerCredentialId: credential.id,
          providerKind: input.providerKind,
          externalProjectId: project.externalProjectId,
          resourceType: fileKey.resourceType,
          externalResourceId: fileKey.externalResourceId,
          sourcePath: fileKey.sourcePath,
          displayName: fileKey.displayName ?? null,
          format: fileKey.format ?? null,
          sourceLocale: fileKey.sourceLocale ?? null,
          targetLocales: fileKey.targetLocales,
          sourceHash: fileKey.sourceHash ?? null,
          revision: fileKey.revision ?? null,
          externalUrl: fileKey.externalUrl ?? null,
          syncState: fileKey.syncState ?? "synced",
          localeReadiness: fileKey.localeReadiness,
          providerPayload: fileKey.providerPayload,
          lastSyncedAt: new Date(),
        });
        counts.filesSynced += 1;
      } catch (error) {
        counts.filesFailed += 1;
        failures.push({
          externalResourceId: fileKey.externalResourceId ?? null,
          sourcePath: fileKey.sourcePath ?? null,
          message: error instanceof Error ? error.message : "file/key sync failed",
        });
      }
    }

    const status = failures.length > 0 ? "failed" : "succeeded";
    const finishInput = {
      runId: run.id,
      organizationId: run.organizationId,
      counts,
      providerMetadata: {
        credentialId: credential.id,
        failures,
      },
    };

    if (status === "failed") {
      await failProviderSyncRun({
        ...finishInput,
        errorMessage: "One or more provider files/keys failed to sync",
        errorDetails: { failures },
      });
    } else {
      await completeProviderSyncRun(finishInput);
    }

    return {
      runId: run.id,
      status,
      providerKind: input.providerKind,
      providerCredentialId: credential.id,
      projectId: project.id,
      counts,
      failures,
    };
  } catch (error) {
    await failProviderSyncRun({
      runId: run.id,
      organizationId: run.organizationId,
      errorMessage: error instanceof Error ? error.message : "provider file/key sync failed",
      errorDetails: {
        name: error instanceof Error ? error.name : "UnknownError",
        stack: error instanceof Error ? error.stack : undefined,
      },
      counts,
      providerMetadata: { credentialId: credential.id },
    });
    throw error;
  }
}

async function getExternalTmsProject(input: {
  organizationId: string;
  projectId: string;
  providerKind: ExternalTmsProviderKind;
}) {
  const [project] = await db
    .select()
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.id, input.projectId),
        eq(schema.projects.organizationId, input.organizationId),
        eq(schema.projects.externalProviderKind, input.providerKind),
        eq(schema.projects.source, "external_tms"),
      ),
    )
    .limit(1);

  return project ?? null;
}

async function getExternalTmsCredential(input: {
  organizationId: string;
  providerKind: ExternalTmsProviderKind;
  credentialId: string | null;
}) {
  if (!input.credentialId) {
    return null;
  }

  const [credential] = await db
    .select()
    .from(schema.organizationExternalTmsProviderCredentials)
    .where(
      and(
        eq(schema.organizationExternalTmsProviderCredentials.organizationId, input.organizationId),
        eq(schema.organizationExternalTmsProviderCredentials.providerKind, input.providerKind),
        eq(schema.organizationExternalTmsProviderCredentials.id, input.credentialId),
      ),
    )
    .limit(1);

  return credential ?? null;
}
