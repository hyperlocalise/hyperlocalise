import type { ExternalTmsProjectMetadata } from "@/lib/providers/tms-provider-types";

import { CrowdinApiClient, CrowdinApiError } from "./crowdin-api";
import { mapCrowdinProjectToMetadata } from "./crowdin-project-fetcher";

export async function fetchCrowdinProjectDetailMetadata(input: {
  projectId: number;
  token: string;
  baseUrl?: string;
}): Promise<ExternalTmsProjectMetadata | null> {
  const client = new CrowdinApiClient({
    token: input.token,
    baseUrl: input.baseUrl,
  });

  let project;
  try {
    project = await client.getProject(input.projectId);
  } catch (error) {
    if (error instanceof CrowdinApiError && error.status === 404) {
      return null;
    }
    if (error instanceof CrowdinApiError && error.status === 401) {
      throw new Error("crowdin_auth_invalid");
    }
    throw error;
  }

  const metadata = mapCrowdinProjectToMetadata(project);

  try {
    const branches = await client.listBranches(project.id);
    return {
      ...metadata,
      metadata: {
        ...metadata.metadata,
        branches: branches.map((branch) => ({
          id: branch.id,
          name: branch.name,
          title: branch.title,
        })),
      },
    };
  } catch (error) {
    if (error instanceof CrowdinApiError && error.status === 401) {
      throw new Error("crowdin_auth_invalid");
    }

    return {
      ...metadata,
      metadata: {
        ...metadata.metadata,
        syncWarning: error instanceof Error ? error.message : "branch_fetch_failed",
      },
    };
  }
}
