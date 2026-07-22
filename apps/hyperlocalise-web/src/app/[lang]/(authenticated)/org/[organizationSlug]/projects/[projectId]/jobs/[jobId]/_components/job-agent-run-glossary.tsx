"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { useIntl } from "react-intl";

import { Badge } from "@/components/ui/badge";
import type { AgentRunGlossaryMatchUsage } from "@/lib/translation/glossary-match";
import {
  formatGlossaryMatchSourceLabel,
  formatGlossaryResourceLabel,
  formatGlossaryTermStatusLabel,
} from "@/lib/translation/agent-run-glossary";
import { cn } from "@/lib/primitives/cn";

import { toneClass } from "../../../../../_components/workspace-resource-shared";
import { jobAgentRunGlossaryMessages as messages } from "./job-agent-run-glossary.messages";

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
  const intl = useIntl();

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
          title={intl.formatMessage(messages.glossaryMatchTitle, {
            glossaryName: match.glossaryName,
            sourceTerm: match.sourceTerm,
            targetTerm: match.targetTerm,
            status: formatGlossaryTermStatusLabel(match),
          })}
        >
          {intl.formatMessage(messages.glossaryBadgeLabel, {
            source: formatGlossaryMatchSourceLabel(match),
            glossaryName: match.glossaryName,
            status: formatGlossaryTermStatusLabel(match),
          })}
        </Badge>
      ))}
    </div>
  );
}

export function GlossaryMatchesDetail({ matches }: { matches: AgentRunGlossaryMatchUsage[] }) {
  const intl = useIntl();

  if (matches.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {intl.formatMessage(messages.glossaryTermsUsed)}
      </p>
      <ul className="space-y-2">
        {matches.map((match, index) => (
          <li
            key={`${match.glossaryId}:${match.targetLocale}:${index}`}
            className="space-y-1 text-sm text-subtle-foreground"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-foreground">{match.glossaryName}</span>
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
            <p className="text-xs whitespace-pre-wrap text-muted-foreground">
              {intl.formatMessage(messages.glossaryTermPair, {
                sourceTerm: match.sourceTerm,
                targetTerm: match.targetTerm,
                targetLocale: match.targetLocale,
              })}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
