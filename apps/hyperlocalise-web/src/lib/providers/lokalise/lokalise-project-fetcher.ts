import { mapWithConcurrency } from "@/lib/async/map-with-concurrency";
import type { ExternalTmsProjectFetcher } from "@/lib/providers/external-tms-project-sync";

import {
  buildLokaliseProjectUrl,
  LokaliseApiClient,
  LokaliseApiError,
  LOKALISE_DEFAULT_BASE_URL,
  partitionLokaliseLocales,
} from "./lokalise-api";

const LOCALE_FETCH_CONCURRENCY = 15;

export const fetchLokaliseProjects: ExternalTmsProjectFetcher = async ({
  credential,
  secretMaterial,
}) => {
  const client = new LokaliseApiClient({
    token: secretMaterial,
    baseUrl: credential.baseUrl ?? LOKALISE_DEFAULT_BASE_URL,
  });

  let projects;
  try {
    projects = await client.listProjects();
  } catch (error) {
    if (error instanceof LokaliseApiError && (error.status === 401 || error.status === 403)) {
      throw new Error("lokalise_auth_invalid");
    }
    throw error;
  }

  return mapWithConcurrency(projects, LOCALE_FETCH_CONCURRENCY, async (project) => {
    try {
      const languages = await client.listProjectLanguages(project.projectId);
      const { sourceLocale, targetLocales } = partitionLokaliseLocales(project, languages);

      return {
        externalProjectId: project.projectId,
        name: project.name,
        sourceLocale,
        targetLocales,
        externalProjectUrl: buildLokaliseProjectUrl(project.projectId),
        isActive: true,
        metadata: {
          projectType: project.projectType,
          teamId: project.teamId,
          description: project.description,
          baseLanguageId: project.baseLanguageId,
          languages: languages.map((language) => ({
            id: language.langId,
            iso: language.langIso,
            name: language.langName,
            isRtl: language.isRtl,
          })),
        },
      };
    } catch (error) {
      if (error instanceof LokaliseApiError && (error.status === 401 || error.status === 403)) {
        throw new Error("lokalise_auth_invalid");
      }

      return {
        externalProjectId: project.projectId,
        name: project.name,
        sourceLocale: project.baseLanguageIso,
        targetLocales: [],
        externalProjectUrl: buildLokaliseProjectUrl(project.projectId),
        isActive: true,
        metadata: {
          projectType: project.projectType,
          teamId: project.teamId,
          description: project.description,
          baseLanguageId: project.baseLanguageId,
          syncWarning: error instanceof Error ? error.message : "locale_fetch_failed",
        },
      };
    }
  });
};
