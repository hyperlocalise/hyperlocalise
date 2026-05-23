import type { ExternalTmsTranslationMemoryFetcher } from "@/lib/providers/external-tms-tm-sync";

import { resolvePhraseTmsProjectUid } from "./phrase-job-context";
import { PhraseTmsApiClient, PhraseTmsApiError } from "./phrase-tms-api";

export const fetchPhraseTranslationMemories: ExternalTmsTranslationMemoryFetcher = async ({
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

  let memories;
  try {
    memories = await client.getProjectTranslationMemories({ projectUid: tmsProjectUid });
  } catch (error) {
    if (error instanceof PhraseTmsApiError && error.status === 401) {
      throw new Error("phrase_auth_invalid");
    }
    throw error;
  }

  const sourceLocale = project.sourceLocale ?? "en";
  const targetLocales = project.targetLocales ?? [];

  return memories.map((memory) => ({
    externalMemoryId: memory.uid,
    name: memory.name || memory.uid,
    description: "",
    sourceLocale,
    localeCoverage: uniqueLocales([sourceLocale, ...targetLocales]),
    segmentCount: null,
    metadata: {
      phraseTransMemoryUid: memory.uid,
      phraseTmsProjectUid: tmsProjectUid,
      phraseTransMemoryId: memory.id,
    },
    entries: [],
  }));
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
