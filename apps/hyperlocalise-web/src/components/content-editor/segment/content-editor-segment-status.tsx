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

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/primitives/cn";

import { contentEditorSegmentStatusMessages } from "@/components/content-editor/shared/content-editor.messages";
import type { ContentEditorSegmentStatus } from "@/components/content-editor/shared/types";

import { contentEditorToneClass, segmentStatusTone } from "./content-editor-tone";

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

function segmentStatusBadgeVariant(status: ContentEditorSegmentStatus) {
  if (status === "needs_review") {
    return "warning" as const;
  }

  return "outline" as const;
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
  const variant = segmentStatusBadgeVariant(status);
  const toneClass =
    variant === "outline" && status !== "pending"
      ? cn(contentEditorToneClass(segmentStatusTone(status)))
      : undefined;

  return (
    <Badge variant={variant} className={toneClass}>
      <FormattedMessage {...getSegmentStatusMessage(status)} />
    </Badge>
  );
}
