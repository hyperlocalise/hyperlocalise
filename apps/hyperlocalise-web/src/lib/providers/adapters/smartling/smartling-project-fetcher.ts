import type { ExternalTmsProjectFetcher } from "@/lib/providers/tms-provider-types";

import { parseSmartlingCredentials } from "./smartling-credentials";
import { SmartlingApiClient, SmartlingApiError } from "./smartling-api";

const PROJECT_DETAIL_FETCH_CONCURRENCY = 15;

export const fetchSmartlingProjects: ExternalTmsProjectFetcher = async ({
  credential,
  secretMaterial,
}) => {
  const credentials = parseSmartlingCredentials(secretMaterial);
  const client = new SmartlingApiClient({
    credentials,
    authBaseUrl: credential.baseUrl ?? undefined,
  });

  let summaries;
  try {
    summaries = await client.listDiscoverableProjects();
  } catch (error) {
    if (error instanceof SmartlingApiError) {
      if (error.code === "smartling_auth_invalid" || error.status === 401) {
        throw new Error("smartling_auth_invalid");
      }
      if (error.code === "smartling_api_unavailable") {
        throw new Error("smartling_api_unavailable");
      }
    }
    if (error instanceof Error && error.message === "smartling_account_uid_required") {
      throw error;
    }
    throw error;
  }

  const results = await mapInBatches(
    summaries,
    PROJECT_DETAIL_FETCH_CONCURRENCY,
    async (summary) => {
      if (summary.targetLocales.length > 0) {
        return normalizeSmartlingProject(summary);
      }

      try {
        const details = await client.getProjectDetails(summary.projectId);
        return normalizeSmartlingProject(details);
      } catch (error) {
        if (error instanceof SmartlingApiError && error.status === 401) {
          throw new Error("smartling_auth_invalid");
        }
        if (error instanceof SmartlingApiError && error.code === "smartling_api_unavailable") {
          throw new Error("smartling_api_unavailable");
        }

        return normalizeSmartlingProject(summary, {
          syncWarning: error instanceof Error ? error.message : "project_details_fetch_failed",
        });
      }
    },
  );

  return results;
};

function normalizeSmartlingProject(
  project: {
    accountUid: string;
    projectId: string;
    projectName: string;
    sourceLocaleId: string;
    archived: boolean;
    projectTypeCode: string | null;
    targetLocales: Array<{ localeId: string; enabled?: boolean }>;
  },
  extras?: { syncWarning?: string },
) {
  const targetLocales = project.targetLocales
    .filter((locale) => locale.enabled !== false)
    .map((locale) => locale.localeId);

  return {
    externalProjectId: project.projectId,
    name: project.projectName,
    sourceLocale: project.sourceLocaleId,
    targetLocales,
    externalProjectUrl: buildSmartlingProjectUrl(project.accountUid, project.projectId),
    isActive: !project.archived,
    metadata: {
      accountUid: project.accountUid,
      projectTypeCode: project.projectTypeCode,
      ...(extras?.syncWarning ? { syncWarning: extras.syncWarning } : {}),
    },
  };
}

function buildSmartlingProjectUrl(accountUid: string, projectId: string) {
  return `https://dashboard.smartling.com/app/accounts/${encodeURIComponent(accountUid)}/project/${encodeURIComponent(projectId)}/dashboard`;
}

async function mapInBatches<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  const batchSize = Math.max(1, concurrency);

  for (let index = 0; index < items.length; index += batchSize) {
    const batch = items.slice(index, index + batchSize);
    const batchResults = await Promise.all(batch.map((item) => mapper(item)));
    results.push(...batchResults);
  }

  return results;
}
