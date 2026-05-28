import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import type { ProviderSyncRunStatus } from "@/lib/database/types";
import { decryptProviderCredential } from "@/lib/security/provider-credential-crypto";

import type { ExternalTmsProviderKind } from "./organization-external-tms-provider-credentials";
import { upsertOrganizationExternalTmsProject } from "./organization-external-tms-projects";
import {
  completeProviderSyncRun,
  failProviderSyncRun,
  startProviderSyncRun,
} from "./provider-sync-runs";
import { ensureProviderWebhookSubscription } from "./provider-webhook-subscription-manager";

type ExternalTmsCredential = typeof schema.organizationExternalTmsProviderCredentials.$inferSelect;

export type ExternalTmsProjectMetadata = {
  externalProjectId: string;
  name: string;
  sourceLocale?: string | null;
  targetLocales?: string[];
  externalProjectUrl?: string | null;
  isActive?: boolean;
  metadata?: Record<string, unknown>;
};

export type ExternalTmsProjectFetcher = (input: {
  organizationId: string;
  providerKind: ExternalTmsProviderKind;
  credential: ExternalTmsCredential;
  secretMaterial: string;
}) => Promise<ExternalTmsProjectMetadata[]>;

export type ExternalTmsProjectSyncFailure = {
  externalProjectId: string | null;
  name: string | null;
  message: string;
};

export type ExternalTmsProjectSyncResult = {
  runId: string;
  status: Extract<ProviderSyncRunStatus, "succeeded" | "failed">;
  providerKind: ExternalTmsProviderKind;
  providerCredentialId: string;
  counts: {
    projectsDiscovered: number;
    projectsSynced: number;
    projectsFailed: number;
    localesSynced: number;
  };
  failures: ExternalTmsProjectSyncFailure[];
};

export async function syncExternalTmsProjects(input: {
  organizationId: string;
  providerKind: ExternalTmsProviderKind;
  fetchProjects: ExternalTmsProjectFetcher;
}): Promise<ExternalTmsProjectSyncResult> {
  const credential = await getExternalTmsCredential({
    organizationId: input.organizationId,
    providerKind: input.providerKind,
  });

  if (!credential) {
    throw new Error("provider_credential_not_found");
  }

  const run = await startProviderSyncRun({
    organizationId: input.organizationId,
    providerKind: input.providerKind,
    providerCredentialId: credential.id,
    kind: "project_scan",
    resourceType: "project",
    providerMetadata: { credentialId: credential.id },
  });

  const counts: ExternalTmsProjectSyncResult["counts"] = {
    projectsDiscovered: 0,
    projectsSynced: 0,
    projectsFailed: 0,
    localesSynced: 0,
  };
  const failures: ExternalTmsProjectSyncFailure[] = [];

  try {
    const secretMaterial = decryptProviderCredential({
      algorithm: credential.encryptionAlgorithm,
      keyVersion: credential.keyVersion,
      ciphertext: credential.ciphertext,
      iv: credential.iv,
      authTag: credential.authTag,
    });
    const projects = await input.fetchProjects({
      organizationId: input.organizationId,
      providerKind: input.providerKind,
      credential,
      secretMaterial,
    });

    counts.projectsDiscovered = projects.length;

    for (const project of projects) {
      try {
        const targetLocales = project.targetLocales ?? [];
        const syncedProject = await upsertOrganizationExternalTmsProject({
          organizationId: input.organizationId,
          providerCredentialId: credential.id,
          providerKind: input.providerKind,
          externalProjectId: project.externalProjectId,
          name: project.name,
          sourceLocale: project.sourceLocale ?? null,
          targetLocales,
          externalProjectUrl: project.externalProjectUrl ?? null,
          isActive: project.isActive ?? true,
          metadata: project.metadata,
        });
        void ensureProviderWebhookSubscription({
          organizationId: input.organizationId,
          providerKind: input.providerKind,
          providerCredentialId: credential.id,
          projectId: syncedProject.id,
          externalProjectId: project.externalProjectId,
        }).catch(() => undefined);
        counts.projectsSynced += 1;
        counts.localesSynced += countProjectLocales(project.sourceLocale, targetLocales);
      } catch (error) {
        counts.projectsFailed += 1;
        failures.push({
          externalProjectId: project.externalProjectId ?? null,
          name: project.name ?? null,
          message: error instanceof Error ? error.message : "project sync failed",
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
        errorMessage: "One or more provider projects failed to sync",
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
      counts,
      failures,
    };
  } catch (error) {
    await failProviderSyncRun({
      runId: run.id,
      organizationId: run.organizationId,
      errorMessage: error instanceof Error ? error.message : "provider project sync failed",
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

async function getExternalTmsCredential(input: {
  organizationId: string;
  providerKind: ExternalTmsProviderKind;
}) {
  const [credential] = await db
    .select()
    .from(schema.organizationExternalTmsProviderCredentials)
    .where(
      and(
        eq(schema.organizationExternalTmsProviderCredentials.organizationId, input.organizationId),
        eq(schema.organizationExternalTmsProviderCredentials.providerKind, input.providerKind),
      ),
    )
    .limit(1);

  return credential ?? null;
}

function countProjectLocales(sourceLocale: string | null | undefined, targetLocales: string[]) {
  return new Set([sourceLocale, ...targetLocales].filter(Boolean)).size;
}
