"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { ScrambleText } from "dot-anime-react";
import { ChevronDownIcon } from "lucide-react";
import { useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { useIntl } from "react-intl";

import { Task, TaskContent, TaskTrigger } from "@/components/ai-elements/task";
import {
  getExploreRollupStats,
  getToolName,
  getToolPartSubject,
  isToolPartFailed,
  isToolPartRunning,
  type ToolPart,
} from "./tool-activity";
import { toolActivityMessages } from "./tool-activity.messages";

function formatLiveExploreLabel(intl: ReturnType<typeof useIntl>, part: ToolPart): string {
  const toolName = getToolName(part);
  const detail = getToolPartSubject(part);

  switch (toolName) {
    case "grep":
    case "fuzzySearch":
      return detail
        ? intl.formatMessage(toolActivityMessages.searchingDetail, { detail })
        : intl.formatMessage(toolActivityMessages.searching);
    case "read":
      return detail
        ? intl.formatMessage(toolActivityMessages.readingDetail, { detail })
        : intl.formatMessage(toolActivityMessages.reading);
    case "glob":
      return detail
        ? intl.formatMessage(toolActivityMessages.findingDetail, { detail })
        : intl.formatMessage(toolActivityMessages.findingFiles);
    case "detectRepoConfig":
      return intl.formatMessage(toolActivityMessages.checkingRepoConfig);
    case "gitHistory":
      return intl.formatMessage(toolActivityMessages.checkingGitHistory);
    default:
      return intl.formatMessage(toolActivityMessages.working);
  }
}

function formatExploreRollupLabel(
  intl: ReturnType<typeof useIntl>,
  parts: ToolPart[],
  hasFailed: boolean,
): string {
  const { subject, readCount, onlyReads, count } = getExploreRollupStats(parts);

  if (hasFailed) {
    return subject
      ? intl.formatMessage(toolActivityMessages.exploreFailedSubject, { subject })
      : intl.formatMessage(toolActivityMessages.exploreFailed);
  }

  if (onlyReads) {
    if (readCount === 1 && subject) {
      return intl.formatMessage(toolActivityMessages.openedFile, { subject });
    }
    return intl.formatMessage(toolActivityMessages.openedFiles, {
      count: readCount || parts.length,
    });
  }

  if (subject) {
    return intl.formatMessage(toolActivityMessages.exploredSubject, { subject, count });
  }
  return intl.formatMessage(toolActivityMessages.exploredCodebase, { count });
}

export function ExploreToolActivity({
  parts,
  renderToolPart,
}: {
  parts: ToolPart[];
  renderToolPart: (part: ToolPart, index: number) => ReactNode;
}) {
  const intl = useIntl();
  const shouldReduceMotion = useReducedMotion();
  const latestPart = parts.at(-1);
  const isLive = parts.some(isToolPartRunning);
  const hasFailed = parts.some(isToolPartFailed);

  if (!latestPart) {
    return null;
  }

  if (isLive) {
    const liveLabel = formatLiveExploreLabel(intl, latestPart);
    return (
      <div
        className="mb-1 min-w-0 py-0.5 text-sm text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        <ScrambleText
          key={`${latestPart.toolCallId}:${liveLabel}`}
          text={liveLabel}
          duration={600}
          interval={28}
          animate={!shouldReduceMotion}
          className="block truncate"
        />
      </div>
    );
  }

  const rollupLabel = formatExploreRollupLabel(intl, parts, hasFailed);

  return (
    <Task defaultOpen={hasFailed} className="mb-1 w-full">
      <TaskTrigger title={rollupLabel} className="w-full">
        <div
          className={
            hasFailed
              ? "flex w-full min-w-0 cursor-pointer items-center gap-1.5 py-0.5 text-start text-sm text-destructive transition-colors hover:text-destructive/90"
              : "flex w-full min-w-0 cursor-pointer items-center gap-1.5 py-0.5 text-start text-sm text-muted-foreground transition-colors hover:text-foreground"
          }
        >
          <span className="min-w-0 truncate">{rollupLabel}</span>
          <ChevronDownIcon className="size-3.5 shrink-0 opacity-0 transition-all group-hover:opacity-100 group-data-[state=open]:rotate-180 group-data-[state=open]:opacity-100" />
        </div>
      </TaskTrigger>
      <TaskContent className="text-sm [&_>div]:mt-2 [&_>div]:space-y-0">
        {parts.map((part, index) => renderToolPart(part, index))}
      </TaskContent>
    </Task>
  );
}
