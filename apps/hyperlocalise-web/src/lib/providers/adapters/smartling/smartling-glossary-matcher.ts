import type { ExternalTmsGlossaryMatcher } from "@/lib/providers/contracts/glossary-matcher";
import { normalizeProviderGlossaryMatch } from "@/lib/providers/contracts/glossary-match";

import { resolveSmartlingAccountUid } from "./smartling-account-context";
import {
  matchesSmartlingGlossaryEntry,
  pickSmartlingGlossaryTranslation,
} from "./normalize-smartling-context-matches";
import { SmartlingApiClient, SmartlingApiError } from "./smartling-api";

export const searchSmartlingGlossaryMatches: ExternalTmsGlossaryMatcher = async ({
  credential,
  secretMaterial,
  externalProjectId,
  glossaries,
  sourceLocale,
  targetLocale,
  sourceText,
  limit,
}) => {
  const authBaseUrl = credential.baseUrl ?? undefined;
  const accountUid = await resolveSmartlingAccountUid({
    secretMaterial,
    externalProjectId,
    authBaseUrl,
  });
  if (!accountUid) {
    return [];
  }

  const searchableGlossaries = glossaries.filter((glossary) => glossary.externalGlossaryId);
  if (searchableGlossaries.length === 0) {
    return [];
  }

  const client = new SmartlingApiClient({ credentials: secretMaterial, authBaseUrl });
  const normalizedTargetLocale = targetLocale.trim();
  const liveMatches = [];

  for (const glossary of searchableGlossaries) {
    const glossaryUid = glossary.externalGlossaryId;
    if (!glossaryUid) {
      continue;
    }

    if (glossary.targetLocale?.trim() && glossary.targetLocale.trim() !== normalizedTargetLocale) {
      continue;
    }

    let entries;
    try {
      entries = await client.searchGlossaryEntries({
        accountUid,
        glossaryUid,
        query: sourceText,
      });
    } catch (error) {
      if (error instanceof SmartlingApiError && error.status === 401) {
        throw new Error("smartling_auth_invalid");
      }
      continue;
    }

    for (const [index, entry] of entries.entries()) {
      if (!matchesSmartlingGlossaryEntry(sourceText, entry)) {
        continue;
      }

      const sourceTerm = entry.term.trim();
      const targetTerm = pickSmartlingGlossaryTranslation(entry, normalizedTargetLocale);
      if (!sourceTerm || !targetTerm) {
        continue;
      }

      liveMatches.push(
        normalizeProviderGlossaryMatch({
          sourceTerm,
          targetTerm,
          sourceLocale,
          targetLocale: normalizedTargetLocale,
          description: entry.definition,
          providerKind: "smartling",
          resourceId: glossary.id,
          externalResourceId: glossaryUid,
          externalTermId: entry.entryUid,
          glossaryName: glossary.name,
          rank: Math.max(0, 1 - index * 0.01),
        }),
      );
    }
  }

  return liveMatches.toSorted((left, right) => right.rank - left.rank).slice(0, limit);
};
