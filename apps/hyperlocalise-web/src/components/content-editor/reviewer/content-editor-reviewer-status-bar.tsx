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
import { FormattedMessage, useIntl } from "react-intl";

import { cn } from "@/lib/primitives/cn";

import { contentEditorReviewerMessages } from "./content-editor-reviewer.messages";
import type { ContentEditorReviewerStatusSummary } from "./content-editor-reviewer-status-summary";

function StatusDot({ className }: { className: string }) {
  return <span aria-hidden className={cn("inline-block size-1.5 rounded-full", className)} />;
}

export function ContentEditorReviewerStatusBar({
  summary,
  hasMore = false,
  className,
}: {
  summary: ContentEditorReviewerStatusSummary;
  hasMore?: boolean;
  className?: string;
}) {
  const intl = useIntl();

  return (
    <p
      aria-label={intl.formatMessage(contentEditorReviewerMessages.statusBarLabel)}
      data-testid="reviewer-status-bar"
      className={cn("flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 tabular-nums", className)}
    >
      <span className="font-medium text-foreground">
        <FormattedMessage
          {...contentEditorReviewerMessages.statusTotal}
          values={{ count: summary.total, more: hasMore ? "+" : "" }}
        />
      </span>
      <span className="inline-flex items-center gap-1.5">
        <StatusDot className="bg-grove-500" />
        <FormattedMessage
          {...contentEditorReviewerMessages.statusReviewed}
          values={{ count: summary.reviewed }}
        />
      </span>
      <span className="inline-flex items-center gap-1.5">
        <StatusDot className="bg-amber-500" />
        <FormattedMessage
          {...contentEditorReviewerMessages.statusNeedsReview}
          values={{ count: summary.needsReview }}
        />
      </span>
      <span className="inline-flex items-center gap-1.5">
        <StatusDot className="bg-muted-foreground/50" />
        <FormattedMessage
          {...contentEditorReviewerMessages.statusPending}
          values={{ count: summary.pending }}
        />
      </span>
      {summary.withIssues > 0 ? (
        <span className="inline-flex items-center gap-1.5 text-destructive">
          <StatusDot className="bg-destructive" />
          <FormattedMessage
            {...contentEditorReviewerMessages.statusIssues}
            values={{ count: summary.withIssues }}
          />
        </span>
      ) : null}
    </p>
  );
}
