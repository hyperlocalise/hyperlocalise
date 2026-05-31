import type { ExternalTmsGlossaryFetcher } from "@/lib/providers/sync/external-tms-glossary-sync";

import { resolveSmartlingAccountUid, uniqueLocales } from "./smartling-account-context";
import { SmartlingApiClient, SmartlingApiError } from "./smartling-api";

export const fetchSmartlingGlossaries: ExternalTmsGlossaryFetcher = async ({
  credential,
  secretMaterial,
  externalProjectId,
  project,
}) => {
  const accountUid = await resolveSmartlingAccountUid({
    secretMaterial,
    authBaseUrl: credential.baseUrl ?? undefined,
    externalProjectId,
    project,
  });
  if (!accountUid) {
    throw new Error("smartling_account_uid_required");
  }

  const client = new SmartlingApiClient({
    credentials: secretMaterial,
    authBaseUrl: credential.baseUrl ?? undefined,
  });

  let glossaries;
  try {
    glossaries = await client.listAccountGlossaries(accountUid);
  } catch (error) {
    if (error instanceof SmartlingApiError && error.status === 401) {
      throw new Error("smartling_auth_invalid");
    }
    throw error;
  }

  const sourceLocale = project.sourceLocale ?? "en";
  const targetLocales = project.targetLocales ?? [];
  if (targetLocales.length === 0) {
    return [];
  }
  const glossaryTargetLocales = uniqueLocales(targetLocales);

  return glossaries
    .filter((glossary) => glossary.glossaryUid)
    .flatMap((glossary) =>
      glossaryTargetLocales.map((targetLocale) => ({
        externalGlossaryId: glossary.glossaryUid,
        name: glossary.name || glossary.glossaryUid,
        description: glossary.description ?? "",
        sourceLocale,
        targetLocale,
        externalResourceType: "glossary" as const,
        localeCoverage: uniqueLocales([sourceLocale, targetLocale, ...glossary.localeIds]),
        termCount: null,
        termCapabilities: { mode: "live_search" },
        metadata: {
          smartlingGlossaryUid: glossary.glossaryUid,
          smartlingAccountUid: accountUid,
        },
        terms: [],
      })),
    );
};
