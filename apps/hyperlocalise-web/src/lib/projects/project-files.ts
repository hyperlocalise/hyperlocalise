import { and, eq, ilike, inArray, sql } from "drizzle-orm";

import type {
  ProjectFileRecord,
  ProjectFilesQuery,
  WorkspaceFileRecord,
} from "@/api/routes/project/project.schema";
import { db, schema } from "@/lib/database";
import { listTmsProviderLiveFilesForProject } from "@/lib/providers/tms-provider-live";
import type { ExternalTmsFileKeyMetadata } from "@/lib/providers/tms-provider-types";

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

export async function listFilteredProjectFiles(input: {
  organizationId: string;
  projectId: string;
  query: ProjectFilesQuery;
  resourceTypes?: ExternalTmsFileKeyMetadata["resourceType"][];
}) {
  const fetchLimit = input.query.limit;
  const mergedFiles = await listProjectFilesForProject({
    organizationId: input.organizationId,
    projectId: input.projectId,
    providerFetchLimit: fetchLimit,
    repositoryFetchLimit: fetchLimit,
    providerFilters: input.query,
    resourceTypes: input.resourceTypes,
  });

  return filterProjectFiles(mergedFiles, input.query).slice(0, input.query.limit);
}

export async function listProjectFilesForProject(input: {
  organizationId: string;
  projectId: string;
  providerFetchLimit?: number;
  repositoryFetchLimit?: number;
  providerFilters?: ProjectFileFilterQuery;
  resourceTypes?: ExternalTmsFileKeyMetadata["resourceType"][];
}) {
  // Load both sources so repository/provider rows can merge into combined entries before origin filtering.
  const shouldLoadRepositoryFiles = true;
  const shouldLoadProviderFiles = true;
  const repositorySearch = input.providerFilters?.search?.trim();

  const versionsSubquery = db
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

  const versionsBaseQuery = db
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
  const [project] = shouldLoadProviderFiles
    ? await db
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
    const jobsSubquery = db
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

    const jobs = await db
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

  const nativeFiles: ProjectFileRecord[] = versions.map((v) => {
    const job = latestJobs.get(v.versionId);
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

  return [
    ...nativeFiles.filter((file) => !combinedSourcePaths.has(file.sourcePath)),
    ...providerBackedFiles,
  ].sort((a, b) => a.sourcePath.localeCompare(b.sourcePath));
}

export async function listWorkspaceFiles(input: {
  organizationId: string;
  projects: ProjectFileListContext[];
  query: ProjectFilesQuery;
}) {
  const resourceTypes =
    input.query.resourceType && input.query.resourceType !== "all"
      ? ([input.query.resourceType] as ExternalTmsFileKeyMetadata["resourceType"][])
      : undefined;

  const projectIds =
    input.query.projectId && input.query.projectId !== "all"
      ? input.projects.filter((project) => project.projectId === input.query.projectId)
      : input.projects;

  const sortedProjects = projectIds.toSorted((a, b) => a.projectName.localeCompare(b.projectName));
  const collected: WorkspaceFileRecord[] = [];

  for (const project of sortedProjects) {
    if (collected.length >= input.query.limit) {
      break;
    }

    const remaining = input.query.limit - collected.length;
    const perProjectFetchLimit = Math.max(remaining + 5, input.query.limit);

    const files = await listProjectFilesForProject({
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

  return collected.sort((a, b) => {
    const projectCompare = a.projectName.localeCompare(b.projectName);
    if (projectCompare !== 0) {
      return projectCompare;
    }
    return a.sourcePath.localeCompare(b.sourcePath);
  });
}
