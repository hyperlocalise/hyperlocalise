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
import type { MessageDescriptor } from "react-intl";
import { FormattedMessage, useIntl } from "react-intl";

import { cn } from "@/lib/primitives/cn";

import { contentEditorSegmentStatusMessages } from "@/components/content-editor/shared/content-editor.messages";
import type { ContentEditorSegmentStatus } from "@/components/content-editor/shared/types";

function getSegmentStatusMessage(status: ContentEditorSegmentStatus): MessageDescriptor {
  switch (status) {
    case "reviewed":
      return contentEditorSegmentStatusMessages.reviewed;
    case "needs_review":
      return contentEditorSegmentStatusMessages.needsReview;
    case "skipped":
      return contentEditorSegmentStatusMessages.skipped;
    default:
      return contentEditorSegmentStatusMessages.pending;
  }
}

function queueStatusDotClassName(status: ContentEditorSegmentStatus) {
  if (status === "reviewed") {
    return "size-2.5 rounded-full bg-grove-300";
  }

  if (status === "needs_review") {
    return "size-2.5 rounded-full bg-beam-700";
  }

  return "size-2.5 rounded-full border border-input";
}

function segmentStatusPillClassName(status: ContentEditorSegmentStatus) {
  switch (status) {
    case "reviewed":
      return "bg-grove-100 text-grove-900 dark:bg-grove-500/15 dark:text-grove-300";
    case "needs_review":
      return "bg-beam-100 text-beam-900 dark:bg-warning/20 dark:text-warning-foreground";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function segmentStatusPillDotClassName(status: ContentEditorSegmentStatus) {
  switch (status) {
    case "reviewed":
      return "bg-grove-700 dark:bg-grove-300";
    case "needs_review":
      return "bg-beam-700 dark:bg-warning";
    default:
      return "border border-muted-foreground/60 bg-transparent";
  }
}

/**
 * Hidden TMS strings are not translator work. Prefer the Hidden badge over
 * the Untranslated (pending) status label so they are not confused.
 */
export function shouldShowSegmentStatusBadge(
  status: ContentEditorSegmentStatus,
  isHidden?: boolean,
) {
  return !(isHidden === true && status === "pending");
}

export function QueueStatusDot({ status }: { status: ContentEditorSegmentStatus }) {
  const intl = useIntl();
  const statusLabel = intl.formatMessage(getSegmentStatusMessage(status));

  return (
    <span
      role="img"
      aria-label={intl.formatMessage(contentEditorSegmentStatusMessages.statusDotAria, {
        status: statusLabel,
      })}
      className={queueStatusDotClassName(status)}
    />
  );
}

export function SegmentStatusBadge({ status }: { status: ContentEditorSegmentStatus }) {
  return (
    <span
      data-slot="segment-status-badge"
      data-status={status}
      className={cn(
        "inline-flex h-6 w-fit shrink-0 items-center gap-1.5 rounded-full ps-2 pe-2.5 text-xs font-semibold whitespace-nowrap",
        segmentStatusPillClassName(status),
      )}
    >
      <span
        aria-hidden
        className={cn("size-2 shrink-0 rounded-full", segmentStatusPillDotClassName(status))}
      />
      <FormattedMessage {...getSegmentStatusMessage(status)} />
    </span>
  );
}
