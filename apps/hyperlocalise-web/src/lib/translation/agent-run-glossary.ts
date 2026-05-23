import type { ExternalTmsProviderKind } from "@/lib/providers/organization-external-tms-provider-credentials";
import type {
  AgentRunGlossaryMatchUsage,
  GlossaryMatchSource,
} from "@/lib/translation/glossary-match";

export type AgentRunGlossaryUsageEntry = {
  externalStringId: string;
  key: string;
  matches: AgentRunGlossaryMatchUsage[];
};

function isMatchUsage(value: unknown): value is AgentRunGlossaryMatchUsage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const match = value as AgentRunGlossaryMatchUsage;
  return (
    typeof match.glossaryId === "string" &&
    typeof match.glossaryName === "string" &&
    typeof match.targetLocale === "string" &&
    (match.matchSource === "synced_database" || match.matchSource === "live_provider")
  );
}

function isUsageEntry(value: unknown): value is AgentRunGlossaryUsageEntry {
  if (!value || typeof value !== "object") {
    return false;
  }

  const entry = value as AgentRunGlossaryUsageEntry;
  return (
    typeof entry.externalStringId === "string" &&
    typeof entry.key === "string" &&
    Array.isArray(entry.matches) &&
    entry.matches.every(isMatchUsage)
  );
}

export function parseGlossaryUsageFromOutputSummary(
  outputSummary: Record<string, unknown> | undefined,
): AgentRunGlossaryUsageEntry[] | null {
  if (!outputSummary || !Array.isArray(outputSummary.glossaryUsage)) {
    return null;
  }

  const entries = outputSummary.glossaryUsage.filter(isUsageEntry);
  return entries.length > 0 ? entries : null;
}

export function countGlossaryMatchesInUsage(usage: AgentRunGlossaryUsageEntry[] | null) {
  if (!usage) {
    return 0;
  }

  return usage.reduce((total, entry) => total + entry.matches.length, 0);
}

export function formatGlossaryMatchSourceLabel(input: {
  matchSource: GlossaryMatchSource;
  providerKind: ExternalTmsProviderKind | null;
}) {
  if (input.matchSource === "synced_database") {
    return "Synced database";
  }

  if (input.providerKind) {
    return `Live ${input.providerKind}`;
  }

  return "Live provider";
}

export function formatGlossaryResourceLabel(match: AgentRunGlossaryMatchUsage) {
  const source = formatGlossaryMatchSourceLabel(match);
  const resource =
    match.externalResourceId && match.externalResourceId !== match.resourceId
      ? ` · Glossary ${match.externalResourceId}`
      : "";

  return `${source}${resource}`;
}

export function formatGlossaryTermStatusLabel(match: AgentRunGlossaryMatchUsage) {
  if (match.forbidden) {
    return "Forbidden";
  }

  return "Preferred";
}
