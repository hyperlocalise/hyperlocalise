import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";

import {
  getCrowdinUserConnection,
  resolveCrowdinUserConnectionSecretMaterial,
} from "./adapters/crowdin/crowdin-user-connections";
import {
  getPhraseUserConnection,
  resolvePhraseUserConnectionSecretMaterial,
} from "./adapters/phrase/phrase-user-connections";
import {
  getLokaliseUserConnection,
  resolveLokaliseUserConnectionSecretMaterial,
} from "./adapters/lokalise/lokalise-user-connections";
import {
  crowdinUsesPerUserAuth,
  OAUTH_AUTH_MODE,
  resolveExternalTmsSecretMaterial,
  type ExternalTmsCredential,
  type ExternalTmsProviderKind,
} from "./organization-external-tms-provider-credentials";
import type {
  ExternalTmsApprovedTranslationUpload,
  ExternalTmsContentPuller,
  ExternalTmsContentSyncFailure,
  ExternalTmsTaskContent,
  ExternalTmsTranslationPusher,
} from "./tms-provider-types";

export type ExternalTmsContentPullResult = {
  runId: string;
  status: "succeeded" | "failed";
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
  status: "succeeded" | "failed";
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
  actorUserId?: string | null;
}): Promise<ExternalTmsContentPullResult> {
  const { project, credential } = await loadExternalTmsProjectContext(input);
  const secretMaterial = await resolveExternalTmsSecretMaterialForActor({
    credential,
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
  });

  const content = await input.pullContent({
    organizationId: input.organizationId,
    projectId: project.id,
    providerKind: input.providerKind,
    externalProjectId: project.externalProjectId!,
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

  return {
    runId: `direct_${randomUUID()}`,
    status: "succeeded",
    providerKind: input.providerKind,
    providerCredentialId: credential.id,
    projectId: project.id,
    content,
    counts: {
      unitsDiscovered: content.units.length,
      translationsDiscovered,
      approvedTranslations,
    },
    failures: [],
  };
}

export async function pushExternalTmsTranslations(input: {
  organizationId: string;
  projectId: string;
  providerKind: ExternalTmsProviderKind;
  externalJobId: string;
  translations: ExternalTmsApprovedTranslationUpload[];
  pushTranslations: ExternalTmsTranslationPusher;
  actorUserId?: string | null;
}): Promise<ExternalTmsTranslationPushResult> {
  const { project, credential } = await loadExternalTmsProjectContext(input);
  const secretMaterial = await resolveExternalTmsSecretMaterialForActor({
    credential,
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
  });

  const pushResult = await input.pushTranslations({
    organizationId: input.organizationId,
    projectId: project.id,
    providerKind: input.providerKind,
    externalProjectId: project.externalProjectId!,
    externalJobId: input.externalJobId,
    credential,
    project,
    secretMaterial,
    translations: input.translations,
  });

  const failures = pushResult.failures.map((failure) => ({
    externalStringId: null,
    locale: failure.locale,
    message: failure.message,
  }));
  const status = pushResult.failed > 0 || pushResult.failures.length > 0 ? "failed" : "succeeded";

  return {
    runId: `direct_${randomUUID()}`,
    status,
    providerKind: input.providerKind,
    providerCredentialId: credential.id,
    projectId: project.id,
    counts: {
      translationsRequested: input.translations.length,
      translationsUploaded: pushResult.uploaded,
      translationsFailed: pushResult.failed,
      asyncOperations: pushResult.asyncOperations.length,
    },
    failures,
    asyncOperations: pushResult.asyncOperations,
  };
}

export async function resolveExternalTmsSecretMaterialForActor(input: {
  credential: ExternalTmsCredential;
  organizationId: string;
  actorUserId?: string | null;
}) {
  if (
    !(
      input.credential.providerKind === "crowdin" &&
      crowdinUsesPerUserAuth(input.credential.authMode)
    ) &&
    !(
      input.credential.providerKind === "phrase" && input.credential.authMode === OAUTH_AUTH_MODE
    ) &&
    !(input.credential.providerKind === "lokalise" && input.credential.authMode === OAUTH_AUTH_MODE)
  ) {
    return resolveExternalTmsSecretMaterial({ credential: input.credential });
  }

  if (!input.actorUserId) {
    throw new Error(`${input.credential.providerKind}_user_connection_required`);
  }

  if (input.credential.providerKind === "phrase") {
    const connection = await getPhraseUserConnection({
      organizationId: input.organizationId,
      userId: input.actorUserId,
    });
    if (!connection) {
      throw new Error("phrase_user_connection_required");
    }

    return resolvePhraseUserConnectionSecretMaterial({
      connection,
      baseUrl: input.credential.baseUrl,
    });
  }

  if (input.credential.providerKind === "lokalise") {
    const connection = await getLokaliseUserConnection({
      organizationId: input.organizationId,
      userId: input.actorUserId,
    });
    if (!connection) {
      throw new Error("lokalise_user_connection_required");
    }

    return resolveLokaliseUserConnectionSecretMaterial({ connection });
  }

  const connection = await getCrowdinUserConnection({
    organizationId: input.organizationId,
    userId: input.actorUserId,
  });
  if (!connection) {
    throw new Error("crowdin_user_connection_required");
  }

  return resolveCrowdinUserConnectionSecretMaterial({
    connection,
    authMode: input.credential.authMode ?? OAUTH_AUTH_MODE,
  });
}

async function loadExternalTmsProjectContext(input: {
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

  if (!project?.externalProjectId) {
    throw new Error("external_tms_project_not_found");
  }
  if (!project.externalProviderCredentialId) {
    throw new Error("provider_credential_not_found");
  }

  const [credential] = await db
    .select()
    .from(schema.organizationExternalTmsProviderCredentials)
    .where(
      and(
        eq(schema.organizationExternalTmsProviderCredentials.organizationId, input.organizationId),
        eq(schema.organizationExternalTmsProviderCredentials.providerKind, input.providerKind),
        eq(
          schema.organizationExternalTmsProviderCredentials.id,
          project.externalProviderCredentialId,
        ),
      ),
    )
    .limit(1);

  if (!credential) {
    throw new Error("provider_credential_not_found");
  }

  return { project, credential };
}
