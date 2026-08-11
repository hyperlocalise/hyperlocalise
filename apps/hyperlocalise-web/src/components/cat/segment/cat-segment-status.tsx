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

import { catSegmentStatusMessages } from "@/components/cat/shared/cat.messages";
import type { CatSegmentStatus } from "@/components/cat/shared/types";

import { catToneClass, segmentStatusTone } from "./cat-tone";

function getSegmentStatusMessage(status: CatSegmentStatus): MessageDescriptor {
  switch (status) {
    case "reviewed":
      return catSegmentStatusMessages.reviewed;
    case "needs_review":
      return catSegmentStatusMessages.needsReview;
    case "skipped":
      return catSegmentStatusMessages.skipped;
    default:
      return catSegmentStatusMessages.pending;
  }
}

function queueStatusDotClassName(status: CatSegmentStatus) {
  if (status === "reviewed") {
    return "size-2.5 rounded-full bg-grove-300";
  }

  if (status === "needs_review") {
    return "size-2.5 rounded-full bg-beam-700";
  }

  return "size-2.5 rounded-full border border-input";
}

function segmentStatusBadgeVariant(status: CatSegmentStatus) {
  if (status === "needs_review") {
    return "warning" as const;
  }

  return "outline" as const;
}

export function QueueStatusDot({ status }: { status: CatSegmentStatus }) {
  const intl = useIntl();
  const statusLabel = intl.formatMessage(getSegmentStatusMessage(status));

  return (
    <span
      role="img"
      aria-label={intl.formatMessage(catSegmentStatusMessages.statusDotAria, {
        status: statusLabel,
      })}
      className={queueStatusDotClassName(status)}
    />
  );
}

export function SegmentStatusBadge({ status }: { status: CatSegmentStatus }) {
  const variant = segmentStatusBadgeVariant(status);
  const toneClass =
    variant === "outline" && status !== "pending"
      ? cn(catToneClass(segmentStatusTone(status)))
      : undefined;

  return (
    <Badge variant={variant} className={toneClass}>
      <FormattedMessage {...getSegmentStatusMessage(status)} />
    </Badge>
  );
}
