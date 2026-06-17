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

export function encodeProviderProjectId(input: EncodedProviderProjectId) {
  return `ext:${input.providerKind}:${input.externalProjectId}`;
}

export function encodeProviderJobId(input: EncodedProviderJobId) {
  return `ext:${input.providerKind}:${input.externalProjectId}:${input.externalJobId}`;
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
