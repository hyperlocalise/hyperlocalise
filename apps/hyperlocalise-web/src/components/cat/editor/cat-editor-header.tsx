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
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { SegmentStatusBadge } from "@/components/cat/segment/cat-segment-status";
import { CatShareSegmentButton } from "@/components/cat/segment/cat-share-segment-button";
import { catEditorPanelMessages } from "@/components/cat/shared/cat.messages";
import type { CatSegment } from "@/components/cat/shared/types";

import { getCatShortcutLabel } from "./cat-keyboard-shortcuts";

export function CatEditorHeader({
  segment,
  segmentPosition,
  totalSegments,
  isTargetDirty,
  segmentShareUrl,
  hasPreviousSegment,
  hasNextSegment,
  isMac,
  onPrevious,
  onNext,
}: {
  segment: CatSegment;
  segmentPosition: number;
  totalSegments: number;
  isTargetDirty: boolean;
  segmentShareUrl: string | null;
  hasPreviousSegment: boolean;
  hasNextSegment: boolean;
  isMac: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const intl = useIntl();

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 lg:px-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          <FormattedMessage
            {...catEditorPanelMessages.segmentPosition}
            values={{
              position: String(segmentPosition).padStart(2, "0"),
              total: String(totalSegments).padStart(2, "0"),
            }}
          />
        </span>
        <SegmentStatusBadge status={segment.status} />
        {isTargetDirty ? (
          <Badge variant="outline" className="border-bud-500/40 bg-bud-500/10 text-bud-300">
            <FormattedMessage {...catEditorPanelMessages.unsavedChanges} />
          </Badge>
        ) : null}
      </div>
      <div className="flex items-center gap-1">
        {segmentShareUrl ? <CatShareSegmentButton segmentShareUrl={segmentShareUrl} /> : null}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onPrevious}
          disabled={!hasPreviousSegment}
          aria-label={intl.formatMessage(catEditorPanelMessages.previousSegmentAria)}
          title={intl.formatMessage(catEditorPanelMessages.previousSegmentTitle, {
            shortcut: getCatShortcutLabel(isMac, "previous"),
          })}
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onNext}
          disabled={!hasNextSegment}
          aria-label={intl.formatMessage(catEditorPanelMessages.nextSegmentAria)}
          title={intl.formatMessage(catEditorPanelMessages.nextSegmentTitle, {
            shortcut: getCatShortcutLabel(isMac, "next"),
          })}
        >
          <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
        </Button>
      </div>
    </div>
  );
}
