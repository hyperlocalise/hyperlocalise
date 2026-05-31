"use client";

import { Badge } from "@/components/ui/badge";
import type { AgentRunTranslationMemoryMatchUsage } from "@/lib/translation/translation-memory-match";
import {
  formatTranslationMemoryMatchSourceLabel,
  formatTranslationMemoryResourceLabel,
} from "@/lib/translation/agent-run-translation-memory";
import { cn } from "@/lib/primitives/cn";

import { toneClass } from "../../../_components/workspace-resource-shared";

function matchSourceTone(matchSource: AgentRunTranslationMemoryMatchUsage["matchSource"]) {
  return matchSource === "synced_database" ? "safe" : "info";
}

export function TranslationMemoryMatchBadges({
  matches,
  className,
}: {
  matches: AgentRunTranslationMemoryMatchUsage[];
  className?: string;
}) {
  if (matches.length === 0) {
    return null;
  }

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {matches.map((match, index) => (
        <Badge
          key={`${match.memoryId}:${match.targetLocale}:${index}`}
          variant="outline"
          className={cn("rounded-full", toneClass(matchSourceTone(match.matchSource)))}
          title={`${match.memoryName} · ${match.sourceText} → ${match.targetText}${
            match.matchScore !== null ? ` (${match.matchScore}%)` : ""
          }`}
        >
          {formatTranslationMemoryMatchSourceLabel(match)} · {match.memoryName}
          {match.matchScore !== null ? ` · ${match.matchScore}%` : ""}
        </Badge>
      ))}
    </div>
  );
}

export function TranslationMemoryMatchesDetail({
  matches,
}: {
  matches: AgentRunTranslationMemoryMatchUsage[];
}) {
  if (matches.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2 rounded-md border border-foreground/8 bg-foreground/2 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-foreground/42">
        Translation memory used
      </p>
      <ul className="space-y-2">
        {matches.map((match, index) => (
          <li
            key={`${match.memoryId}:${match.targetLocale}:${index}`}
            className="space-y-1 text-sm text-foreground/74"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-foreground/86">{match.memoryName}</span>
              <Badge
                variant="outline"
                className={cn("rounded-full", toneClass(matchSourceTone(match.matchSource)))}
              >
                {formatTranslationMemoryResourceLabel(match)}
              </Badge>
              {match.matchScore !== null ? (
                <span className="text-xs text-foreground/48">{match.matchScore}% match</span>
              ) : null}
            </div>
            <p className="text-xs whitespace-pre-wrap text-foreground/58">
              {match.sourceText} → {match.targetText}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
