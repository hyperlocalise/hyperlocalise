import { and, desc, eq, ilike, inArray, sql } from "drizzle-orm";

import type {
  ProjectFileContent,
  ProjectFileDetailResponse,
  ProjectFileJobRecord,
  ProjectFileRecord,
  ProjectFileVersionRecord,
  ProjectFilesQuery,
  WorkspaceFileRecord,
} from "@/api/routes/project/project.schema";
import { db, schema } from "@/lib/database";
import type { FileStorageAdapter } from "@/lib/file-storage";
import { normalizeSourcePath } from "@/lib/file-storage/records";
import { normalizeProjectFileContent } from "@/lib/projects/files/project-file-content";
import {
  buildJobsByLocaleFromRecords,
  buildNativeFileLocaleReadiness,
} from "@/lib/projects/files/native-locale-readiness";
import { ProjectServiceBase } from "@/lib/projects/project-service-base";
import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";
import { bufferFromStream } from "@/lib/primitives/streams";
import { listTmsProviderLiveFilesForProject } from "@/lib/providers/tms-provider-live";
import type { ExternalTmsFileKeyMetadata } from "@/lib/providers/tms-provider-types";
import { inferSupportedFileTranslationFileFormat } from "@/lib/translation/file-formats";

export type ProjectFileListContext = {
  projectId: string;
  projectName: string;
};

type ProjectFileJobStatus = NonNullable<ProjectFileRecord["latestJob"]>["status"];
type ProjectFileJobType = NonNullable<ProjectFileRecord["latestJob"]>["type"];

type ProjectFileFilterQuery = Pick<
  ProjectFilesQuery,
  "origin" | "resourceType" | "providerKind" | "locale" | "syncState" | "search"
>;

const maxInlineTextBytes = 512 * 1024;
const fileDetailStorageReadConcurrency = 5;

function matchesLocale(file: ProjectFileRecord, locale: string) {
  if (file.provider?.sourceLocale === locale) {
    return true;
  }
  return file.provider?.targetLocales.includes(locale) ?? false;
}

function matchesOrigin(
  file: ProjectFileRecord,
  origin: NonNullable<ProjectFileFilterQuery["origin"]>,
) {
  if (origin === "all") {
    return true;
  }
  if (origin === "repository") {
    return file.origin === "repository" || file.origin === "combined";
  }
  return file.origin === "provider" || file.origin === "combined";
}

export function filterProjectFiles(files: ProjectFileRecord[], query: ProjectFileFilterQuery) {
  const search = query.search?.trim().toLowerCase();

  return files.filter((file) => {
    if (query.origin && !matchesOrigin(file, query.origin)) {
      return false;
    }

    if (query.resourceType && query.resourceType !== "all") {
      const resourceType = file.provider?.resourceType ?? "file";
      if (resourceType !== query.resourceType) {
        return false;
      }
    }

    if (query.providerKind && query.providerKind !== "all") {
      if (file.provider?.kind !== query.providerKind) {
        return false;
      }
    }

    if (query.syncState && query.syncState !== "all") {
      if ((file.provider?.syncState ?? "repository") !== query.syncState) {
        return false;
      }
    }

    if (query.locale && query.locale !== "all" && !matchesLocale(file, query.locale)) {
      return false;
    }

    if (search) {
      const haystack = [
        file.sourcePath,
        file.filename,
        file.provider?.kind,
        file.provider?.resourceType,
        file.provider?.externalResourceId,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (!haystack.includes(search)) {
        return false;
      }
    }

    return true;
  });
}

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

export class ProjectFileService extends ProjectServiceBase {
  constructor(database: typeof db = db) {
    super(database, "projects.files");
  }

  async listFiltered(input: {
    organizationId: string;
    projectId: string;
    query: ProjectFilesQuery;
    resourceTypes?: ExternalTmsFileKeyMetadata["resourceType"][];
  }) {
    const fetchLimit = input.query.limit;
    const mergedFiles = await this.listForProject({
      organizationId: input.organizationId,
      projectId: input.projectId,
      providerFetchLimit: fetchLimit,
      repositoryFetchLimit: fetchLimit,
      providerFilters: input.query,
      resourceTypes: input.resourceTypes,
    });

    const filtered = filterProjectFiles(mergedFiles, input.query).slice(0, input.query.limit);

    this.log.debug(
      {
        organizationId: input.organizationId,
        projectId: input.projectId,
        mergedCount: mergedFiles.length,
        returnedCount: filtered.length,
      },
      "listed filtered project files",
    );

    return filtered;
  }

  async listForProject(input: {
    organizationId: string;
    projectId: string;
    providerFetchLimit?: number;
    repositoryFetchLimit?: number;
    providerFilters?: ProjectFileFilterQuery;
    resourceTypes?: ExternalTmsFileKeyMetadata["resourceType"][];
  }) {
    this.log.debug(
      {
        organizationId: input.organizationId,
        projectId: input.projectId,
      },
      "listing project files for project",
    );

    // Load both sources so repository/provider rows can merge into combined entries before origin filtering.
    const shouldLoadRepositoryFiles = true;
    const shouldLoadProviderFiles = true;
    const repositorySearch = input.providerFilters?.search?.trim();

    const versionsSubquery = this.database
      .select({
        versionId: schema.repositorySourceFileVersions.id,
        sourcePath: schema.repositorySourceFileVersions.sourcePath,
        sourceHash: schema.repositorySourceFileVersions.sourceHash,
        commitSha: schema.repositorySourceFileVersions.commitSha,
        workflowRunId: schema.repositorySourceFileVersions.workflowRunId,
        uploadedAt: schema.repositorySourceFileVersions.createdAt,
        storedFileId: schema.repositorySourceFileVersions.storedFileId,
        metadata: schema.storedFiles.metadata,
        filename: schema.storedFiles.filename,
        byteSize: schema.storedFiles.byteSize,
        rowNumber:
          sql<number>`ROW_NUMBER() OVER (PARTITION BY ${schema.repositorySourceFileVersions.sourcePath} ORDER BY ${schema.repositorySourceFileVersions.createdAt} DESC)`.as(
            "rn",
          ),
      })
      .from(schema.repositorySourceFileVersions)
      .innerJoin(
        schema.storedFiles,
        eq(schema.storedFiles.id, schema.repositorySourceFileVersions.storedFileId),
      )
      .where(
        and(
          eq(schema.storedFiles.projectId, input.projectId),
          eq(schema.storedFiles.role, "source"),
          eq(schema.storedFiles.sourceKind, "repository_file"),
          eq(schema.storedFiles.organizationId, input.organizationId),
          ...(repositorySearch
            ? [ilike(schema.repositorySourceFileVersions.sourcePath, `%${repositorySearch}%`)]
            : []),
        ),
      )
      .as("versions_sq");

    const versionsBaseQuery = this.database
      .select({
        versionId: versionsSubquery.versionId,
        sourcePath: versionsSubquery.sourcePath,
        sourceHash: versionsSubquery.sourceHash,
        commitSha: versionsSubquery.commitSha,
        workflowRunId: versionsSubquery.workflowRunId,
        uploadedAt: versionsSubquery.uploadedAt,
        storedFileId: versionsSubquery.storedFileId,
        metadata: versionsSubquery.metadata,
        filename: versionsSubquery.filename,
        byteSize: versionsSubquery.byteSize,
      })
      .from(versionsSubquery)
      .where(eq(versionsSubquery.rowNumber, 1))
      .orderBy(versionsSubquery.sourcePath);

    const versions = shouldLoadRepositoryFiles
      ? input.repositoryFetchLimit != null
        ? await versionsBaseQuery.limit(input.repositoryFetchLimit)
        : await versionsBaseQuery
      : [];

    const versionIds = versions.map((v) => v.versionId);

    const [projectLocales] = await this.database
      .select({
        targetLocales: schema.projects.targetLocales,
      })
      .from(schema.projects)
      .where(
        and(
          eq(schema.projects.id, input.projectId),
          eq(schema.projects.organizationId, input.organizationId),
        ),
      )
      .limit(1);

    const projectTargetLocales = Array.isArray(projectLocales?.targetLocales)
      ? projectLocales.targetLocales.filter(
          (locale): locale is string => typeof locale === "string",
        )
      : [];

    const [project] = shouldLoadProviderFiles
      ? await this.database
          .select({
            externalProjectId: schema.projects.externalProjectId,
          })
          .from(schema.projects)
          .where(
            and(
              eq(schema.projects.id, input.projectId),
              eq(schema.projects.organizationId, input.organizationId),
              eq(schema.projects.source, "external_tms"),
            ),
          )
          .limit(1)
      : [];
    const providerFiles =
      shouldLoadProviderFiles && project?.externalProjectId
        ? (
            await listTmsProviderLiveFilesForProject(
              input.organizationId,
              project.externalProjectId,
              {
                limit: input.providerFetchLimit,
              },
            )
          ).filter((file) =>
            input.resourceTypes?.length
              ? input.resourceTypes.includes(file.provider.resourceType)
              : true,
          )
        : [];

    const latestJobs = new Map<
      string,
      {
        jobId: string;
        jobStatus: string;
        jobCreatedAt: Date;
        jobType: string;
      }
    >();

    if (versionIds.length > 0) {
      const jobsSubquery = this.database
        .select({
          versionId: schema.translationJobDetails.sourceFileVersionId,
          jobId: schema.jobs.id,
          jobStatus: schema.jobs.status,
          jobCreatedAt: schema.jobs.createdAt,
          jobType: schema.translationJobDetails.type,
          rowNumber:
            sql<number>`ROW_NUMBER() OVER (PARTITION BY ${schema.translationJobDetails.sourceFileVersionId} ORDER BY ${schema.jobs.createdAt} DESC)`.as(
              "rn",
            ),
        })
        .from(schema.jobs)
        .innerJoin(
          schema.translationJobDetails,
          eq(schema.translationJobDetails.jobId, schema.jobs.id),
        )
        .where(
          and(
            eq(schema.jobs.projectId, input.projectId),
            inArray(schema.translationJobDetails.sourceFileVersionId, versionIds),
          ),
        )
        .as("jobs_sq");

      const jobs = await this.database
        .select({
          versionId: jobsSubquery.versionId,
          jobId: jobsSubquery.jobId,
          jobStatus: jobsSubquery.jobStatus,
          jobCreatedAt: jobsSubquery.jobCreatedAt,
          jobType: jobsSubquery.jobType,
        })
        .from(jobsSubquery)
        .where(eq(jobsSubquery.rowNumber, 1));

      for (const job of jobs) {
        if (job.versionId) {
          latestJobs.set(job.versionId, job);
        }
      }
    }

    const jobsByVersionId = new Map<
      string,
      Array<{ status: string; createdAt: Date; inputPayload: unknown }>
    >();

    if (versionIds.length > 0) {
      const versionJobs = await this.database
        .select({
          versionId: schema.translationJobDetails.sourceFileVersionId,
          status: schema.jobs.status,
          createdAt: schema.jobs.createdAt,
          inputPayload: schema.jobs.inputPayload,
        })
        .from(schema.jobs)
        .innerJoin(
          schema.translationJobDetails,
          eq(schema.translationJobDetails.jobId, schema.jobs.id),
        )
        .where(
          and(
            eq(schema.jobs.projectId, input.projectId),
            inArray(schema.translationJobDetails.sourceFileVersionId, versionIds),
          ),
        )
        .orderBy(desc(schema.jobs.createdAt));

      for (const job of versionJobs) {
        if (!job.versionId) {
          continue;
        }

        const existing = jobsByVersionId.get(job.versionId) ?? [];
        existing.push({
          status: job.status,
          createdAt: job.createdAt,
          inputPayload: job.inputPayload,
        });
        jobsByVersionId.set(job.versionId, existing);
      }
    }

    const nativeFiles: ProjectFileRecord[] = versions.map((v) => {
      const job = latestJobs.get(v.versionId);
      const localeReadiness =
        projectTargetLocales.length > 0
          ? buildNativeFileLocaleReadiness({
              targetLocales: projectTargetLocales,
              jobsByLocale: buildJobsByLocaleFromRecords(jobsByVersionId.get(v.versionId) ?? []),
            })
          : undefined;

      return {
        origin: "repository" as const,
        sourcePath: v.sourcePath,
        sourceHash: v.sourceHash,
        commitSha: v.commitSha,
        workflowRunId: v.workflowRunId,
        uploadedAt: v.uploadedAt.toISOString(),
        storedFileId: v.storedFileId,
        metadata: v.metadata as Record<string, unknown>,
        filename: v.filename,
        byteSize: v.byteSize,
        provider: null,
        localeReadiness,
        latestJob: job
          ? {
              id: job.jobId,
              status: job.jobStatus as ProjectFileJobStatus,
              createdAt: job.jobCreatedAt.toISOString(),
              type: job.jobType as ProjectFileJobType,
            }
          : null,
      };
    });

    const nativeFileBySourcePath = new Map(nativeFiles.map((file) => [file.sourcePath, file]));
    const combinedSourcePaths = new Set<string>();
    const providerBackedFiles: ProjectFileRecord[] = providerFiles.map((file) => {
      const linkedNativeFile = nativeFileBySourcePath.get(file.sourcePath);

      if (linkedNativeFile) {
        combinedSourcePaths.add(linkedNativeFile.sourcePath);
        return {
          ...linkedNativeFile,
          origin: "combined" as const,
          provider: file.provider,
        };
      }

      return file;
    });

    const files = [
      ...nativeFiles.filter((file) => !combinedSourcePaths.has(file.sourcePath)),
      ...providerBackedFiles,
    ].sort((a, b) => a.sourcePath.localeCompare(b.sourcePath));

    this.log.debug(
      {
        organizationId: input.organizationId,
        projectId: input.projectId,
        repositoryCount: nativeFiles.length,
        providerCount: providerFiles.length,
        totalCount: files.length,
      },
      "listed project files for project",
    );

    return files;
  }

  async listWorkspace(input: {
    organizationId: string;
    projects: ProjectFileListContext[];
    query: ProjectFilesQuery;
  }) {
    this.log.debug(
      {
        organizationId: input.organizationId,
        projectCount: input.projects.length,
      },
      "listing workspace files",
    );

    const resourceTypes =
      input.query.resourceType && input.query.resourceType !== "all"
        ? ([input.query.resourceType] as ExternalTmsFileKeyMetadata["resourceType"][])
        : undefined;

    const projectIds =
      input.query.projectId && input.query.projectId !== "all"
        ? input.projects.filter((project) => project.projectId === input.query.projectId)
        : input.projects;

    const sortedProjects = projectIds.toSorted((a, b) =>
      a.projectName.localeCompare(b.projectName),
    );
    const collected: WorkspaceFileRecord[] = [];

    for (const project of sortedProjects) {
      if (collected.length >= input.query.limit) {
        break;
      }

      const remaining = input.query.limit - collected.length;
      const perProjectFetchLimit = Math.max(remaining + 5, input.query.limit);

      const files = await this.listForProject({
        organizationId: input.organizationId,
        projectId: project.projectId,
        providerFetchLimit: perProjectFetchLimit,
        repositoryFetchLimit: perProjectFetchLimit,
        providerFilters: input.query,
        resourceTypes,
      });

      const filtered = filterProjectFiles(files, input.query);

      collected.push(
        ...filtered.slice(0, remaining).map(
          (file): WorkspaceFileRecord => ({
            ...file,
            projectId: project.projectId,
            projectName: project.projectName,
          }),
        ),
      );
    }

    const result = collected.sort((a, b) => {
      const projectCompare = a.projectName.localeCompare(b.projectName);
      if (projectCompare !== 0) {
        return projectCompare;
      }
      return a.sourcePath.localeCompare(b.sourcePath);
    });

    this.log.debug(
      {
        organizationId: input.organizationId,
        returnedCount: result.length,
      },
      "listed workspace files",
    );

    return result;
  }

  async inlineTextContent(input: {
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
    const text = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
    return normalizeProjectFileContent({ text });
  }

  async getDetail(input: {
    organizationId: string;
    projectId: string;
    sourcePath: string;
    organizationSlug: string;
    adapter: FileStorageAdapter;
  }): Promise<ProjectFileDetailResponse["file"] | null> {
    const sourcePath = normalizeSourcePath(input.sourcePath);

    const repositoryVersions = await this.database
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

    if (repositoryVersions.length === 0) {
      return null;
    }

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
        content: await this.inlineTextContent({ adapter: input.adapter, file: version }),
      }),
    );

    const versions = repositoryVersionRecords.toSorted(
      (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime(),
    );

    const versionIds = repositoryVersions.map((version) => version.id);
    const jobRows =
      versionIds.length > 0
        ? await this.database
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
        ? await this.database
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
              content: file ? await this.inlineTextContent({ adapter: input.adapter, file }) : null,
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

    return {
      sourcePath,
      filename: repositoryVersionRecords[0]?.filename ?? sourcePath.split("/").at(-1) ?? sourcePath,
      provider: null,
      versions,
      jobsByLocale,
      providerJobsByLocale: [],
    };
  }
}

export const projectFileService = new ProjectFileService();

export const listFilteredProjectFiles = (
  input: Parameters<ProjectFileService["listFiltered"]>[0],
) => projectFileService.listFiltered(input);

export const listProjectFilesForProject = (
  input: Parameters<ProjectFileService["listForProject"]>[0],
) => projectFileService.listForProject(input);

export const listWorkspaceFiles = (input: Parameters<ProjectFileService["listWorkspace"]>[0]) =>
  projectFileService.listWorkspace(input);

export const inlineProjectFileTextContent = (
  input: Parameters<ProjectFileService["inlineTextContent"]>[0],
) => projectFileService.inlineTextContent(input);

export const getProjectFileDetail = (input: Parameters<ProjectFileService["getDetail"]>[0]) =>
  projectFileService.getDetail(input);
