import { createHash } from "node:crypto";

import type { ProviderQaFinding } from "./types";

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
  return createHash("sha256").update(payload).digest("hex");
}
