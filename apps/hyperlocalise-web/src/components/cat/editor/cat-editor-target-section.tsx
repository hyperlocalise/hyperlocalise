"use client";

import { useMemo } from "react";
import { FormattedMessage } from "react-intl";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import { analyzeCatMessageFormat } from "@/components/cat/message-format/cat-message-format";
import { catEditorPanelMessages } from "@/components/cat/shared/cat.messages";
import type { CatSegment } from "@/components/cat/shared/types";

import { CatIcuStructureSummary, CatTargetEditor } from "./cat-target-editor";

export function CatEditorTargetSection({
  segment,
  canEditTarget,
  isLoading = false,
  onTargetChange,
  onCopySource,
  onClearTarget,
}: {
  segment: CatSegment;
  canEditTarget: boolean;
  isLoading?: boolean;
  onTargetChange: (value: string) => void;
  onCopySource: () => void;
  onClearTarget: () => void;
}) {
  const sourceMessageAnalysis = useMemo(
    () => analyzeCatMessageFormat(segment.sourceText),
    [segment.sourceText],
  );

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-medium text-muted-foreground">
          <FormattedMessage
            {...catEditorPanelMessages.targetHeading}
            values={{ locale: segment.targetLocale }}
          />
        </h3>
        {canEditTarget ? (
          <div className="flex flex-wrap items-center gap-1">
            <Button variant="ghost" size="sm" onClick={onCopySource} disabled={isLoading}>
              <FormattedMessage {...catEditorPanelMessages.copySource} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearTarget}
              disabled={isLoading || segment.targetText.length === 0}
            >
              <FormattedMessage {...catEditorPanelMessages.clearTarget} />
            </Button>
          </div>
        ) : null}
      </div>
      {isLoading ? (
        <Skeleton className="h-28 w-full rounded-md" />
      ) : (
        <CatTargetEditor
          key={segment.id}
          sourceText={segment.sourceText}
          value={segment.targetText}
          maxLength={segment.maxLength}
          onChange={onTargetChange}
          disabled={!canEditTarget}
        />
      )}
      <CatIcuStructureSummary blocks={sourceMessageAnalysis.icuBlocks} />
    </section>
  );
}
