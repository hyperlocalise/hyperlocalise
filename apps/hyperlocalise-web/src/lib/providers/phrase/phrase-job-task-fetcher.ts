import type { ExternalTmsJobTaskFetcher } from "@/lib/providers/external-tms-job-sync";

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
  const tmsProjectUid = resolvePhraseTmsProjectUid({
    externalProjectId,
    providerMetadata: project.providerMetadata,
  });

  if (!tmsProjectUid.trim()) {
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
      const taskSuffix = normalizeTaskLocaleSuffix(targetLocale);
      const externalJobId = `${jobPart.innerId}-task-${taskSuffix}`;
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
        externalUrl: buildPhraseTmsJobUrl(tmsProjectUid, jobPart.uid),
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

function resolvePhraseTmsProjectUid(input: {
  externalProjectId: string;
  providerMetadata: Record<string, unknown>;
}) {
  const metadataUid =
    typeof input.providerMetadata.tmsProjectUid === "string"
      ? input.providerMetadata.tmsProjectUid.trim()
      : "";
  if (metadataUid) {
    return metadataUid;
  }

  return input.externalProjectId.trim();
}

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

function normalizeTaskLocaleSuffix(targetLang: string) {
  const normalized = targetLang.trim().toLowerCase();
  if (!normalized) {
    return "unknown";
  }

  return normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function buildPhraseTmsJobUrl(projectUid: string, jobUid: string) {
  return `https://cloud.memsource.com/web/project2/translate/${encodeURIComponent(projectUid)}/job/${encodeURIComponent(jobUid)}`;
}

function mapPhraseTmsJobKind(
  workflowStepName: string | null | undefined,
): "translation" | "review" {
  const normalized = (workflowStepName ?? "").toLowerCase().trim();
  if (
    ["review", "proofread", "proofreading", "edit", "editing", "revision", "lqa"].some((token) =>
      normalized.includes(token),
    )
  ) {
    return "review";
  }

  return "translation";
}
