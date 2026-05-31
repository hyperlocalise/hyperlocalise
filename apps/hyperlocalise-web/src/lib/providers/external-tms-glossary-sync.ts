import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import type { ProviderSyncRunStatus } from "@/lib/database/types";
import {
  decryptProviderCredential,
  unwrapProviderCredentialCrypto,
} from "@/lib/security/provider-credential-crypto";

import {
  upsertOrganizationExternalTmsGlossary,
  upsertOrganizationExternalTmsGlossaryTerms,
  type ExternalTmsTerminologyResourceType,
} from "./organization-external-tms-glossaries";
import type { ExternalTmsProviderKind } from "./organization-external-tms-provider-credentials";
import {
  completeProviderSyncRun,
  failProviderSyncRun,
  startProviderSyncRun,
} from "./provider-sync-runs";

type ExternalTmsCredential = typeof schema.organizationExternalTmsProviderCredentials.$inferSelect;
type ExternalTmsProject = typeof schema.projects.$inferSelect;

export type ExternalTmsGlossaryTermMetadata = {
  externalKey: string;
  sourceTerm: string;
  targetTerm: string;
  description?: string;
  partOfSpeech?: string;
  status?: string | null;
  forbidden?: boolean | null;
  notes?: string | null;
  metadata?: Record<string, unknown>;
};

export type ExternalTmsGlossaryMetadata = {
  externalGlossaryId: string;
  name: string;
  description?: string;
  sourceLocale: string;
  targetLocale: string;
  externalResourceType?: ExternalTmsTerminologyResourceType;
  localeCoverage?: string[];
  termCount?: number | null;
  externalUrl?: string | null;
  termCapabilities?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  syncErrorMessage?: string | null;
  terms?: ExternalTmsGlossaryTermMetadata[];
};

export type ExternalTmsGlossaryFetcher = (input: {
  organizationId: string;
  projectId: string;
  providerKind: ExternalTmsProviderKind;
  externalProjectId: string;
  credential: ExternalTmsCredential;
  project: ExternalTmsProject;
  secretMaterial: string;
}) => Promise<ExternalTmsGlossaryMetadata[]>;

export type ExternalTmsGlossarySyncFailure = {
  externalGlossaryId: string | null;
  name: string | null;
  message: string;
};

export type ExternalTmsGlossarySyncResult = {
  runId: string;
  status: Extract<ProviderSyncRunStatus, "succeeded" | "failed">;
  providerKind: ExternalTmsProviderKind;
  providerCredentialId: string;
  projectId: string;
  counts: {
    glossariesDiscovered: number;
    glossariesSynced: number;
    glossariesFailed: number;
    termsSynced: number;
  };
  failures: ExternalTmsGlossarySyncFailure[];
};

export async function syncExternalTmsGlossaries(input: {
  organizationId: string;
  projectId: string;
  providerKind: ExternalTmsProviderKind;
  fetchGlossaries: ExternalTmsGlossaryFetcher;
}): Promise<ExternalTmsGlossarySyncResult> {
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
    kind: "glossary_scan",
    projectId: project.id,
    externalProjectId: project.externalProjectId,
    resourceType: "glossary",
    providerMetadata: { credentialId: credential.id },
  });

  const counts: ExternalTmsGlossarySyncResult["counts"] = {
    glossariesDiscovered: 0,
    glossariesSynced: 0,
    glossariesFailed: 0,
    termsSynced: 0,
  };
  const failures: ExternalTmsGlossarySyncFailure[] = [];

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

    const glossaries = await input.fetchGlossaries({
      organizationId: input.organizationId,
      projectId: project.id,
      providerKind: input.providerKind,
      externalProjectId: project.externalProjectId,
      credential,
      project,
      secretMaterial,
    });

    counts.glossariesDiscovered = glossaries.length;

    for (const glossary of glossaries) {
      try {
        if (glossary.syncErrorMessage) {
          counts.glossariesFailed += 1;
          failures.push({
            externalGlossaryId: glossary.externalGlossaryId,
            name: glossary.name,
            message: glossary.syncErrorMessage,
          });
          continue;
        }

        const importedTermCount = glossary.terms?.length ?? 0;
        const termCapabilities =
          glossary.termCapabilities ??
          (importedTermCount === 0 ? { mode: "live_search" } : { mode: "synced_import" });

        const record = await upsertOrganizationExternalTmsGlossary({
          organizationId: input.organizationId,
          providerCredentialId: credential.id,
          providerKind: input.providerKind,
          externalProjectId: project.externalProjectId,
          externalResourceType: glossary.externalResourceType ?? "glossary",
          externalGlossaryId: glossary.externalGlossaryId,
          name: glossary.name,
          description: glossary.description,
          sourceLocale: glossary.sourceLocale,
          targetLocale: glossary.targetLocale,
          localeCoverage: glossary.localeCoverage,
          termCount: glossary.termCount,
          termCapabilities,
          externalUrl: glossary.externalUrl,
          metadata: glossary.metadata,
        });

        await ensureProjectGlossaryAttachment({
          organizationId: input.organizationId,
          projectId: project.id,
          glossaryId: record.id,
        });

        const terms = glossary.terms ?? [];
        if (terms.length > 0) {
          await upsertOrganizationExternalTmsGlossaryTerms(
            terms.map((term) => ({
              glossaryId: record.id,
              externalKey: term.externalKey,
              sourceTerm: term.sourceTerm,
              targetTerm: term.targetTerm,
              description: term.description,
              partOfSpeech: term.partOfSpeech,
              status: term.status,
              forbidden: term.forbidden,
              notes: term.notes,
              metadata: term.metadata,
            })),
          );
          counts.termsSynced += terms.length;
        }

        counts.glossariesSynced += 1;
      } catch (error) {
        counts.glossariesFailed += 1;
        failures.push({
          externalGlossaryId: glossary.externalGlossaryId,
          name: glossary.name,
          message: error instanceof Error ? error.message : "glossary sync failed",
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
        errorMessage: "One or more provider glossaries failed to sync",
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
      errorMessage: error instanceof Error ? error.message : "provider glossary sync failed",
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

async function ensureProjectGlossaryAttachment(input: {
  organizationId: string;
  projectId: string;
  glossaryId: string;
}) {
  await db
    .insert(schema.projectGlossaries)
    .values({
      organizationId: input.organizationId,
      projectId: input.projectId,
      glossaryId: input.glossaryId,
      priority: 0,
    })
    .onConflictDoNothing({
      target: [schema.projectGlossaries.projectId, schema.projectGlossaries.glossaryId],
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
