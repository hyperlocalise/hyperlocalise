"use client";

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

  return "size-2.5 rounded-full border border-foreground/25";
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
  return (
    <Badge variant="outline" className={cn(catToneClass(segmentStatusTone(status)))}>
      <FormattedMessage {...getSegmentStatusMessage(status)} />
    </Badge>
  );
}
