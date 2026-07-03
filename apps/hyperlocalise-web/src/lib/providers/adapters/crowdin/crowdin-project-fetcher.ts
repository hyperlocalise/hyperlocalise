import type { ExternalTmsProjectFetcher } from "@/lib/providers/tms-provider-types";

import { CrowdinApiClient, CrowdinApiError, type CrowdinProject } from "./crowdin-api";

export function mapCrowdinProjectToMetadata(project: CrowdinProject) {
  return {
    externalProjectId: String(project.id),
    name: project.name,
    sourceLocale: project.sourceLanguageId,
    targetLocales: project.targetLanguageIds,
    externalProjectUrl: project.webUrl,
    isActive: !project.isSuspended,
    metadata: {
      identifier: project.identifier,
    },
  };
}

export const fetchCrowdinProjects: ExternalTmsProjectFetcher = async ({
  credential,
  secretMaterial,
}) => {
  const client = new CrowdinApiClient({
    token: secretMaterial,
    baseUrl: credential.baseUrl ?? undefined,
  });

  let projects: CrowdinProject[];
  try {
    projects = await client.listProjects();
  } catch (error) {
    if (error instanceof CrowdinApiError && error.status === 401) {
      throw new Error("crowdin_auth_invalid");
    }
    throw error;
  }

  return projects.map(mapCrowdinProjectToMetadata);
};
