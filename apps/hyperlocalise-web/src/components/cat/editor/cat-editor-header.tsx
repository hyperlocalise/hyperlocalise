"use client";

import { useState } from "react";
import { ArrowLeft01Icon, ArrowRight01Icon, LinkSquare02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { CheckIcon } from "lucide-react";
import { FormattedMessage, useIntl } from "react-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { SegmentStatusBadge } from "@/components/cat/segment/cat-segment-status";
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
  const [shareLinkState, setShareLinkState] = useState<"idle" | "copied" | "error">("idle");

  async function handleShareSegment() {
    if (!segmentShareUrl) {
      return;
    }

    if (typeof window === "undefined" || !navigator?.clipboard?.writeText) {
      setShareLinkState("error");
      return;
    }

    try {
      await navigator.clipboard.writeText(segmentShareUrl);
      setShareLinkState("copied");
      window.setTimeout(() => setShareLinkState("idle"), 2000);
    } catch {
      setShareLinkState("error");
      window.setTimeout(() => setShareLinkState("idle"), 2000);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 lg:px-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          {String(segmentPosition).padStart(2, "0")} / {String(totalSegments).padStart(2, "0")}
        </span>
        <SegmentStatusBadge status={segment.status} />
        {isTargetDirty ? (
          <Badge variant="outline" className="border-bud-500/40 bg-bud-500/10 text-bud-300">
            <FormattedMessage {...catEditorPanelMessages.unsavedChanges} />
          </Badge>
        ) : null}
      </div>
      <div className="flex items-center gap-1">
        {segmentShareUrl ? (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void handleShareSegment()}
            aria-label={intl.formatMessage(catEditorPanelMessages.shareSegmentAria)}
            title={
              shareLinkState === "copied"
                ? intl.formatMessage(catEditorPanelMessages.shareSegmentCopied)
                : shareLinkState === "error"
                  ? intl.formatMessage(catEditorPanelMessages.shareSegmentFailed)
                  : intl.formatMessage(catEditorPanelMessages.shareSegment)
            }
          >
            {shareLinkState === "copied" ? (
              <CheckIcon className="size-4" />
            ) : (
              <HugeiconsIcon icon={LinkSquare02Icon} className="size-4" />
            )}
          </Button>
        ) : null}
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
