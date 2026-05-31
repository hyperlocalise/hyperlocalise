import { and, desc, eq, inArray } from "drizzle-orm";

import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";
import type {
  ProjectFileContent,
  ProjectFileDetailResponse,
  ProjectFileJobRecord,
  ProjectFileProviderJobRecord,
  ProjectFileVersionRecord,
} from "@/api/routes/project/project.schema";
import { db, schema } from "@/lib/database";
import type { FileStorageAdapter } from "@/lib/file-storage";
import { normalizeSourcePath } from "@/lib/file-storage/records";
import { listExternalTmsFileVersionsForFile } from "@/lib/providers/sync/organization-external-tms-file-versions";
import { resolveProviderJobsForFile } from "@/lib/providers/job-provider-source-files";
import { bufferFromStream } from "@/lib/streams";
import { sanitizeExternalUrl } from "@/lib/safe-external-url";
import { inferSupportedFileTranslationFileFormat } from "@/lib/translation/file-formats";

const maxInlineTextBytes = 512 * 1024;
const fileDetailStorageReadConcurrency = 5;

type PublicJobOutputFile = {
  fileId: string;
  locale: string;
  filename: string;
};

function hasValue(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isPublicJobOutputFile(value: unknown): value is PublicJobOutputFile {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return hasValue(candidate.fileId) && hasValue(candidate.locale) && hasValue(candidate.filename);
}

function fileJobOutputFiles(input: { outcomeKind: string | null; outcomePayload: unknown }) {
  if (input.outcomeKind !== "file_result") {
    return [];
  }

  if (!input.outcomePayload || typeof input.outcomePayload !== "object") {
    return [];
  }

  const outputFiles = (input.outcomePayload as Record<string, unknown>).outputFiles;
  if (!Array.isArray(outputFiles) || !outputFiles.every(isPublicJobOutputFile)) {
    return [];
  }

  return outputFiles.map((outputFile) => ({
    fileId: outputFile.fileId,
    locale: outputFile.locale,
    filename: outputFile.filename,
  }));
}

function fileJobLocales(inputPayload: unknown) {
  if (!inputPayload || typeof inputPayload !== "object") {
    return [];
  }

  const targetLocales = (inputPayload as Record<string, unknown>).targetLocales;
  if (!Array.isArray(targetLocales)) {
    return [];
  }

  return targetLocales.filter((locale): locale is string => hasValue(locale));
}

function sourceLocale(inputPayload: unknown) {
  if (!inputPayload || typeof inputPayload !== "object") {
    return null;
  }

  const value = (inputPayload as Record<string, unknown>).sourceLocale;
  return hasValue(value) ? value : null;
}

export async function inlineProjectFileTextContent(input: {
  adapter: FileStorageAdapter;
  file: { storageKey: string; filename: string; byteSize: number };
}): Promise<ProjectFileContent | null> {
  if (input.file.byteSize > maxInlineTextBytes) {
    return null;
  }

  if (!inferSupportedFileTranslationFileFormat(input.file.filename)) {
    return null;
  }

  const object = await input.adapter.get({ keyOrUrl: input.file.storageKey });
  if (!object) {
    return null;
  }

  const buffer = await bufferFromStream(object.body);
  return {
    text: new TextDecoder("utf-8", { fatal: false }).decode(buffer),
  };
}

function toProviderRecord(file: typeof schema.externalTmsFiles.$inferSelect) {
  return {
    kind: file.providerKind,
    resourceType: file.resourceType,
    externalProjectId: file.externalProjectId,
    externalResourceId: file.externalResourceId,
    externalUrl: sanitizeExternalUrl(file.externalUrl),
    syncState: file.syncState,
    sourceLocale: file.sourceLocale,
    targetLocales: file.targetLocales,
    localeReadiness: file.localeReadiness as Record<string, unknown>,
    revision: file.revision,
    format: file.format,
    lastSyncedAt: file.lastSyncedAt?.toISOString() ?? null,
  };
}

function groupJobsByLocale<T extends { targetLocales: string[] }>(
  jobs: T[],
  localeForJob: (job: T) => string[],
) {
  const jobsByLocaleMap = new Map<string, T[]>();

  for (const job of jobs) {
    const locales = localeForJob(job);
    for (const locale of locales.length > 0 ? locales : ["unassigned"]) {
      const group = jobsByLocaleMap.get(locale) ?? [];
      if (!group.some((existing) => existing === job)) {
        group.push(job);
      }
      jobsByLocaleMap.set(locale, group);
    }
  }

  return Array.from(jobsByLocaleMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([locale, groupJobs]) => ({ locale, jobs: groupJobs }));
}

export async function getProjectFileDetail(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  organizationSlug: string;
  adapter: FileStorageAdapter;
}): Promise<ProjectFileDetailResponse["file"] | null> {
  const sourcePath = normalizeSourcePath(input.sourcePath);

  const [providerFile] = await db
    .select()
    .from(schema.externalTmsFiles)
    .where(
      and(
        eq(schema.externalTmsFiles.projectId, input.projectId),
        eq(schema.externalTmsFiles.organizationId, input.organizationId),
        eq(schema.externalTmsFiles.sourcePath, sourcePath),
      ),
    )
    .limit(1);

  const repositoryVersions = await db
    .select({
      id: schema.repositorySourceFileVersions.id,
      sourcePath: schema.repositorySourceFileVersions.sourcePath,
      sourceHash: schema.repositorySourceFileVersions.sourceHash,
      commitSha: schema.repositorySourceFileVersions.commitSha,
      workflowRunId: schema.repositorySourceFileVersions.workflowRunId,
      uploadedAt: schema.repositorySourceFileVersions.createdAt,
      storedFileId: schema.repositorySourceFileVersions.storedFileId,
      filename: schema.storedFiles.filename,
      contentType: schema.storedFiles.contentType,
      byteSize: schema.storedFiles.byteSize,
      sha256: schema.storedFiles.sha256,
      storageKey: schema.storedFiles.storageKey,
      metadata: schema.storedFiles.metadata,
    })
    .from(schema.repositorySourceFileVersions)
    .innerJoin(
      schema.storedFiles,
      eq(schema.storedFiles.id, schema.repositorySourceFileVersions.storedFileId),
    )
    .where(
      and(
        eq(schema.repositorySourceFileVersions.projectId, input.projectId),
        eq(schema.repositorySourceFileVersions.organizationId, input.organizationId),
        eq(schema.repositorySourceFileVersions.sourcePath, sourcePath),
        eq(schema.storedFiles.role, "source"),
        eq(schema.storedFiles.sourceKind, "repository_file"),
      ),
    )
    .orderBy(
      desc(schema.repositorySourceFileVersions.createdAt),
      desc(schema.repositorySourceFileVersions.id),
    )
    .limit(50);

  if (repositoryVersions.length === 0 && !providerFile) {
    return null;
  }

  const providerVersionRows = providerFile
    ? await listExternalTmsFileVersionsForFile({
        organizationId: input.organizationId,
        projectId: input.projectId,
        externalTmsFileId: providerFile.id,
      })
    : [];

  const providerStoredFileIds = [
    ...(providerFile?.storedFileId ? [providerFile.storedFileId] : []),
    ...providerVersionRows
      .map((version) => version.storedFileId)
      .filter((storedFileId): storedFileId is string => Boolean(storedFileId)),
  ];

  const providerStoredFiles =
    providerStoredFileIds.length > 0
      ? await db
          .select({
            id: schema.storedFiles.id,
            filename: schema.storedFiles.filename,
            contentType: schema.storedFiles.contentType,
            byteSize: schema.storedFiles.byteSize,
            sha256: schema.storedFiles.sha256,
            storageKey: schema.storedFiles.storageKey,
          })
          .from(schema.storedFiles)
          .where(
            and(
              eq(schema.storedFiles.organizationId, input.organizationId),
              eq(schema.storedFiles.projectId, input.projectId),
              inArray(schema.storedFiles.id, providerStoredFileIds),
            ),
          )
      : [];

  const providerStoredFileById = new Map(providerStoredFiles.map((file) => [file.id, file]));

  const repositoryVersionRecords: ProjectFileVersionRecord[] = await mapWithConcurrency(
    repositoryVersions,
    fileDetailStorageReadConcurrency,
    async (version) => ({
      id: version.id,
      origin: "repository" as const,
      sourcePath: version.sourcePath,
      sourceHash: version.sourceHash,
      revision: null,
      commitSha: version.commitSha,
      workflowRunId: version.workflowRunId,
      uploadedAt: version.uploadedAt.toISOString(),
      storedFileId: version.storedFileId,
      filename: version.filename,
      contentType: version.contentType,
      byteSize: version.byteSize,
      sha256: version.sha256,
      metadata: version.metadata as Record<string, unknown>,
      content: await inlineProjectFileTextContent({ adapter: input.adapter, file: version }),
    }),
  );

  const providerHistoryRecords: ProjectFileVersionRecord[] = await mapWithConcurrency(
    providerVersionRows,
    fileDetailStorageReadConcurrency,
    async (version) => {
      const storedFile = version.storedFileId
        ? providerStoredFileById.get(version.storedFileId)
        : undefined;

      return {
        id: version.id,
        origin: "provider" as const,
        sourcePath: version.sourcePath,
        sourceHash: version.sourceHash,
        revision: version.revision,
        commitSha: null,
        workflowRunId: null,
        uploadedAt: version.capturedAt.toISOString(),
        storedFileId: version.storedFileId,
        filename:
          storedFile?.filename ??
          providerFile?.displayName ??
          sourcePath.split("/").at(-1) ??
          sourcePath,
        contentType: storedFile?.contentType ?? null,
        byteSize: storedFile?.byteSize ?? null,
        sha256: storedFile?.sha256 ?? null,
        metadata: {},
        content: storedFile
          ? await inlineProjectFileTextContent({ adapter: input.adapter, file: storedFile })
          : null,
      };
    },
  );

  const currentProviderStoredFile = providerFile?.storedFileId
    ? providerStoredFileById.get(providerFile.storedFileId)
    : undefined;

  function versionIdentity(version: Pick<ProjectFileVersionRecord, "revision" | "sourceHash">) {
    return `${version.revision ?? ""}:${version.sourceHash ?? ""}`;
  }

  const currentProviderVersion: ProjectFileVersionRecord | null = providerFile
    ? {
        id: `provider-current:${providerFile.id}`,
        origin: "provider",
        sourcePath: providerFile.sourcePath,
        sourceHash: providerFile.sourceHash,
        revision: providerFile.revision,
        commitSha: null,
        workflowRunId: null,
        uploadedAt: (providerFile.lastSyncedAt ?? providerFile.updatedAt).toISOString(),
        storedFileId: providerFile.storedFileId,
        filename:
          currentProviderStoredFile?.filename ??
          providerFile.displayName ??
          sourcePath.split("/").at(-1) ??
          sourcePath,
        contentType: currentProviderStoredFile?.contentType ?? null,
        byteSize: currentProviderStoredFile?.byteSize ?? null,
        sha256: currentProviderStoredFile?.sha256 ?? null,
        metadata: providerFile.providerPayload as Record<string, unknown>,
        content: currentProviderStoredFile
          ? await inlineProjectFileTextContent({
              adapter: input.adapter,
              file: currentProviderStoredFile,
            })
          : null,
      }
    : null;

  const providerVersions = [
    ...(currentProviderVersion ? [currentProviderVersion] : []),
    ...providerHistoryRecords.filter(
      (version) =>
        !currentProviderVersion ||
        versionIdentity(version) !== versionIdentity(currentProviderVersion),
    ),
  ];

  const versions = [...repositoryVersionRecords, ...providerVersions].sort(
    (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime(),
  );

  const versionIds = repositoryVersions.map((version) => version.id);
  const jobRows =
    versionIds.length > 0
      ? await db
          .select({
            sourceFileVersionId: schema.translationJobDetails.sourceFileVersionId,
            id: schema.jobs.id,
            status: schema.jobs.status,
            createdAt: schema.jobs.createdAt,
            completedAt: schema.jobs.completedAt,
            workflowRunId: schema.jobs.workflowRunId,
            inputPayload: schema.jobs.inputPayload,
            outcomePayload: schema.jobs.outcomePayload,
            outcomeKind: schema.translationJobDetails.outcomeKind,
          })
          .from(schema.jobs)
          .innerJoin(
            schema.translationJobDetails,
            eq(schema.translationJobDetails.jobId, schema.jobs.id),
          )
          .where(
            and(
              eq(schema.jobs.projectId, input.projectId),
              eq(schema.jobs.organizationId, input.organizationId),
              eq(schema.translationJobDetails.type, "file"),
              inArray(schema.translationJobDetails.sourceFileVersionId, versionIds),
            ),
          )
          .orderBy(desc(schema.jobs.createdAt), desc(schema.jobs.id))
          .limit(100)
      : [];

  const outputFileIds = Array.from(
    new Set(jobRows.flatMap((job) => fileJobOutputFiles(job).map((file) => file.fileId))),
  );
  const outputFiles =
    outputFileIds.length > 0
      ? await db
          .select({
            id: schema.storedFiles.id,
            filename: schema.storedFiles.filename,
            contentType: schema.storedFiles.contentType,
            byteSize: schema.storedFiles.byteSize,
            sha256: schema.storedFiles.sha256,
            storageKey: schema.storedFiles.storageKey,
          })
          .from(schema.storedFiles)
          .where(
            and(
              eq(schema.storedFiles.organizationId, input.organizationId),
              eq(schema.storedFiles.projectId, input.projectId),
              eq(schema.storedFiles.role, "output"),
              inArray(schema.storedFiles.id, outputFileIds),
            ),
          )
      : [];
  const outputFileById = new Map(outputFiles.map((file) => [file.id, file]));

  const jobRecords: ProjectFileJobRecord[] = await mapWithConcurrency(
    jobRows,
    fileDetailStorageReadConcurrency,
    async (job) => {
      const outputs = await mapWithConcurrency(
        fileJobOutputFiles(job),
        fileDetailStorageReadConcurrency,
        async (output) => {
          const file = outputFileById.get(output.fileId);
          return {
            fileId: output.fileId,
            locale: output.locale,
            filename: file?.filename ?? output.filename,
            byteSize: file?.byteSize ?? null,
            sha256: file?.sha256 ?? null,
            contentType: file?.contentType ?? null,
            downloadPath: `/api/orgs/${input.organizationSlug}/files/${output.fileId}`,
            content: file
              ? await inlineProjectFileTextContent({ adapter: input.adapter, file })
              : null,
          };
        },
      );

      return {
        id: job.id,
        sourceFileVersionId: job.sourceFileVersionId ?? "",
        status: job.status,
        createdAt: job.createdAt.toISOString(),
        completedAt: job.completedAt?.toISOString() ?? null,
        workflowRunId: job.workflowRunId,
        sourceLocale: sourceLocale(job.inputPayload),
        targetLocales: fileJobLocales(job.inputPayload),
        outputs,
      };
    },
  );

  const jobsByLocale = groupJobsByLocale(jobRecords, (job) => {
    const locales =
      job.outputs.length > 0 ? job.outputs.map((output) => output.locale) : job.targetLocales;
    return locales;
  });

  const providerJobRows = providerFile
    ? await resolveProviderJobsForFile({
        organizationId: input.organizationId,
        projectId: input.projectId,
        providerKind: providerFile.providerKind,
        externalResourceId: providerFile.externalResourceId,
      })
    : [];

  const providerJobRecords: ProjectFileProviderJobRecord[] = providerJobRows.map((job) => ({
    id: job.id,
    externalJobId: job.externalJobId,
    externalTaskId: job.externalTaskId,
    providerKind: job.providerKind,
    title: job.title,
    externalStatus: job.externalStatus,
    syncState: job.syncState,
    targetLocales: job.targetLocales,
    externalUrl: sanitizeExternalUrl(job.externalUrl),
    linkedJobId: job.linkedJobId,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  }));

  const providerJobsByLocale = groupJobsByLocale(providerJobRecords, (job) => job.targetLocales);

  return {
    sourcePath,
    filename:
      repositoryVersionRecords[0]?.filename ??
      currentProviderVersion?.filename ??
      providerFile?.displayName ??
      sourcePath.split("/").at(-1) ??
      sourcePath,
    provider: providerFile ? toProviderRecord(providerFile) : null,
    versions,
    jobsByLocale,
    providerJobsByLocale,
  };
}
