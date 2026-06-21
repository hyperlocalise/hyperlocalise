import type {
  ProjectFileDetailResponse,
  ProjectFileRecord,
} from "@/api/routes/project/project.schema";
import { apiClient } from "@/lib/api-client-instance";

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

export async function loadJobCatProviderFiles(input: {
  organizationSlug: string;
  projectId: string;
}) {
  return fetchProjectFiles({
    organizationSlug: input.organizationSlug,
    projectId: input.projectId,
    origin: "provider",
  });
}
