import type { ExternalTmsJobTaskFetcher } from "@/lib/providers/tms-provider-types";

import { parseSmartlingCredentials } from "./smartling-credentials";
import { SmartlingApiClient } from "./smartling-api";
import { mapSmartlingFetcherError } from "./smartling-errors";
import { loadSmartlingProjectLocaleReadiness } from "./smartling-locale-progress";

export const fetchSmartlingJobTasks: ExternalTmsJobTaskFetcher = async ({
  credential,
  externalProjectId,
  secretMaterial,
  enrichResources = false,
  includeLocaleProgress = false,
}) => {
  const credentials = parseSmartlingCredentials(secretMaterial);
  const client = new SmartlingApiClient({
    credentials,
    authBaseUrl: credential.baseUrl ?? undefined,
  });

  if (!externalProjectId.trim()) {
    throw new Error("invalid_smartling_project_id");
  }

  let projectDetails;
  let jobs;
  try {
    [projectDetails, jobs] = await Promise.all([
      client.getProjectDetails(externalProjectId),
      client.listJobs(externalProjectId),
    ]);
  } catch (error) {
    throw mapSmartlingFetcherError(error);
  }

  const accountUid = projectDetails.accountUid;
  const projectLocaleReadiness = includeLocaleProgress
    ? await loadSmartlingProjectLocaleReadiness({ client, projectId: externalProjectId })
    : null;

  return Promise.all(
    jobs.map(async (job) => {
      let fileIds: string[] | undefined;
      let localeReadiness: Record<string, unknown> | undefined;

      if (enrichResources) {
        try {
          const jobFiles = await client.listJobFiles(externalProjectId, job.translationJobUid);
          fileIds = jobFiles.map((file) => file.fileUri).filter(Boolean);
        } catch {
          fileIds = [];
        }
      }

      if (includeLocaleProgress) {
        localeReadiness =
          projectLocaleReadiness ??
          (await loadSmartlingJobProgress(client, externalProjectId, job.translationJobUid));
      }

      return {
        externalJobId: job.translationJobUid,
        externalTaskId: null,
        externalStatus: job.jobStatus,
        title: job.jobName,
        dueDate: job.dueDate ? new Date(job.dueDate) : null,
        targetLocales: job.targetLocaleIds,
        assignedUsers: [],
        externalUrl: buildSmartlingJobUrl(accountUid, externalProjectId, job.translationJobUid),
        providerPayload: {
          description: job.description,
          createdDate: job.createdDate,
          modifiedDate: job.modifiedDate,
          referenceNumber: job.referenceNumber,
          jobNumber: job.jobNumber,
          rawJobStatus: job.jobStatus,
          ...(fileIds ? { fileIds } : {}),
          ...(localeReadiness ? { localeReadiness } : {}),
        },
        kind: mapSmartlingJobKind(job.jobStatus),
      };
    }),
  );
};

async function loadSmartlingJobProgress(
  client: SmartlingApiClient,
  projectId: string,
  jobUid: string,
): Promise<Record<string, unknown>> {
  try {
    const progress = await client.getJobProgress(projectId, jobUid);
    return {
      job: {
        totalWordCount: progress.totalWordCount ?? null,
        completedWordCount: progress.completedWordCount ?? null,
        percentComplete: progress.percentComplete ?? null,
      },
    };
  } catch {
    return {};
  }
}

function buildSmartlingJobUrl(accountUid: string, projectId: string, translationJobUid: string) {
  return `https://dashboard.smartling.com/app/accounts/${encodeURIComponent(accountUid)}/project/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(translationJobUid)}`;
}

function mapSmartlingJobKind(jobStatus: string): "translation" | "review" {
  const normalized = jobStatus.toLowerCase().trim();
  if (
    ["in_review", "in-review", "in review", "in_edit", "in-edit", "in edit"].includes(normalized)
  ) {
    return "review";
  }
  return "translation";
}
