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
import { PauseIcon, PlayIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { cn } from "@/lib/primitives/cn";

import type { ContentOpsMockTabId } from "./content-ops-mock-stage.messages";
import { contentOpsMockStageMessages } from "./content-ops-mock-stage.messages";

export type ContentOpsActivityItem = {
  time: string;
  source: string;
  message: string;
};

export function ContentOpsActivityFeed({
  items,
  autoplayEnabled,
  onAutoplayToggle,
  className,
}: {
  items: ContentOpsActivityItem[];
  autoplayEnabled: boolean;
  onAutoplayToggle: () => void;
  className?: string;
}) {
  const intl = useIntl();

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border/70 bg-muted/20 px-4 py-3",
        className,
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          <FormattedMessage {...contentOpsMockStageMessages.activityTitle} />
        </span>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 text-[10px] font-medium",
              autoplayEnabled ? "text-primary" : "text-muted-foreground",
            )}
          >
            {autoplayEnabled ? (
              <span className="size-1.5 animate-pulse rounded-full bg-primary" aria-hidden />
            ) : null}
            {autoplayEnabled ? (
              <FormattedMessage {...contentOpsMockStageMessages.activityLive} />
            ) : (
              <FormattedMessage {...contentOpsMockStageMessages.activityPaused} />
            )}
          </span>
          <button
            type="button"
            onClick={onAutoplayToggle}
            className="inline-flex size-6 cursor-pointer items-center justify-center rounded-md border border-border/60 bg-background text-muted-foreground transition-colors hover:border-border hover:text-foreground"
            aria-label={intl.formatMessage(
              autoplayEnabled
                ? contentOpsMockStageMessages.activityAutoplayPause
                : contentOpsMockStageMessages.activityAutoplayResume,
            )}
          >
            <HugeiconsIcon
              icon={autoplayEnabled ? PauseIcon : PlayIcon}
              strokeWidth={2}
              className="size-3"
            />
          </button>
        </div>
      </div>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={`${item.time}-${item.source}-${item.message}`} className="flex gap-3 text-xs">
            <span className="w-8 shrink-0 font-mono text-[10px] text-muted-foreground/70">
              {item.time}
            </span>
            <span className="w-16 shrink-0 font-medium text-muted-foreground">{item.source}</span>
            <span className="min-w-0 text-foreground/85">{item.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type { ContentOpsMockTabId };
