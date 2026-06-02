import type { ProviderQaFinding } from "./types";

function hashString(input: string): string {
  let first = 0x811c9dc5;
  let second = 0x01000193;

  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    first ^= code;
    second ^= code + index;
    first = Math.imul(first, 0x01000193);
    second = Math.imul(second, 0x85ebca6b);
  }

  return [first, second].map((value) => (value >>> 0).toString(16).padStart(8, "0")).join("");
}

export function buildFindingId(finding: ProviderQaFinding): string {
  const { externalStringId, key, locale, field } = finding.item;
  const payload = JSON.stringify([
    externalStringId,
    key,
    locale ?? "",
    field ?? "",
    finding.checkType,
    finding.message,
  ]);
  return hashString(payload);
}
