import type {
  ProjectFileDetailResponse,
  ProjectFileRecord,
} from "@/api/routes/project/project.schema";
import { apiClient } from "@/lib/api-client-instance";
import {
  parseProviderJobId,
  parseProviderProjectId,
  resolveEncodedProviderJobId,
} from "@/lib/providers/tms-provider-resource-id";
import type { TmsProviderLiveFile } from "@/lib/providers/tms-provider-live";

import type { JobDetailRecord } from "../../_components/job-detail-types";
import {
  providerSourceFileToProjectFileRecord,
  tmsLiveFileToProjectFileRecord,
} from "../../_components/tms/job-source-file-mappers";

export const PROJECT_FILES_FETCH_LIMIT = 1_000;

export type JobCatTargetFileLoadResult =
  | { status: "found"; file: ProjectFileRecord }
  | { status: "not_found"; reference: string }
  | { status: "list_truncated"; reference: string; fetchedCount: number };

function projectFileDetailToRecord(
  file: ProjectFileDetailResponse["file"],
  storedFileId: string | null = null,
): ProjectFileRecord {
  const latestVersion = file.versions[0];

  return {
    origin: file.provider ? "provider" : "repository",
    sourcePath: file.sourcePath,
    sourceHash: latestVersion?.sourceHash ?? null,
    commitSha: latestVersion?.commitSha ?? null,
    workflowRunId: latestVersion?.workflowRunId ?? null,
    uploadedAt: latestVersion?.uploadedAt ?? new Date(0).toISOString(),
    storedFileId: latestVersion?.storedFileId ?? storedFileId,
    metadata: latestVersion?.metadata ?? {},
    filename: file.filename,
    byteSize: latestVersion?.byteSize ?? null,
    provider: file.provider,
    latestJob: null,
  };
}

async function fetchProjectFiles(input: {
  organizationSlug: string;
  projectId: string;
  origin?: "all" | "repository" | "provider";
}) {
  const response = await apiClient.api.orgs[":organizationSlug"].projects[":projectId"].files.$get({
    param: { organizationSlug: input.organizationSlug, projectId: input.projectId },
    query: {
      limit: String(PROJECT_FILES_FETCH_LIMIT),
      ...(input.origin ? { origin: input.origin } : {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to load task files (${response.status})`);
  }

  const body = (await response.json()) as { files: ProjectFileRecord[] };
  return body.files;
}

export function resolveJobCatTargetFromStoredFileId(
  files: ProjectFileRecord[],
  storedFileId: string,
): JobCatTargetFileLoadResult {
  const file = files.find((entry) => entry.storedFileId === storedFileId) ?? null;

  if (file) {
    return { status: "found", file };
  }

  if (files.length >= PROJECT_FILES_FETCH_LIMIT) {
    return {
      status: "list_truncated",
      reference: storedFileId,
      fetchedCount: files.length,
    };
  }

  return { status: "not_found", reference: storedFileId };
}

export async function loadJobCatTargetFile(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath: string | null;
  storedFileId: string | null;
}): Promise<JobCatTargetFileLoadResult> {
  if (input.sourcePath) {
    const response = await apiClient.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.$get({
      param: { organizationSlug: input.organizationSlug, projectId: input.projectId },
      query: { sourcePath: input.sourcePath },
    });

    if (response.ok) {
      const body = (await response.json()) as ProjectFileDetailResponse;
      return {
        status: "found",
        file: projectFileDetailToRecord(body.file, input.storedFileId),
      };
    }

    return { status: "not_found", reference: input.sourcePath };
  }

  if (input.storedFileId) {
    const files = await fetchProjectFiles({
      organizationSlug: input.organizationSlug,
      projectId: input.projectId,
    });

    return resolveJobCatTargetFromStoredFileId(files, input.storedFileId);
  }

  return { status: "not_found", reference: "" };
}

async function fetchTmsProviderLiveJobFiles(input: {
  organizationSlug: string;
  encodedJobId: string;
}) {
  const response = await apiClient.api.orgs[":organizationSlug"]["tms-provider"].jobs[
    ":encodedJobId"
  ].files.$get({
    param: { organizationSlug: input.organizationSlug, encodedJobId: input.encodedJobId },
  });

  if (!response.ok) {
    throw new Error(`Failed to load task files (${response.status})`);
  }

  const body = (await response.json()) as { files: TmsProviderLiveFile[] };
  return body.files.map(tmsLiveFileToProjectFileRecord);
}

async function fetchJobDetail(organizationSlug: string, jobId: string) {
  const response = await apiClient.api.orgs[":organizationSlug"].jobs[":jobId"].$get({
    param: { organizationSlug, jobId },
  });

  if (!response.ok) {
    throw new Error(`Failed to load task (${response.status})`);
  }

  const body = (await response.json()) as { job: JobDetailRecord };
  return body.job;
}

export function resolveSyncedProviderTargetLocales(
  job: JobDetailRecord,
  targetLocale: string | null = null,
) {
  if (job.externalTargetLocales && job.externalTargetLocales.length > 0) {
    return [...job.externalTargetLocales];
  }

  return targetLocale ? [targetLocale] : [];
}

export function assertProviderJobBelongsToProject(encodedJobId: string, projectId: string) {
  const parsedJob = parseProviderJobId(encodedJobId);
  if (!parsedJob) {
    return;
  }

  const parsedProject = parseProviderProjectId(projectId);
  const projectMatches = parsedProject
    ? parsedProject.providerKind === parsedJob.providerKind &&
      parsedProject.externalProjectId === parsedJob.externalProjectId
    : parsedJob.externalProjectId === projectId;

  if (!projectMatches) {
    throw new Error("Task does not belong to this project");
  }
}

export function mapSyncedProviderSourceFiles(input: {
  job: JobDetailRecord;
  projectId: string;
  targetLocale?: string | null;
}) {
  if (!input.job.externalProviderKind) {
    return [];
  }

  const encodedProjectId = parseProviderProjectId(input.projectId);
  const externalProjectId = encodedProjectId?.externalProjectId ?? input.projectId;
  const targetLocales = resolveSyncedProviderTargetLocales(input.job, input.targetLocale ?? null);

  return (input.job.providerSourceFiles ?? []).flatMap((file) => {
    const record = providerSourceFileToProjectFileRecord(
      file,
      input.job.externalProviderKind as string,
      externalProjectId,
      targetLocales,
    );
    return record ? [record] : [];
  });
}

export async function loadJobCatProviderJobFiles(input: {
  organizationSlug: string;
  projectId: string;
  jobId: string;
  targetLocale?: string | null;
}) {
  const parsedJobId = parseProviderJobId(input.jobId);
  if (parsedJobId) {
    assertProviderJobBelongsToProject(input.jobId, input.projectId);
    return fetchTmsProviderLiveJobFiles({
      organizationSlug: input.organizationSlug,
      encodedJobId: input.jobId,
    });
  }

  const job = await fetchJobDetail(input.organizationSlug, input.jobId);
  if (job.projectId !== input.projectId) {
    throw new Error("Task does not belong to this project");
  }

  const encodedJobId = resolveEncodedProviderJobId({
    jobId: input.jobId,
    projectId: input.projectId,
    externalProviderKind: job.externalProviderKind,
    externalJobId: job.externalJobId,
    externalTaskId: job.externalTaskId,
  });

  if (encodedJobId) {
    assertProviderJobBelongsToProject(encodedJobId, input.projectId);
    return fetchTmsProviderLiveJobFiles({
      organizationSlug: input.organizationSlug,
      encodedJobId,
    });
  }

  return mapSyncedProviderSourceFiles({
    job,
    projectId: input.projectId,
    targetLocale: input.targetLocale ?? null,
  });
}
