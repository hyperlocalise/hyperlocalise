import type { ExternalTmsJobTaskFetcher } from "@/lib/providers/external-tms-job-sync";

import { parseSmartlingCredentials } from "./smartling-credentials";
import { SmartlingApiClient, SmartlingApiError } from "./smartling-api";

export const fetchSmartlingJobTasks: ExternalTmsJobTaskFetcher = async ({
  credential,
  externalProjectId,
  secretMaterial,
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

  return jobs.map((job) => ({
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
    },
    kind: mapSmartlingJobKind(job.jobStatus),
  }));
};

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

function mapSmartlingFetcherError(error: unknown): Error {
  if (error instanceof SmartlingApiError) {
    if (error.code === "smartling_auth_invalid" || error.status === 401) {
      return new Error("smartling_auth_invalid");
    }
    if (error.code === "smartling_api_unavailable") {
      return new Error("smartling_api_unavailable");
    }
  }
  return error instanceof Error ? error : new Error("smartling_request_failed");
}
