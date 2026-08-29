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
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { ContentEditorHiddenStringBadge } from "@/components/content-editor/segment/content-editor-hidden-string-badge";
import { ContentEditorLockedStringBadge } from "@/components/content-editor/segment/content-editor-locked-string-badge";
import {
  SegmentStatusBadge,
  shouldShowSegmentStatusBadge,
} from "@/components/content-editor/segment/content-editor-segment-status";
import { ContentEditorShareSegmentButton } from "@/components/content-editor/segment/content-editor-share-segment-button";
import {
  contentEditorEditorPanelMessages,
  contentEditorLockedStringMessages,
} from "@/components/content-editor/shared/content-editor.messages";
import type { ContentEditorSegment } from "@/components/content-editor/shared/types";

import { getCatShortcutLabel } from "./content-editor-keyboard-shortcuts";

export function ContentEditorEditorHeader({
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
  canEditTranslations = false,
  onToggleLocked,
}: {
  segment: ContentEditorSegment;
  segmentPosition: number;
  totalSegments: number;
  isTargetDirty: boolean;
  segmentShareUrl: string | null;
  hasPreviousSegment: boolean;
  hasNextSegment: boolean;
  isMac: boolean;
  onPrevious: () => void;
  onNext: () => void;
  canEditTranslations?: boolean;
  onToggleLocked?: () => void;
}) {
  const intl = useIntl();

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 lg:px-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          <FormattedMessage
            {...contentEditorEditorPanelMessages.segmentPosition}
            values={{
              position: String(segmentPosition).padStart(2, "0"),
              total: String(totalSegments).padStart(2, "0"),
            }}
          />
        </span>
        {shouldShowSegmentStatusBadge(segment.status, segment.isHidden) ? (
          <SegmentStatusBadge status={segment.status} />
        ) : null}
        {segment.isHidden ? <ContentEditorHiddenStringBadge /> : null}
        {segment.isLocked ? <ContentEditorLockedStringBadge /> : null}
        {isTargetDirty ? (
          <Badge variant="outline" className="border-bud-500/40 bg-bud-500/10 text-bud-300">
            <FormattedMessage {...contentEditorEditorPanelMessages.unsavedChanges} />
          </Badge>
        ) : null}
      </div>
      <div className="flex items-center gap-1">
        {canEditTranslations && onToggleLocked ? (
          <Button variant="outline" size="xs" onClick={onToggleLocked}>
            <FormattedMessage
              {...(segment.isLocked
                ? contentEditorLockedStringMessages.unlock
                : contentEditorLockedStringMessages.lock)}
            />
          </Button>
        ) : null}
        {segmentShareUrl ? (
          <ContentEditorShareSegmentButton segmentShareUrl={segmentShareUrl} />
        ) : null}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onPrevious}
          disabled={!hasPreviousSegment}
          aria-label={intl.formatMessage(contentEditorEditorPanelMessages.previousSegmentAria)}
          title={intl.formatMessage(contentEditorEditorPanelMessages.previousSegmentTitle, {
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
          aria-label={intl.formatMessage(contentEditorEditorPanelMessages.nextSegmentAria)}
          title={intl.formatMessage(contentEditorEditorPanelMessages.nextSegmentTitle, {
            shortcut: getCatShortcutLabel(isMac, "next"),
          })}
        >
          <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
        </Button>
      </div>
    </div>
  );
}
