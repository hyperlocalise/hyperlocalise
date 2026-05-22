import type { ExternalTmsProjectFetcher } from "@/lib/providers/external-tms-project-sync";

import { PhraseApiClient, PhraseApiError } from "./phrase-api";

const LOCALE_FETCH_CONCURRENCY = 15;

export const fetchPhraseProjects: ExternalTmsProjectFetcher = async ({
  credential,
  secretMaterial,
}) => {
  const client = new PhraseApiClient({
    token: secretMaterial,
    region: credential.region,
    baseUrl: credential.baseUrl,
  });

  let projects;
  try {
    projects = await client.listProjects();
  } catch (error) {
    if (error instanceof PhraseApiError && error.status === 401) {
      throw new Error("phrase_auth_invalid");
    }
    throw error;
  }

  const results = await mapWithConcurrency(projects, LOCALE_FETCH_CONCURRENCY, async (project) => {
    try {
      const locales = await client.listLocales(project.id);
      const { sourceLocale, targetLocales } = partitionPhraseLocales(locales);

      return {
        externalProjectId: project.id,
        name: project.name,
        sourceLocale,
        targetLocales,
        externalProjectUrl: buildPhraseProjectUrl(project),
        isActive: true,
        metadata: {
          slug: project.slug,
          mainFormat: project.mainFormat,
          accountId: project.account?.id ?? null,
          accountSlug: project.account?.slug ?? null,
          locales: locales.map((locale) => ({
            id: locale.id,
            name: locale.name,
            code: locale.code,
            default: locale.default,
          })),
        },
      };
    } catch (error) {
      if (error instanceof PhraseApiError && error.status === 401) {
        throw new Error("phrase_auth_invalid");
      }

      return {
        externalProjectId: project.id,
        name: project.name,
        sourceLocale: null,
        targetLocales: [],
        externalProjectUrl: buildPhraseProjectUrl(project),
        isActive: true,
        metadata: {
          slug: project.slug,
          mainFormat: project.mainFormat,
          accountId: project.account?.id ?? null,
          accountSlug: project.account?.slug ?? null,
          syncWarning: error instanceof Error ? error.message : "locale_fetch_failed",
        },
      };
    }
  });

  return results;
};

function partitionPhraseLocales(
  locales: Array<{ name: string; code: string | null; default: boolean }>,
) {
  const source = locales.find((locale) => locale.default);
  const sourceLocale = localeIdentifier(source);
  const targetLocales = locales
    .filter((locale) => !locale.default)
    .map((locale) => localeIdentifier(locale))
    .filter((locale): locale is string => Boolean(locale));

  return {
    sourceLocale,
    targetLocales,
  };
}

function localeIdentifier(locale: { name: string; code: string | null } | undefined) {
  if (!locale) return null;
  return locale.code?.trim() || locale.name.trim() || null;
}

function buildPhraseProjectUrl(project: { slug: string; account: { slug: string } | null }) {
  if (!project.account?.slug) return null;
  return `https://app.phrase.com/accounts/${project.account.slug}/projects/${project.slug}`;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
) {
  const results: R[] = Array.from({ length: items.length });
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) {
        return;
      }

      results[currentIndex] = await mapper(items[currentIndex] as T);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
