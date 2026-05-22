import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import type { ProviderSyncRunStatus } from "@/lib/database/types";
import { decryptProviderCredential } from "@/lib/security/provider-credential-crypto";

import type { ExternalTmsProviderKind } from "./organization-external-tms-provider-credentials";
import {
  completeProviderSyncRun,
  failProviderSyncRun,
  startProviderSyncRun,
} from "./provider-sync-runs";

type ExternalTmsCredential = typeof schema.organizationExternalTmsProviderCredentials.$inferSelect;
type ExternalTmsProject = typeof schema.projects.$inferSelect;

export type ExternalTmsTranslationUnit = {
  externalStringId: string;
  key: string;
  sourceText: string;
  context?: string | null;
  fileId?: string | null;
  translations: Array<{
    locale: string;
    text: string;
    externalTranslationId?: string | null;
    isApproved?: boolean;
  }>;
  providerPayload?: Record<string, unknown>;
};

export type ExternalTmsTaskContent = {
  externalJobId: string;
  externalTaskId?: string | null;
  sourceLocale?: string | null;
  targetLocales: string[];
  units: ExternalTmsTranslationUnit[];
  exportArtifact?: {
    url: string;
    format?: string | null;
    byteLength?: number | null;
  } | null;
  providerPayload?: Record<string, unknown>;
};

export type ExternalTmsApprovedTranslationUpload = {
  externalStringId?: string | null;
  key?: string | null;
  locale: string;
  text: string;
  fileId?: string | null;
  fileName?: string | null;
  format?: string | null;
};

export type ExternalTmsContentPuller = (input: {
  organizationId: string;
  projectId: string;
  providerKind: ExternalTmsProviderKind;
  externalProjectId: string;
  externalJobId: string;
  credential: ExternalTmsCredential;
  project: ExternalTmsProject;
  secretMaterial: string;
}) => Promise<ExternalTmsTaskContent>;

export type ExternalTmsTranslationPusher = (input: {
  organizationId: string;
  projectId: string;
  providerKind: ExternalTmsProviderKind;
  externalProjectId: string;
  externalJobId: string;
  credential: ExternalTmsCredential;
  project: ExternalTmsProject;
  secretMaterial: string;
  translations: ExternalTmsApprovedTranslationUpload[];
}) => Promise<{
  uploaded: number;
  failed: number;
  asyncOperations: Array<Record<string, unknown>>;
  failures: Array<{ locale: string; message: string; fileId?: string | null }>;
}>;

export type ExternalTmsContentSyncFailure = {
  externalStringId: string | null;
  locale: string | null;
  message: string;
};

export type ExternalTmsContentPullResult = {
  runId: string;
  status: Extract<ProviderSyncRunStatus, "succeeded" | "failed">;
  providerKind: ExternalTmsProviderKind;
  providerCredentialId: string;
  projectId: string;
  content: ExternalTmsTaskContent;
  counts: {
    unitsDiscovered: number;
    translationsDiscovered: number;
    approvedTranslations: number;
  };
  failures: ExternalTmsContentSyncFailure[];
};

export type ExternalTmsTranslationPushResult = {
  runId: string;
  status: Extract<ProviderSyncRunStatus, "succeeded" | "failed">;
  providerKind: ExternalTmsProviderKind;
  providerCredentialId: string;
  projectId: string;
  counts: {
    translationsRequested: number;
    translationsUploaded: number;
    translationsFailed: number;
    asyncOperations: number;
  };
  failures: ExternalTmsContentSyncFailure[];
  asyncOperations: Array<Record<string, unknown>>;
};

export async function pullExternalTmsTaskContent(input: {
  organizationId: string;
  projectId: string;
  providerKind: ExternalTmsProviderKind;
  externalJobId: string;
  pullContent: ExternalTmsContentPuller;
}): Promise<ExternalTmsContentPullResult> {
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
    kind: "pull_content",
    projectId: project.id,
    externalProjectId: project.externalProjectId,
    resourceType: "job_task",
    resourceId: input.externalJobId,
    externalResourceId: input.externalJobId,
    providerMetadata: { credentialId: credential.id },
  });

  try {
    const secretMaterial = decryptProviderCredential({
      algorithm: credential.encryptionAlgorithm,
      keyVersion: credential.keyVersion,
      ciphertext: credential.ciphertext,
      iv: credential.iv,
      authTag: credential.authTag,
    });

    const content = await input.pullContent({
      organizationId: input.organizationId,
      projectId: project.id,
      providerKind: input.providerKind,
      externalProjectId: project.externalProjectId,
      externalJobId: input.externalJobId,
      credential,
      project,
      secretMaterial,
    });

    const translationsDiscovered = content.units.reduce(
      (total, unit) => total + unit.translations.length,
      0,
    );
    const approvedTranslations = content.units.reduce(
      (total, unit) => total + unit.translations.filter((t) => t.isApproved).length,
      0,
    );

    const counts = {
      unitsDiscovered: content.units.length,
      translationsDiscovered,
      approvedTranslations,
    };

    await completeProviderSyncRun({
      runId: run.id,
      organizationId: run.organizationId,
      counts,
      providerMetadata: {
        credentialId: credential.id,
        externalJobId: input.externalJobId,
        exportArtifact: content.exportArtifact ?? null,
      },
    });

    return {
      runId: run.id,
      status: "succeeded",
      providerKind: input.providerKind,
      providerCredentialId: credential.id,
      projectId: project.id,
      content,
      counts,
      failures: [],
    };
  } catch (error) {
    await failProviderSyncRun({
      runId: run.id,
      organizationId: run.organizationId,
      errorMessage: error instanceof Error ? error.message : "provider content pull failed",
      errorDetails: {
        name: error instanceof Error ? error.name : "UnknownError",
        stack: error instanceof Error ? error.stack : undefined,
        externalJobId: input.externalJobId,
      },
      providerMetadata: { credentialId: credential.id },
    });
    throw error;
  }
}

export async function pushExternalTmsTranslations(input: {
  organizationId: string;
  projectId: string;
  providerKind: ExternalTmsProviderKind;
  externalJobId: string;
  translations: ExternalTmsApprovedTranslationUpload[];
  pushTranslations: ExternalTmsTranslationPusher;
}): Promise<ExternalTmsTranslationPushResult> {
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
    kind: "push_translations",
    projectId: project.id,
    externalProjectId: project.externalProjectId,
    resourceType: "job_task",
    resourceId: input.externalJobId,
    externalResourceId: input.externalJobId,
    providerMetadata: {
      credentialId: credential.id,
      translationsRequested: input.translations.length,
    },
  });

  const failures: ExternalTmsContentSyncFailure[] = [];

  try {
    const secretMaterial = decryptProviderCredential({
      algorithm: credential.encryptionAlgorithm,
      keyVersion: credential.keyVersion,
      ciphertext: credential.ciphertext,
      iv: credential.iv,
      authTag: credential.authTag,
    });

    const pushResult = await input.pushTranslations({
      organizationId: input.organizationId,
      projectId: project.id,
      providerKind: input.providerKind,
      externalProjectId: project.externalProjectId,
      externalJobId: input.externalJobId,
      credential,
      project,
      secretMaterial,
      translations: input.translations,
    });

    for (const failure of pushResult.failures) {
      failures.push({
        externalStringId: null,
        locale: failure.locale,
        message: failure.message,
      });
    }

    const counts = {
      translationsRequested: input.translations.length,
      translationsUploaded: pushResult.uploaded,
      translationsFailed: pushResult.failed,
      asyncOperations: pushResult.asyncOperations.length,
    };

    const status = pushResult.failed > 0 ? "failed" : "succeeded";
    const finishInput = {
      runId: run.id,
      organizationId: run.organizationId,
      counts,
      providerMetadata: {
        credentialId: credential.id,
        externalJobId: input.externalJobId,
        asyncOperations: pushResult.asyncOperations,
        failures: pushResult.failures,
      },
    };

    if (status === "failed") {
      await failProviderSyncRun({
        ...finishInput,
        errorMessage: "One or more provider translation uploads failed",
        errorDetails: {
          failures: pushResult.failures,
          asyncOperations: pushResult.asyncOperations,
        },
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
      asyncOperations: pushResult.asyncOperations,
    };
  } catch (error) {
    await failProviderSyncRun({
      runId: run.id,
      organizationId: run.organizationId,
      errorMessage: error instanceof Error ? error.message : "provider translation push failed",
      errorDetails: {
        name: error instanceof Error ? error.name : "UnknownError",
        stack: error instanceof Error ? error.stack : undefined,
        externalJobId: input.externalJobId,
      },
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
