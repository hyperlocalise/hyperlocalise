import type { ExternalTmsProjectFetcher } from "@/lib/providers/external-tms-project-sync";

import { CrowdinApiClient, CrowdinApiError, type CrowdinProject } from "./crowdin-api";

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

  const results = await Promise.all(
    projects.map(async (project) => {
      try {
        const branches = await client.listBranches(project.id);

        return {
          externalProjectId: String(project.id),
          name: project.name,
          sourceLocale: project.sourceLanguageId,
          targetLocales: project.targetLanguageIds,
          externalProjectUrl: project.webUrl,
          isActive: !project.isSuspended,
          metadata: {
            identifier: project.identifier,
            branches: branches.map((b) => ({
              id: b.id,
              name: b.name,
              title: b.title,
            })),
          },
        };
      } catch (error) {
        if (error instanceof CrowdinApiError && error.status === 401) {
          throw new Error("crowdin_auth_invalid");
        }

        // Return a partial record so that one failed project does not abort
        // the entire scan.  The sync orchestrator will record the failure
        // and continue with the rest.
        return {
          externalProjectId: String(project.id),
          name: project.name,
          sourceLocale: project.sourceLanguageId,
          targetLocales: project.targetLanguageIds,
          externalProjectUrl: project.webUrl,
          isActive: !project.isSuspended,
          metadata: {
            identifier: project.identifier,
            syncWarning: error instanceof Error ? error.message : "branch_fetch_failed",
          },
        };
      }
    }),
  );

  return results;
};
