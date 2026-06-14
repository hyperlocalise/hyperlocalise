import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import { inferSupportedFileTranslationFileFormat } from "@/lib/translation/file-formats";
import { CrowdinApiClient, CrowdinApiError } from "@/lib/providers/adapters/crowdin/crowdin-api";
import type {
  ExternalTmsCredential,
  ExternalTmsProviderKind,
} from "@/lib/providers/organization-external-tms-provider-credentials";
import { resolveExternalTmsSecretMaterialForActor } from "@/lib/providers/tms-provider-content";

export type DownloadProviderSourceFileResult =
  | {
      ok: true;
      content: Buffer;
      filename: string;
      fileFormat: NonNullable<ReturnType<typeof inferSupportedFileTranslationFileFormat>>;
    }
  | {
      ok: false;
      code: string;
      message: string;
    };

async function loadProjectCredential(input: {
  organizationId: string;
  projectId: string;
  providerKind: ExternalTmsProviderKind;
}) {
  const [project] = await db
    .select({
      externalProjectId: schema.projects.externalProjectId,
      externalProviderCredentialId: schema.projects.externalProviderCredentialId,
    })
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

  if (!project?.externalProjectId || !project.externalProviderCredentialId) {
    return null;
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
    return null;
  }

  return {
    externalProjectId: project.externalProjectId,
    credential: credential as ExternalTmsCredential,
  };
}

async function downloadCrowdinSourceFile(input: {
  credential: ExternalTmsCredential;
  secretMaterial: string;
  externalProjectId: string;
  externalFileId: string;
  sourcePath: string;
}): Promise<DownloadProviderSourceFileResult> {
  const fileFormat = inferSupportedFileTranslationFileFormat(input.sourcePath);
  if (!fileFormat) {
    return {
      ok: false,
      code: "unsupported_file_format",
      message: `Source path ${input.sourcePath} is not a supported translation file format`,
    };
  }

  const projectId = Number(input.externalProjectId);
  const fileId = Number(input.externalFileId);
  if (Number.isNaN(projectId) || Number.isNaN(fileId)) {
    return {
      ok: false,
      code: "invalid_provider_file_id",
      message: "Provider file identifiers are invalid",
    };
  }

  const client = new CrowdinApiClient({
    token: input.secretMaterial,
    baseUrl: input.credential.baseUrl ?? undefined,
  });

  try {
    const downloadLink = await client.downloadFile(projectId, fileId);
    const bytes = await client.downloadUrl(downloadLink.url);
    const filename = input.sourcePath.split("/").pop() ?? `source-${input.externalFileId}`;

    return {
      ok: true,
      content: Buffer.from(bytes),
      filename,
      fileFormat,
    };
  } catch (error) {
    if (error instanceof CrowdinApiError && error.status === 401) {
      return {
        ok: false,
        code: "provider_auth_invalid",
        message: "Provider credentials are invalid",
      };
    }

    return {
      ok: false,
      code: "provider_file_download_failed",
      message: error instanceof Error ? error.message : "Provider file download failed",
    };
  }
}

export async function downloadProviderSourceFile(input: {
  organizationId: string;
  projectId: string;
  providerKind: ExternalTmsProviderKind;
  externalFileId: string;
  sourcePath: string;
  actorUserId?: string | null;
}): Promise<DownloadProviderSourceFileResult> {
  const context = await loadProjectCredential({
    organizationId: input.organizationId,
    projectId: input.projectId,
    providerKind: input.providerKind,
  });

  if (!context) {
    return {
      ok: false,
      code: "provider_project_unavailable",
      message: "Provider project credentials are unavailable",
    };
  }

  const secretMaterial = await resolveExternalTmsSecretMaterialForActor({
    credential: context.credential,
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
  });

  if (input.providerKind === "crowdin") {
    return downloadCrowdinSourceFile({
      credential: context.credential,
      secretMaterial,
      externalProjectId: context.externalProjectId,
      externalFileId: input.externalFileId,
      sourcePath: input.sourcePath,
    });
  }

  return {
    ok: false,
    code: "provider_file_download_unsupported",
    message: `File download is not supported for ${input.providerKind} yet`,
  };
}
