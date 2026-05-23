import type { ExternalTmsTranslationPusher } from "@/lib/providers/external-tms-content-sync";

import { PhraseApiError } from "./phrase-api";
import { createPhraseStringsApiClient } from "./phrase-strings-client";
import {
  buildPhraseJobScopeTag,
  findPhraseTmsJobPart,
  parsePhraseExternalJobId,
  resolvePhraseBranch,
  resolvePhraseStringsProjectId,
  resolvePhraseTmsProjectUid,
} from "./phrase-job-context";
import { PhraseTmsApiClient, mapPhraseTmsFetcherError } from "./phrase-tms-api";
import { buildPhraseTranslationWriteBackGroups } from "./phrase-write-back";

export const pushPhraseTranslations: ExternalTmsTranslationPusher = async ({
  credential,
  externalProjectId,
  externalJobId,
  project,
  secretMaterial,
  translations,
}) => {
  const stringsProjectId = resolvePhraseStringsProjectId(project, externalProjectId);
  if (!stringsProjectId) {
    throw new Error("invalid_phrase_project_id");
  }

  const parsedJobId = parsePhraseExternalJobId(externalJobId);
  if (!parsedJobId) {
    throw new Error("invalid_phrase_job_id");
  }

  const branch = resolvePhraseBranch(project);
  let defaultTargetLocale: string | null = null;

  const tmsProjectUid = resolvePhraseTmsProjectUid(project);
  if (tmsProjectUid) {
    const tmsClient = new PhraseTmsApiClient({
      token: secretMaterial,
      baseUrl: credential.baseUrl,
    });

    try {
      const jobParts = await tmsClient.listAllJobParts(tmsProjectUid);
      const jobPart = findPhraseTmsJobPart({ externalJobId, jobParts });
      defaultTargetLocale = jobPart?.targetLang?.trim() || null;
    } catch (error) {
      throw mapPhraseTmsFetcherError(error);
    }
  }

  const jobTag = buildPhraseJobScopeTag(parsedJobId.innerId);
  const { groups, failures: payloadFailures } = buildPhraseTranslationWriteBackGroups({
    translations,
    branch,
    jobTag,
    defaultTargetLocale,
  });

  const client = createPhraseStringsApiClient({
    token: secretMaterial,
    region: credential.region,
    baseUrl: credential.baseUrl,
  });

  let uploaded = 0;
  let failed = payloadFailures.length;
  const failures = [...payloadFailures];
  const asyncOperations: Array<Record<string, unknown>> = [];

  let keysByName: KeysByName;
  try {
    keysByName = await loadKeysByName(client, stringsProjectId, branch);
  } catch (error) {
    throw mapPhraseStringsError(error);
  }

  for (const group of groups) {
    for (const entry of group.entries) {
      try {
        const resolvedKeyId = await resolvePhraseKeyId({
          client,
          projectId: stringsProjectId,
          keysByName,
          entry,
        });

        await client.upsertTranslation(stringsProjectId, {
          keyId: resolvedKeyId,
          localeName: entry.locale,
          content: entry.text,
          branch: entry.branch,
          unverified: false,
        });

        uploaded += 1;
        asyncOperations.push({
          type: "phrase_upsert_translation",
          keyId: resolvedKeyId,
          locale: entry.locale,
          branch: entry.branch,
          jobTag: entry.jobTag,
          status: "succeeded",
        });
      } catch (error) {
        failed += 1;
        failures.push({
          locale: entry.locale,
          fileId: null,
          message: error instanceof Error ? error.message : "phrase translation upload failed",
        });
        asyncOperations.push({
          type: "phrase_upsert_translation",
          locale: entry.locale,
          branch: entry.branch,
          jobTag: entry.jobTag,
          status: "failed",
          error: error instanceof Error ? error.message : "phrase translation upload failed",
        });
      }
    }
  }

  return { uploaded, failed, failures, asyncOperations };
};

type KeysByName = Map<string, { id: string; tags: string[] }>;

async function loadKeysByName(
  client: ReturnType<typeof createPhraseStringsApiClient>,
  projectId: string,
  branch: string | null,
) {
  const listOptions = branch ? { branch } : {};
  const keys = await client.listKeys(projectId, listOptions);
  const keysByName = new Map<string, { id: string; tags: string[] }>();

  for (const key of keys) {
    keysByName.set(buildKeyLookup(key.name), {
      id: key.id,
      tags: key.tags,
    });
  }

  return keysByName;
}

async function resolvePhraseKeyId(input: {
  client: ReturnType<typeof createPhraseStringsApiClient>;
  projectId: string;
  keysByName: KeysByName;
  entry: {
    key: string;
    keyId: string | null;
    branch: string | null;
    jobTag: string | null;
  };
}) {
  if (input.entry.keyId) {
    return input.entry.keyId;
  }

  const lookup = buildKeyLookup(input.entry.key);
  const existing = input.keysByName.get(lookup);
  if (existing) {
    return existing.id;
  }

  const tags = input.entry.jobTag ? [input.entry.jobTag] : [];
  const created = await input.client.createKey(input.projectId, {
    name: input.entry.key,
    tags,
    branch: input.entry.branch,
  });

  input.keysByName.set(lookup, { id: created.id, tags: created.tags });
  return created.id;
}

function buildKeyLookup(name: string) {
  return name.trim();
}

function mapPhraseStringsError(error: unknown) {
  if (error instanceof PhraseApiError && error.status === 401) {
    return new Error("phrase_auth_invalid");
  }

  return error instanceof Error ? error : new Error("phrase_fetch_failed");
}
