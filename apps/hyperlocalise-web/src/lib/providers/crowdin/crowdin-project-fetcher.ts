import type { ExternalTmsProjectFetcher } from "@/lib/providers/external-tms-project-sync";

import { CrowdinApiClient, CrowdinApiError } from "./crowdin-api";

export const fetchCrowdinProjects: ExternalTmsProjectFetcher = async ({
  credential,
  secretMaterial,
}) => {
  const client = new CrowdinApiClient({
    token: secretMaterial,
    baseUrl: credential.baseUrl ?? undefined,
  });

  const projects = await client.listProjects();

  const results = await Promise.all(
    projects.map(async (project) => {
      try {
        const [details, branches] = await Promise.all([
          client.getProject(project.id),
          client.listBranches(project.id),
        ]);

        return {
          externalProjectId: String(details.id),
          name: details.name,
          sourceLocale: details.sourceLanguageId,
          targetLocales: details.targetLanguageIds,
          externalProjectUrl: details.webUrl,
          isActive: !details.isSuspended,
          metadata: {
            identifier: details.identifier,
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
