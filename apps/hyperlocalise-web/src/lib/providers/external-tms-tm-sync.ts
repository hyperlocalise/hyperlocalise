import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import type { ProviderSyncRunStatus } from "@/lib/database/types";
import { decryptProviderCredential } from "@/lib/security/provider-credential-crypto";

import {
  upsertOrganizationExternalTmsMemory,
  upsertOrganizationExternalTmsMemoryEntry,
} from "./organization-external-tms-memories";
import type { ExternalTmsProviderKind } from "./organization-external-tms-provider-credentials";
import {
  completeProviderSyncRun,
  failProviderSyncRun,
  startProviderSyncRun,
} from "./provider-sync-runs";

type ExternalTmsCredential = typeof schema.organizationExternalTmsProviderCredentials.$inferSelect;
type ExternalTmsProject = typeof schema.projects.$inferSelect;

export type ExternalTmsTranslationMemoryEntryMetadata = {
  externalKey: string;
  sourceLocale: string;
  targetLocale: string;
  sourceText: string;
  targetText: string;
  matchScore?: number;
  metadata?: Record<string, unknown>;
};

export type ExternalTmsTranslationMemoryMetadata = {
  externalMemoryId: string;
  name: string;
  description?: string;
  sourceLocale: string;
  localeCoverage?: string[];
  segmentCount?: number | null;
  externalUrl?: string | null;
  metadata?: Record<string, unknown>;
  syncErrorMessage?: string | null;
  entries?: ExternalTmsTranslationMemoryEntryMetadata[];
};

export type ExternalTmsTranslationMemoryFetcher = (input: {
  organizationId: string;
  projectId: string;
  providerKind: ExternalTmsProviderKind;
  externalProjectId: string;
  credential: ExternalTmsCredential;
  project: ExternalTmsProject;
  secretMaterial: string;
}) => Promise<ExternalTmsTranslationMemoryMetadata[]>;

export type ExternalTmsTranslationMemorySyncFailure = {
  externalMemoryId: string | null;
  name: string | null;
  message: string;
};

export type ExternalTmsTranslationMemorySyncResult = {
  runId: string;
  status: Extract<ProviderSyncRunStatus, "succeeded" | "failed">;
  providerKind: ExternalTmsProviderKind;
  providerCredentialId: string;
  projectId: string;
  counts: {
    memoriesDiscovered: number;
    memoriesSynced: number;
    memoriesFailed: number;
    entriesSynced: number;
  };
  failures: ExternalTmsTranslationMemorySyncFailure[];
};

export async function syncExternalTmsTranslationMemories(input: {
  organizationId: string;
  projectId: string;
  providerKind: ExternalTmsProviderKind;
  fetchTranslationMemories: ExternalTmsTranslationMemoryFetcher;
}): Promise<ExternalTmsTranslationMemorySyncResult> {
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
    kind: "tm_scan",
    projectId: project.id,
    externalProjectId: project.externalProjectId,
    resourceType: "translation_memory",
    providerMetadata: { credentialId: credential.id },
  });

  const counts: ExternalTmsTranslationMemorySyncResult["counts"] = {
    memoriesDiscovered: 0,
    memoriesSynced: 0,
    memoriesFailed: 0,
    entriesSynced: 0,
  };
  const failures: ExternalTmsTranslationMemorySyncFailure[] = [];

  try {
    const secretMaterial = decryptProviderCredential({
      algorithm: credential.encryptionAlgorithm,
      keyVersion: credential.keyVersion,
      ciphertext: credential.ciphertext,
      iv: credential.iv,
      authTag: credential.authTag,
    });

    const memories = await input.fetchTranslationMemories({
      organizationId: input.organizationId,
      projectId: project.id,
      providerKind: input.providerKind,
      externalProjectId: project.externalProjectId,
      credential,
      project,
      secretMaterial,
    });

    counts.memoriesDiscovered = memories.length;

    for (const memory of memories) {
      try {
        if (memory.syncErrorMessage) {
          counts.memoriesFailed += 1;
          failures.push({
            externalMemoryId: memory.externalMemoryId,
            name: memory.name,
            message: memory.syncErrorMessage,
          });
          continue;
        }

        const record = await upsertOrganizationExternalTmsMemory({
          organizationId: input.organizationId,
          providerCredentialId: credential.id,
          providerKind: input.providerKind,
          externalProjectId: project.externalProjectId,
          externalMemoryId: memory.externalMemoryId,
          name: memory.name,
          description: memory.description,
          sourceLocale: memory.sourceLocale,
          localeCoverage: memory.localeCoverage,
          segmentCount: memory.segmentCount,
          externalUrl: memory.externalUrl,
          metadata: memory.metadata,
        });

        await ensureProjectMemoryAttachment({
          organizationId: input.organizationId,
          projectId: project.id,
          memoryId: record.id,
        });

        for (const entry of memory.entries ?? []) {
          await upsertOrganizationExternalTmsMemoryEntry({
            memoryId: record.id,
            externalKey: entry.externalKey,
            sourceLocale: entry.sourceLocale,
            targetLocale: entry.targetLocale,
            sourceText: entry.sourceText,
            targetText: entry.targetText,
            matchScore: entry.matchScore,
            metadata: entry.metadata,
          });
          counts.entriesSynced += 1;
        }

        counts.memoriesSynced += 1;
      } catch (error) {
        counts.memoriesFailed += 1;
        failures.push({
          externalMemoryId: memory.externalMemoryId,
          name: memory.name,
          message: error instanceof Error ? error.message : "translation memory sync failed",
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
        errorMessage: "One or more provider translation memories failed to sync",
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
      errorMessage:
        error instanceof Error ? error.message : "provider translation memory sync failed",
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

async function ensureProjectMemoryAttachment(input: {
  organizationId: string;
  projectId: string;
  memoryId: string;
}) {
  await db
    .insert(schema.projectMemories)
    .values({
      organizationId: input.organizationId,
      projectId: input.projectId,
      memoryId: input.memoryId,
      priority: 0,
    })
    .onConflictDoNothing({
      target: [schema.projectMemories.projectId, schema.projectMemories.memoryId],
    });
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
