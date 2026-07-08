"use client";

import { FormattedMessage } from "react-intl";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/primitives/cn";

import { CatMessagePreview, CatTargetEditor } from "@/components/cat/editor/cat-target-editor";
import type { CatSegment } from "@/components/cat/shared/types";

export function CatSideBySideRow({
  segment,
  isFocused,
  isHovered,
  isDirty,
  canEdit,
  isTargetLoading,
  onFocus,
  onHover,
  onLeave,
  onTargetChange,
}: {
  segment: CatSegment;
  isFocused: boolean;
  isHovered: boolean;
  isDirty: boolean;
  canEdit: boolean;
  isTargetLoading: boolean;
  onFocus: () => void;
  onHover: () => void;
  onLeave: () => void;
  onTargetChange: (value: string) => void;
}) {
  const isActive = isFocused || isHovered;

  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-0 border-b border-border transition-colors",
        isActive && "bg-grove-500/5",
        isFocused && "ring-1 ring-inset ring-grove-400/30",
      )}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onFocus={onFocus}
    >
      <div className="flex min-w-0 flex-col gap-1 border-r border-border px-4 py-3">
        <p className="text-sm leading-relaxed text-foreground">
          <CatMessagePreview message={segment.sourceText} />
        </p>
        <p className="truncate font-mono text-[11px] text-muted-foreground" title={segment.key}>
          {segment.key}
        </p>
      </div>

      <div className="min-w-0 px-4 py-2.5">
        {isFocused && canEdit ? (
          isTargetLoading && !segment.targetText.trim() ? (
            <Skeleton className="h-10 w-full rounded-lg" />
          ) : (
            <CatTargetEditor
              sourceText={segment.sourceText}
              value={segment.targetText}
              maxLength={segment.maxLength}
              compact
              onChange={onTargetChange}
            />
          )
        ) : (
          <button type="button" className="w-full text-left" onClick={onFocus}>
            {isTargetLoading && !segment.targetText.trim() ? (
              <Skeleton className="h-6 w-3/4 rounded-full" />
            ) : segment.targetText.trim() ? (
              <p className="text-sm leading-relaxed text-foreground">
                <CatMessagePreview message={segment.targetText} />
              </p>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                <FormattedMessage
                  defaultMessage="Click to translate"
                  id="G3IbmWT2r1"
                  description="Placeholder when a side-by-side row has no translation yet"
                />
              </p>
            )}
          </button>
        )}
        {isDirty ? (
          <span className="mt-1 inline-block size-1.5 rounded-full bg-bud-400" aria-hidden />
        ) : null}
      </div>
    </div>
  );
}
