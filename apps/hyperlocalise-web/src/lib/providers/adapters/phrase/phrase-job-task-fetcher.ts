import type { ExternalTmsJobTaskFetcher } from "@/lib/providers/sync/external-tms-job-sync";

import { buildPhraseExternalJobId, resolvePhraseTmsProjectUid } from "./phrase-job-context";
import {
  mapPhraseTmsFetcherError,
  PhraseTmsApiClient,
  type PhraseTmsJobPart,
  type PhraseTmsResourceReference,
} from "./phrase-tms-api";

export const fetchPhraseJobTasks: ExternalTmsJobTaskFetcher = async ({
  credential,
  externalProjectId,
  project,
  secretMaterial,
}) => {
  const tmsProjectUid = resolvePhraseTmsProjectUid(project, externalProjectId);

  if (!tmsProjectUid) {
    throw new Error("invalid_phrase_project_id");
  }

  const client = new PhraseTmsApiClient({
    token: secretMaterial,
    baseUrl: credential.baseUrl,
  });

  let jobParts: PhraseTmsJobPart[];
  try {
    jobParts = await client.listAllJobParts(tmsProjectUid);
  } catch (error) {
    throw mapPhraseTmsFetcherError(error);
  }

  const projectTermBases = await loadProjectTermBases(client, tmsProjectUid);
  const resourceCache = new Map<string, JobResourceBundle>();

  return Promise.all(
    jobParts.map(async (jobPart) => {
      const resources = await loadJobResources({
        client,
        projectUid: tmsProjectUid,
        jobPart,
        projectTermBases,
        cache: resourceCache,
      });

      const targetLocale = jobPart.targetLang;
      const externalJobId = buildPhraseExternalJobId(jobPart.innerId, targetLocale);
      const assignedUsers = [jobPart.owner?.userName?.trim(), jobPart.owner?.email?.trim()].filter(
        (value): value is string => Boolean(value),
      );

      return {
        externalJobId,
        externalTaskId: jobPart.uid,
        externalStatus: jobPart.status,
        title: buildPhraseJobTitle(jobPart),
        dueDate: jobPart.dateDue ? new Date(jobPart.dateDue) : null,
        targetLocales: targetLocale ? [targetLocale] : [],
        assignedUsers,
        externalUrl: buildPhraseTmsJobUrl(client.resolvedBaseUrl, tmsProjectUid, jobPart.uid),
        providerPayload: {
          workflowStep: jobPart.workflowStep?.name ?? null,
          workflowStepDetails: jobPart.workflowStep,
          translationMemories: resources.translationMemories,
          termBases: resources.termBases,
          innerId: jobPart.innerId,
          filename: jobPart.filename,
          importStatus: jobPart.importStatus,
          dateCreated: jobPart.dateCreated,
          tmsProjectUid,
        },
        kind: mapPhraseTmsJobKind(jobPart.workflowStep?.name),
      };
    }),
  );
};

type JobResourceBundle = {
  translationMemories: PhraseTmsResourceReference[];
  termBases: PhraseTmsResourceReference[];
};

async function loadProjectTermBases(client: PhraseTmsApiClient, projectUid: string) {
  try {
    return await client.getProjectTermBases(projectUid);
  } catch {
    return [];
  }
}

async function loadJobResources(input: {
  client: PhraseTmsApiClient;
  projectUid: string;
  jobPart: PhraseTmsJobPart;
  projectTermBases: PhraseTmsResourceReference[];
  cache: Map<string, JobResourceBundle>;
}) {
  const cacheKey = [
    input.projectUid,
    input.jobPart.targetLang,
    input.jobPart.workflowStep?.id ?? "default",
  ].join(":");

  const cached = input.cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const [translationMemories, jobTermBases] = await Promise.all([
    input.client
      .getProjectTranslationMemories({
        projectUid: input.projectUid,
        targetLang: input.jobPart.targetLang || null,
        workflowStepUid: input.jobPart.workflowStep?.id ?? null,
      })
      .catch(() => [] as PhraseTmsResourceReference[]),
    Promise.resolve(input.projectTermBases),
  ]);

  const bundle = {
    translationMemories,
    termBases: jobTermBases,
  };
  input.cache.set(cacheKey, bundle);
  return bundle;
}

function buildPhraseJobTitle(jobPart: PhraseTmsJobPart) {
  const filename = jobPart.filename.trim() || "Untitled job";
  if (!jobPart.targetLang.trim()) {
    return filename;
  }

  return `${filename} (${jobPart.targetLang})`;
}

function buildPhraseTmsJobUrl(baseUrl: string, projectUid: string, jobUid: string) {
  return `${baseUrl}/project2/translate/${encodeURIComponent(projectUid)}/job/${encodeURIComponent(jobUid)}`;
}

const PHRASE_TMS_REVIEW_STEP_TOKENS = new Set([
  "review",
  "proofread",
  "proofreading",
  "editing",
  "revision",
  "lqa",
]);

function mapPhraseTmsJobKind(
  workflowStepName: string | null | undefined,
): "translation" | "review" {
  const tokens = (workflowStepName ?? "")
    .toLowerCase()
    .trim()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0);

  if (tokens.some((token) => PHRASE_TMS_REVIEW_STEP_TOKENS.has(token))) {
    return "review";
  }

  return "translation";
}
