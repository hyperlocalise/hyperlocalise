import type { PhraseLocale } from "./phrase-api";
import type { PhraseTmsJobPart } from "./phrase-tms-api";

const PHRASE_EXTERNAL_JOB_ID_PATTERN = /^(.+)-task-([a-z0-9]+(?:-[a-z0-9]+)*)$/;

export function parsePhraseExternalJobId(externalJobId: string) {
  const match = externalJobId.trim().match(PHRASE_EXTERNAL_JOB_ID_PATTERN);
  if (!match) {
    return null;
  }

  return {
    innerId: match[1],
    taskLocaleSuffix: match[2],
  };
}

export function normalizePhraseTaskLocaleSuffix(targetLang: string) {
  const normalized = targetLang.trim().toLowerCase();
  if (!normalized) {
    return "unknown";
  }

  return normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function buildPhraseExternalJobId(innerId: string, targetLang: string) {
  return `${innerId.trim()}-task-${normalizePhraseTaskLocaleSuffix(targetLang)}`;
}

export function buildPhraseJobScopeTag(innerId: string) {
  return `hyperlocalise:job:${innerId.trim()}`;
}

export function resolvePhraseStringsProjectId(
  project: { providerMetadata: Record<string, unknown> },
  externalProjectId: string,
) {
  const metadata = project.providerMetadata ?? {};
  const stringsProjectId =
    typeof metadata.stringsProjectId === "string" ? metadata.stringsProjectId.trim() : "";
  if (stringsProjectId) {
    return stringsProjectId;
  }

  return externalProjectId.trim();
}

export function resolvePhraseTmsProjectUid(project: {
  providerMetadata: Record<string, unknown>;
}): string | null {
  const metadata = project.providerMetadata ?? {};
  const tmsProjectUid =
    typeof metadata.tmsProjectUid === "string" ? metadata.tmsProjectUid.trim() : "";
  if (tmsProjectUid) {
    return tmsProjectUid;
  }

  return null;
}

export function resolvePhraseBranch(project: { providerMetadata: Record<string, unknown> }) {
  const metadata = project.providerMetadata ?? {};
  if (typeof metadata.defaultBranch === "string" && metadata.defaultBranch.trim()) {
    return metadata.defaultBranch.trim();
  }
  if (typeof metadata.branch === "string" && metadata.branch.trim()) {
    return metadata.branch.trim();
  }

  return null;
}

export function matchPhraseTargetLocale(targetLang: string, locales: PhraseLocale[]) {
  const normalized = targetLang.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  for (const locale of locales) {
    if (locale.name.trim().toLowerCase() === normalized) {
      return locale;
    }
    if (locale.code?.trim().toLowerCase() === normalized) {
      return locale;
    }
  }

  const suffix = normalizePhraseTaskLocaleSuffix(targetLang);
  for (const locale of locales) {
    if (normalizePhraseTaskLocaleSuffix(locale.code ?? locale.name) === suffix) {
      return locale;
    }
  }

  return null;
}

export function findPhraseTmsJobPart(input: {
  externalJobId: string;
  jobParts: PhraseTmsJobPart[];
}) {
  const parsed = parsePhraseExternalJobId(input.externalJobId);
  if (!parsed) {
    return null;
  }

  return (
    input.jobParts.find(
      (jobPart) =>
        jobPart.innerId === parsed.innerId &&
        normalizePhraseTaskLocaleSuffix(jobPart.targetLang) === parsed.taskLocaleSuffix,
    ) ?? null
  );
}

export function filterPhraseKeysForJobScope<T extends { tags: string[] }>(input: {
  keys: T[];
  jobTag: string | null;
}) {
  if (!input.jobTag) {
    return input.keys;
  }

  const scoped = input.keys.filter((key) => key.tags.includes(input.jobTag as string));
  return scoped.length > 0 ? scoped : input.keys;
}
