"use client";

import { Badge } from "@/components/ui/badge";
import type { AgentRunGlossaryMatchUsage } from "@/lib/translation/glossary-match";
import {
  formatGlossaryMatchSourceLabel,
  formatGlossaryResourceLabel,
  formatGlossaryTermStatusLabel,
} from "@/lib/translation/agent-run-glossary";
import { cn } from "@/lib/primitives/cn";

import { toneClass } from "../../../_components/workspace-resource-shared";

function matchSourceTone(matchSource: AgentRunGlossaryMatchUsage["matchSource"]) {
  return matchSource === "synced_database" ? "safe" : "info";
}

function termStatusTone(match: AgentRunGlossaryMatchUsage) {
  if (match.forbidden) {
    return "risk";
  }

  if (match.preferred) {
    return "safe";
  }

  return "watch";
}

export function GlossaryMatchBadges({
  matches,
  className,
}: {
  matches: AgentRunGlossaryMatchUsage[];
  className?: string;
}) {
  if (matches.length === 0) {
    return null;
  }

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {matches.map((match, index) => (
        <Badge
          key={`${match.glossaryId}:${match.targetLocale}:${index}`}
          variant="outline"
          className={cn("rounded-full", toneClass(matchSourceTone(match.matchSource)))}
          title={`${match.glossaryName} · ${match.sourceTerm} → ${match.targetTerm} · ${formatGlossaryTermStatusLabel(match)}`}
        >
          {formatGlossaryMatchSourceLabel(match)} · {match.glossaryName} ·{" "}
          {formatGlossaryTermStatusLabel(match)}
        </Badge>
      ))}
    </div>
  );
}

export function GlossaryMatchesDetail({ matches }: { matches: AgentRunGlossaryMatchUsage[] }) {
  if (matches.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2 rounded-md border border-foreground/8 bg-foreground/2 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-foreground/42">
        Glossary terms used
      </p>
      <ul className="space-y-2">
        {matches.map((match, index) => (
          <li
            key={`${match.glossaryId}:${match.targetLocale}:${index}`}
            className="space-y-1 text-sm text-foreground/74"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-foreground/86">{match.glossaryName}</span>
              <Badge
                variant="outline"
                className={cn("rounded-full", toneClass(matchSourceTone(match.matchSource)))}
              >
                {formatGlossaryResourceLabel(match)}
              </Badge>
              <Badge
                variant="outline"
                className={cn("rounded-full", toneClass(termStatusTone(match)))}
              >
                {formatGlossaryTermStatusLabel(match)}
              </Badge>
            </div>
            <p className="text-xs whitespace-pre-wrap text-foreground/58">
              {match.sourceTerm} → {match.targetTerm} ({match.targetLocale})
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
