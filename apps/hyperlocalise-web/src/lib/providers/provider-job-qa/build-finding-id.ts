import type { ProviderQaFinding } from "./types";

export function buildFindingId(finding: ProviderQaFinding): string {
  const { externalStringId, key, locale, field } = finding.item;
  return [
    externalStringId,
    key,
    locale ?? "",
    field ?? "",
    finding.checkType,
    finding.message,
  ].join("|");
}
