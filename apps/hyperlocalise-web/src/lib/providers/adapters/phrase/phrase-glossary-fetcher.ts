import type { ExternalTmsGlossaryFetcher } from "@/lib/providers/sync/external-tms-glossary-sync";

import { resolvePhraseTmsProjectUid } from "./phrase-job-context";
import { PhraseTmsApiClient, PhraseTmsApiError } from "./phrase-tms-api";

export const fetchPhraseGlossaries: ExternalTmsGlossaryFetcher = async ({
  credential,
  secretMaterial,
  externalProjectId,
  project,
}) => {
  const tmsProjectUid = resolvePhraseTmsProjectUid(project, externalProjectId);
  if (!tmsProjectUid) {
    throw new Error("invalid_phrase_tms_project_id");
  }

  const client = new PhraseTmsApiClient({
    token: secretMaterial,
    baseUrl: credential.baseUrl,
  });

  let termBases;
  try {
    termBases = await client.getProjectTermBases(tmsProjectUid);
  } catch (error) {
    if (error instanceof PhraseTmsApiError && error.status === 401) {
      throw new Error("phrase_auth_invalid");
    }
    throw error;
  }

  const sourceLocale = project.sourceLocale ?? "en";
  const targetLocales = project.targetLocales ?? [];
  const glossaryTargetLocales =
    targetLocales.length > 0 ? uniqueLocales(targetLocales) : [sourceLocale];

  return termBases.flatMap((termBase) =>
    glossaryTargetLocales.map((targetLocale) => ({
      externalGlossaryId: termBase.uid,
      name: termBase.name || termBase.uid,
      description: "",
      sourceLocale,
      targetLocale,
      externalResourceType: "term_base" as const,
      localeCoverage: uniqueLocales([sourceLocale, targetLocale]),
      termCount: null,
      termCapabilities: { mode: "live_search" },
      metadata: {
        phraseTermBaseUid: termBase.uid,
        phraseTmsProjectUid: tmsProjectUid,
        phraseTermBaseId: termBase.id,
      },
      terms: [],
    })),
  );
};

function uniqueLocales(locales: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const locale of locales) {
    const trimmed = locale.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    unique.push(trimmed);
  }

  return unique;
}
