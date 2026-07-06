import type { ExternalTmsTaskContent } from "@/lib/providers/tms-provider-types";
import { buildProviderReviewReport } from "@/lib/providers/provider-job-review/normalize-provider-review";
import type { ProviderReviewReport } from "@/lib/providers/provider-job-review/types";

import { SmartlingApiClient, SmartlingApiError } from "./smartling-api";
import { parseSmartlingCredentials } from "./smartling-credentials";
import { normalizeSmartlingIssueToThread } from "./smartling-review-normalize";

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export type SmartlingReviewPullInput = {
  credential: { baseUrl?: string | null };
  secretMaterial: string;
  externalProjectId: string;
  externalJobId: string;
  content: ExternalTmsTaskContent;
  fetchFn?: typeof fetch;
};

function buildSmartlingProjectUrl(accountUid: string, projectId: string) {
  return `https://dashboard.smartling.com/app/accounts/${encodeURIComponent(accountUid)}/project/${encodeURIComponent(projectId)}/dashboard`;
}

export async function pullSmartlingProviderReview(
  input: SmartlingReviewPullInput,
): Promise<ProviderReviewReport> {
  const projectId = input.externalProjectId.trim();
  const jobUid = input.externalJobId.trim();
  if (!projectId || !jobUid) {
    throw new Error("invalid_smartling_project_or_job_id");
  }

  const credentials = parseSmartlingCredentials(input.secretMaterial);
  const client = new SmartlingApiClient({
    credentials,
    authBaseUrl: input.credential.baseUrl ?? undefined,
    fetchFn: input.fetchFn,
  });

  let projectDetails: Awaited<ReturnType<typeof client.getProjectDetails>>;
  let jobFiles: Awaited<ReturnType<typeof client.listJobFiles>>;
  try {
    [projectDetails, jobFiles] = await Promise.all([
      client.getProjectDetails(projectId),
      client.listJobFiles(projectId, jobUid),
    ]);
  } catch (error) {
    if (error instanceof SmartlingApiError && error.status === 401) {
      throw new Error("smartling_auth_invalid");
    }
    throw error;
  }

  const stringKeyById = new Map(
    input.content.units.map((unit) => [unit.externalStringId, unit.key] as const),
  );

  const hashcodes = new Set<string>();
  for (const unit of input.content.units) {
    const hashcode = unit.externalStringId.trim();
    if (hashcode) {
      hashcodes.add(hashcode);
    }
  }

  const fileUris = jobFiles.map((file) => file.fileUri).filter(Boolean);
  if (fileUris.length > 0) {
    for (const fileUri of fileUris) {
      const strings = await client.listSourceStrings(projectId, { fileUri });
      for (const sourceString of strings) {
        if (sourceString.hashcode) {
          hashcodes.add(sourceString.hashcode);
        }
      }
    }
  }

  const hashcodeList = [...hashcodes];
  const issues: Awaited<ReturnType<typeof client.listIssues>> = [];

  if (hashcodeList.length === 0) {
    return buildProviderReviewReport([]);
  }

  for (const chunk of chunkArray(hashcodeList, 50)) {
    const pageIssues = await client.listIssues(projectId, {
      stringFilter: { hashcodes: chunk },
    });
    issues.push(...pageIssues);
  }

  const projectWebUrl = buildSmartlingProjectUrl(projectDetails.accountUid, projectId);
  const threads = issues.map((issue) =>
    normalizeSmartlingIssueToThread({
      issue,
      externalProjectId: projectId,
      externalJobId: jobUid,
      stringKeyById,
      projectWebUrl,
    }),
  );

  const deduped = new Map(threads.map((thread) => [thread.threadId, thread] as const));
  return buildProviderReviewReport([...deduped.values()]);
}
