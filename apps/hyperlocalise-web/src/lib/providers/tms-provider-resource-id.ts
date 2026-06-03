import type { ExternalTmsProviderKind } from "@/lib/providers/contracts/external-tms-provider-kind";

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

export function encodeProviderProjectId(input: EncodedProviderProjectId) {
  return `ext:${input.providerKind}:${input.externalProjectId}`;
}

export function encodeProviderJobId(input: EncodedProviderJobId) {
  return `ext:${input.providerKind}:${input.externalProjectId}:${input.externalJobId}`;
}

export function parseProviderProjectId(
  value: string | null | undefined,
): EncodedProviderProjectId | null {
  if (!value?.startsWith("ext:")) {
    return null;
  }

  const parts = value.split(":");
  if (parts.length !== 3) {
    return null;
  }

  const providerKind = parts[1];
  const externalProjectId = parts[2];
  if (!providerKind || !externalProjectId || !isExternalTmsProviderKind(providerKind)) {
    return null;
  }

  return { providerKind, externalProjectId };
}

export function parseProviderJobId(value: string | null | undefined): EncodedProviderJobId | null {
  if (!value?.startsWith("ext:")) {
    return null;
  }

  const parts = value.split(":");
  if (parts.length !== 4) {
    return null;
  }

  const providerKind = parts[1];
  const externalProjectId = parts[2];
  const externalJobId = parts[3];
  if (
    !providerKind ||
    !externalProjectId ||
    !externalJobId ||
    !isExternalTmsProviderKind(providerKind)
  ) {
    return null;
  }

  return { providerKind, externalProjectId, externalJobId };
}
