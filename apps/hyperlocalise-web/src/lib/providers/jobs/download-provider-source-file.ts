import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import {
  inferSupportedTranslationFileFormat,
  type SupportedTranslationFileFormat,
} from "@/lib/translation/file-formats";
import { CrowdinApiClient, CrowdinApiError } from "@/lib/providers/adapters/crowdin/crowdin-api";
import {
  LokaliseApiClient,
  LokaliseApiError,
  LOKALISE_DEFAULT_BUNDLE_STRUCTURE,
} from "@/lib/providers/adapters/lokalise/lokalise-api";
import type {
  ExternalTmsCredential,
  ExternalTmsProviderKind,
} from "@/lib/providers/credentials/organization-external-tms-provider-credentials";
import { normalizeProviderDownloadUrl } from "@/lib/providers/shared/provider-url-safety";
import { resolveExternalTmsSecretMaterialForActor } from "@/lib/providers/shared/tms-provider-content";

type ProviderSourceFileMetadata = {
  filename: string;
  fileFormat: SupportedTranslationFileFormat;
};

export type ResolveProviderSourceFileDownloadResult =
  | ({
      ok: true;
      downloadUrl: string;
    } & ProviderSourceFileMetadata)
  | {
      ok: false;
      code: string;
      message: string;
    };

export type DownloadProviderSourceFileResult =
  | ({
      ok: true;
      content: Buffer;
    } & ProviderSourceFileMetadata)
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

function resolveCrowdinSourceFileMetadata(input: { externalFileId: string; sourcePath: string }):
  | {
      ok: true;
      filename: string;
      fileFormat: SupportedTranslationFileFormat;
    }
  | {
      ok: false;
      code: string;
      message: string;
    } {
  const fileFormat = inferSupportedTranslationFileFormat(input.sourcePath);
  if (!fileFormat) {
    return {
      ok: false,
      code: "unsupported_file_format",
      message: `Source path ${input.sourcePath} is not a supported translation file format`,
    };
  }

  return {
    ok: true,
    filename: input.sourcePath.split("/").pop() ?? `source-${input.externalFileId}`,
    fileFormat,
  };
}

async function resolveCrowdinSourceFileDownload(input: {
  credential: ExternalTmsCredential;
  secretMaterial: string;
  externalProjectId: string;
  externalFileId: string;
  sourcePath: string;
}): Promise<ResolveProviderSourceFileDownloadResult> {
  const metadata = resolveCrowdinSourceFileMetadata({
    externalFileId: input.externalFileId,
    sourcePath: input.sourcePath,
  });
  if (!metadata.ok) {
    return metadata;
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
    const downloadUrl = normalizeProviderDownloadUrl(downloadLink.url);
    if (!downloadUrl) {
      return {
        ok: false,
        code: "provider_file_download_url_invalid",
        message: "Provider file download URL is invalid or unsafe",
      };
    }

    return {
      ok: true,
      downloadUrl,
      filename: metadata.filename,
      fileFormat: metadata.fileFormat,
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

async function downloadCrowdinSourceFile(input: {
  credential: ExternalTmsCredential;
  secretMaterial: string;
  externalProjectId: string;
  externalFileId: string;
  sourcePath: string;
}): Promise<DownloadProviderSourceFileResult> {
  const resolved = await resolveCrowdinSourceFileDownload(input);
  if (!resolved.ok) {
    return resolved;
  }

  const client = new CrowdinApiClient({
    token: input.secretMaterial,
    baseUrl: input.credential.baseUrl ?? undefined,
  });

  try {
    const bytes = await client.downloadUrl(resolved.downloadUrl);
    return {
      ok: true,
      content: Buffer.from(bytes),
      filename: resolved.filename,
      fileFormat: resolved.fileFormat,
    };
  } catch (error) {
    return {
      ok: false,
      code: "provider_file_download_failed",
      message: error instanceof Error ? error.message : "Provider file download failed",
    };
  }
}

function resolveLokaliseSourceFileMetadata(input: { externalFileId: string; sourcePath: string }):
  | {
      ok: true;
      filename: string;
      fileFormat: SupportedTranslationFileFormat;
      filterFilename: string;
    }
  | {
      ok: false;
      code: string;
      message: string;
    } {
  const fileFormat = inferSupportedTranslationFileFormat(input.sourcePath);
  if (!fileFormat) {
    return {
      ok: false,
      code: "unsupported_file_format",
      message: `Source path ${input.sourcePath} is not a supported translation file format`,
    };
  }

  const [, filename] = input.externalFileId.split("::");
  const resolvedFilename = filename?.trim() || input.sourcePath.split("/").pop() || "";
  if (!resolvedFilename) {
    return {
      ok: false,
      code: "invalid_provider_file_id",
      message: "Provider file identifiers are invalid",
    };
  }

  return {
    ok: true,
    filename: resolvedFilename,
    fileFormat,
    filterFilename: resolvedFilename,
  };
}

async function resolveLokaliseSourceFileDownload(input: {
  credential: ExternalTmsCredential;
  secretMaterial: string;
  externalProjectId: string;
  externalFileId: string;
  sourcePath: string;
  sourceLocale?: string | null;
}): Promise<ResolveProviderSourceFileDownloadResult> {
  const metadata = resolveLokaliseSourceFileMetadata({
    externalFileId: input.externalFileId,
    sourcePath: input.sourcePath,
  });
  if (!metadata.ok) {
    return metadata;
  }

  if (!input.externalProjectId.trim()) {
    return {
      ok: false,
      code: "invalid_provider_file_id",
      message: "Provider file identifiers are invalid",
    };
  }

  const client = new LokaliseApiClient({
    token: input.secretMaterial,
    baseUrl: input.credential.baseUrl ?? undefined,
  });

  const sourceLocale = input.sourceLocale?.trim();
  if (!sourceLocale) {
    return {
      ok: false,
      code: "provider_source_locale_missing",
      message: "Source locale is required to download Lokalise source files",
    };
  }

  try {
    const download = await client.requestFileDownload(input.externalProjectId, {
      format: metadata.fileFormat,
      originalFilenames: true,
      bundleStructure: LOKALISE_DEFAULT_BUNDLE_STRUCTURE,
      filterLangs: [sourceLocale],
      filterFilenames: [metadata.filterFilename],
    });
    const downloadUrl = normalizeProviderDownloadUrl(download.bundleUrl);
    if (!downloadUrl) {
      return {
        ok: false,
        code: "provider_file_download_url_invalid",
        message: "Provider file download URL is invalid or unsafe",
      };
    }

    return {
      ok: true,
      downloadUrl,
      filename: metadata.filename,
      fileFormat: metadata.fileFormat,
    };
  } catch (error) {
    if (error instanceof LokaliseApiError && error.status === 401) {
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

async function downloadLokaliseSourceFile(input: {
  credential: ExternalTmsCredential;
  secretMaterial: string;
  externalProjectId: string;
  externalFileId: string;
  sourcePath: string;
  sourceLocale?: string | null;
}): Promise<DownloadProviderSourceFileResult> {
  const resolved = await resolveLokaliseSourceFileDownload(input);
  if (!resolved.ok) {
    return resolved;
  }

  const client = new LokaliseApiClient({
    token: input.secretMaterial,
    baseUrl: input.credential.baseUrl ?? undefined,
  });

  try {
    const bytes = await client.downloadUrl(resolved.downloadUrl);
    return {
      ok: true,
      content: Buffer.from(bytes),
      filename: resolved.filename,
      fileFormat: resolved.fileFormat,
    };
  } catch (error) {
    return {
      ok: false,
      code: "provider_file_download_failed",
      message: error instanceof Error ? error.message : "Provider file download failed",
    };
  }
}

export async function loadProviderCrowdinDownloadContext(input: {
  organizationId: string;
  projectId: string;
  providerKind: ExternalTmsProviderKind;
  actorUserId?: string | null;
}): Promise<
  | {
      ok: true;
      externalProjectId: string;
      secretMaterial: string;
      baseUrl: string | null;
    }
  | {
      ok: false;
      code: string;
      message: string;
    }
> {
  if (input.providerKind !== "crowdin") {
    return {
      ok: false,
      code: "provider_file_download_unsupported",
      message: `File download is not supported for ${input.providerKind} yet`,
    };
  }

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

  return {
    ok: true,
    externalProjectId: context.externalProjectId,
    secretMaterial,
    baseUrl: context.credential.baseUrl ?? null,
  };
}

export async function resolveProviderSourceFileDownload(input: {
  organizationId: string;
  projectId: string;
  providerKind: ExternalTmsProviderKind;
  externalFileId: string;
  sourcePath: string;
  actorUserId?: string | null;
}): Promise<ResolveProviderSourceFileDownloadResult> {
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
    return resolveCrowdinSourceFileDownload({
      credential: context.credential,
      secretMaterial,
      externalProjectId: context.externalProjectId,
      externalFileId: input.externalFileId,
      sourcePath: input.sourcePath,
    });
  }

  if (input.providerKind === "lokalise") {
    const sourceLocaleMatch = input.sourcePath.match(/^locales\/([^/]+)\//);
    return resolveLokaliseSourceFileDownload({
      credential: context.credential,
      secretMaterial,
      externalProjectId: context.externalProjectId,
      externalFileId: input.externalFileId,
      sourcePath: input.sourcePath,
      sourceLocale: sourceLocaleMatch?.[1] ?? null,
    });
  }

  return {
    ok: false,
    code: "provider_file_download_unsupported",
    message: `File download is not supported for ${input.providerKind} yet`,
  };
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

  if (input.providerKind === "lokalise") {
    const sourceLocaleMatch = input.sourcePath.match(/^locales\/([^/]+)\//);
    return downloadLokaliseSourceFile({
      credential: context.credential,
      secretMaterial,
      externalProjectId: context.externalProjectId,
      externalFileId: input.externalFileId,
      sourcePath: input.sourcePath,
      sourceLocale: sourceLocaleMatch?.[1] ?? null,
    });
  }

  return {
    ok: false,
    code: "provider_file_download_unsupported",
    message: `File download is not supported for ${input.providerKind} yet`,
  };
}
