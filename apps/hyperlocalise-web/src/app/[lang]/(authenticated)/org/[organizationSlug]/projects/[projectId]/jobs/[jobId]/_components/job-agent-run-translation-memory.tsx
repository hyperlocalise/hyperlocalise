"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { useIntl } from "react-intl";

import { Badge } from "@/components/ui/badge";
import type { AgentRunTranslationMemoryMatchUsage } from "@/lib/translation/translation-memory-match";
import {
  formatTranslationMemoryMatchSourceLabel,
  formatTranslationMemoryResourceLabel,
} from "@/lib/translation/agent-run-translation-memory";
import { cn } from "@/lib/primitives/cn";

import { toneClass } from "../../../../../_components/workspace-resource-shared";
import { jobAgentRunTranslationMemoryMessages as messages } from "./job-agent-run-translation-memory.messages";

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
  const intl = useIntl();

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
          title={
            match.matchScore !== null
              ? intl.formatMessage(messages.tmMatchTitleWithScore, {
                  memoryName: match.memoryName,
                  sourceText: match.sourceText,
                  targetText: match.targetText,
                  matchScore: match.matchScore,
                })
              : intl.formatMessage(messages.tmMatchTitle, {
                  memoryName: match.memoryName,
                  sourceText: match.sourceText,
                  targetText: match.targetText,
                })
          }
        >
          {match.matchScore !== null
            ? intl.formatMessage(messages.tmBadgeLabelWithScore, {
                source: formatTranslationMemoryMatchSourceLabel(match),
                memoryName: match.memoryName,
                matchScore: match.matchScore,
              })
            : intl.formatMessage(messages.tmBadgeLabel, {
                source: formatTranslationMemoryMatchSourceLabel(match),
                memoryName: match.memoryName,
              })}
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
  const intl = useIntl();

  if (matches.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {intl.formatMessage(messages.translationMemoryUsed)}
      </p>
      <ul className="space-y-2">
        {matches.map((match, index) => (
          <li
            key={`${match.memoryId}:${match.targetLocale}:${index}`}
            className="space-y-1 text-sm text-subtle-foreground"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-foreground">{match.memoryName}</span>
              <Badge
                variant="outline"
                className={cn("rounded-full", toneClass(matchSourceTone(match.matchSource)))}
              >
                {formatTranslationMemoryResourceLabel(match)}
              </Badge>
              {match.matchScore !== null ? (
                <span className="text-xs text-muted-foreground">
                  {intl.formatMessage(messages.matchScorePercent, {
                    matchScore: match.matchScore,
                  })}
                </span>
              ) : null}
            </div>
            <p className="text-xs whitespace-pre-wrap text-muted-foreground">
              {intl.formatMessage(messages.tmTextPair, {
                sourceText: match.sourceText,
                targetText: match.targetText,
              })}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
