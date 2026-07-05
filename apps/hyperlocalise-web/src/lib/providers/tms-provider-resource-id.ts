import type { ExternalTmsProviderKind } from "@/lib/providers/contracts/external-tms-provider-kind";
import { normalizeProjectId } from "@/lib/projects/identity/project-id";

const externalTmsProviderKinds = new Set<ExternalTmsProviderKind>([
  "crowdin",
  "smartling",
  "phrase",
  "lokalise",
]);

function isExternalTmsProviderKind(value: string): value is ExternalTmsProviderKind {
  return externalTmsProviderKinds.has(value as ExternalTmsProviderKind);
}

export type EncodedProviderProjectId = {
  providerKind: ExternalTmsProviderKind;
  externalProjectId: string;
};

export type EncodedProviderJobId = EncodedProviderProjectId & {
  externalJobId: string;
};

export type LiveProviderMemoryId = {
  providerKind: ExternalTmsProviderKind;
  externalMemoryId: string;
};

export type LiveProviderGlossaryId = {
  providerKind: ExternalTmsProviderKind;
  externalGlossaryId: string;
};

export type LiveProviderResourceId = LiveProviderMemoryId | LiveProviderGlossaryId;

export function encodeProviderProjectId(input: EncodedProviderProjectId) {
  return `ext:${input.providerKind}:${input.externalProjectId}`;
}

export function encodeProviderJobId(input: EncodedProviderJobId) {
  return `ext:${input.providerKind}:${input.externalProjectId}:${input.externalJobId}`;
}

function parseLiveProviderResourceIdParts(value: string, resourceKind: "tm" | "glossary") {
  for (const providerKind of externalTmsProviderKinds) {
    const prefix = `${providerKind}:${resourceKind}:`;
    if (!value.startsWith(prefix)) {
      continue;
    }

    const externalResourceId = value.slice(prefix.length);
    if (!externalResourceId) {
      return null;
    }

    return { providerKind, externalResourceId };
  }

  return null;
}

export function parseLiveProviderMemoryId(
  value: string | null | undefined,
): LiveProviderMemoryId | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  const parsed = parseLiveProviderResourceIdParts(value, "tm");
  if (!parsed) {
    return null;
  }

  return {
    providerKind: parsed.providerKind,
    externalMemoryId: parsed.externalResourceId,
  };
}

export function parseLiveProviderGlossaryId(
  value: string | null | undefined,
): LiveProviderGlossaryId | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  const parsed = parseLiveProviderResourceIdParts(value, "glossary");
  if (!parsed) {
    return null;
  }

  return {
    providerKind: parsed.providerKind,
    externalGlossaryId: parsed.externalResourceId,
  };
}

export function isLiveProviderMemoryId(value: string | null | undefined) {
  return parseLiveProviderMemoryId(value) !== null;
}

export function isLiveProviderGlossaryId(value: string | null | undefined) {
  return parseLiveProviderGlossaryId(value) !== null;
}

export function isLiveProviderResourceId(value: string | null | undefined) {
  return isLiveProviderMemoryId(value) || isLiveProviderGlossaryId(value);
}

function parseProviderKindAndRemainder(value: string) {
  const remainder = value.slice("ext:".length);
  const kindSeparator = remainder.indexOf(":");
  if (kindSeparator === -1) {
    return null;
  }

  const providerKind = remainder.slice(0, kindSeparator);
  const afterKind = remainder.slice(kindSeparator + 1);
  if (!providerKind || !afterKind || !isExternalTmsProviderKind(providerKind)) {
    return null;
  }

  return { providerKind, afterKind };
}

export function parseProviderProjectId(
  value: string | null | undefined,
): EncodedProviderProjectId | null {
  const normalizedValue = normalizeProjectId(value);
  if (typeof normalizedValue !== "string" || !normalizedValue.startsWith("ext:")) {
    return null;
  }

  const parsed = parseProviderKindAndRemainder(normalizedValue);
  if (!parsed) {
    return null;
  }

  return { providerKind: parsed.providerKind, externalProjectId: parsed.afterKind };
}

export function isEncodedProviderProjectId(value: string | null | undefined) {
  return parseProviderProjectId(value) !== null;
}

export function parseProviderJobId(value: string | null | undefined): EncodedProviderJobId | null {
  const normalizedValue = normalizeProjectId(value);
  if (typeof normalizedValue !== "string" || !normalizedValue.startsWith("ext:")) {
    return null;
  }

  const parsed = parseProviderKindAndRemainder(normalizedValue);
  if (!parsed) {
    return null;
  }

  const lastColon = parsed.afterKind.lastIndexOf(":");
  if (lastColon === -1) {
    return null;
  }

  const externalProjectId = parsed.afterKind.slice(0, lastColon);
  const externalJobId = parsed.afterKind.slice(lastColon + 1);
  if (!externalProjectId || !externalJobId) {
    return null;
  }

  return {
    providerKind: parsed.providerKind,
    externalProjectId,
    externalJobId,
  };
}

export function resolveJobProjectId(
  projectId: string | null | undefined,
  jobId: string,
): string | null {
  const normalizedProjectId = normalizeProjectId(projectId);
  if (typeof normalizedProjectId === "string" && normalizedProjectId.length > 0) {
    return normalizedProjectId;
  }

  const parsedJobId = parseProviderJobId(jobId);
  if (!parsedJobId) {
    return null;
  }

  return encodeProviderProjectId({
    providerKind: parsedJobId.providerKind,
    externalProjectId: parsedJobId.externalProjectId,
  });
}

export function resolveEncodedProviderJobId(input: {
  jobId: string;
  projectId: string | null;
  externalProviderKind: string | null;
  externalJobId: string | null;
  externalTaskId: string | null;
}): string | null {
  const parsedJobId = parseProviderJobId(input.jobId);
  if (parsedJobId) {
    return input.jobId;
  }

  if (!input.externalProviderKind || !input.projectId) {
    return null;
  }

  const parsedProjectId = parseProviderProjectId(input.projectId);
  if (!parsedProjectId) {
    return null;
  }

  if (parsedProjectId.providerKind !== input.externalProviderKind) {
    return null;
  }

  const externalJobId = input.externalJobId ?? input.externalTaskId;
  if (!externalJobId) {
    return null;
  }

  return encodeProviderJobId({
    providerKind: parsedProjectId.providerKind,
    externalProjectId: parsedProjectId.externalProjectId,
    externalJobId,
  });
}
