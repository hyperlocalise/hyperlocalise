"use client";

import { useHotkeys } from "react-hotkeys-hook";
import { FormattedMessage } from "react-intl";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useIsMac } from "@/hooks/use-is-mac";
import { cn } from "@/lib/primitives/cn";

import { CatEditorShortcutKbd } from "@/components/cat/editor/cat-editor-shortcut-kbd";
import { CatMessagePreview, CatTargetEditor } from "@/components/cat/editor/cat-target-editor";
import { catEditorPanelMessages } from "@/components/cat/shared/cat.messages";
import type { CatSegment } from "@/components/cat/shared/types";

export function CatSideBySideRow({
  segment,
  isFocused,
  isHovered,
  isDirty,
  canEdit,
  isTargetLoading,
  isApproving = false,
  isSavingDraft = false,
  isPostingComment = false,
  isLookingUpContext = false,
  isAiSuggestionLoading = false,
  isFormatChecksLoading = false,
  onFocus,
  onHover,
  onLeave,
  onTargetChange,
  onApprove,
  onSaveDraft,
}: {
  segment: CatSegment;
  isFocused: boolean;
  isHovered: boolean;
  isDirty: boolean;
  canEdit: boolean;
  isTargetLoading: boolean;
  isApproving?: boolean;
  isSavingDraft?: boolean;
  isPostingComment?: boolean;
  isLookingUpContext?: boolean;
  isAiSuggestionLoading?: boolean;
  isFormatChecksLoading?: boolean;
  onFocus: () => void;
  onHover: () => void;
  onLeave: () => void;
  onTargetChange: (value: string) => void;
  onApprove?: () => void;
  onSaveDraft?: () => void;
}) {
  const isMac = useIsMac();
  const isActive = isFocused || isHovered;
  const hasTargetText = segment.targetText.trim().length > 0;
  const isActionBlocked =
    isApproving ||
    isSavingDraft ||
    isPostingComment ||
    isLookingUpContext ||
    isAiSuggestionLoading ||
    isFormatChecksLoading ||
    isTargetLoading;
  const canTriggerApprove =
    Boolean(onApprove) && canEdit && isDirty && hasTargetText && !isActionBlocked;
  const showDirtyActions = isFocused && isDirty && canEdit && Boolean(onApprove);

  useHotkeys(
    "mod+enter",
    (event) => {
      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLElement &&
        activeElement.dataset.catCommentInput === "true"
      ) {
        return;
      }

      event.preventDefault();
      onApprove?.();
    },
    {
      enabled: isFocused && canTriggerApprove,
      enableOnFormTags: true,
      preventDefault: true,
    },
    [canTriggerApprove, isFocused, onApprove],
  );

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
            <div className="space-y-2">
              <CatTargetEditor
                sourceText={segment.sourceText}
                value={segment.targetText}
                maxLength={segment.maxLength}
                compact
                onChange={onTargetChange}
              />
              {showDirtyActions ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    className="h-8 gap-1.5 px-2.5"
                    onClick={onApprove}
                    disabled={!canTriggerApprove}
                  >
                    {isApproving ? <Spinner className="size-3.5 text-primary-foreground" /> : null}
                    <FormattedMessage {...catEditorPanelMessages.approve} />
                    <CatEditorShortcutKbd
                      shortcut="approve"
                      isMac={isMac}
                      className="bg-primary-foreground/15 text-primary-foreground"
                    />
                  </Button>
                  {onSaveDraft ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 px-2.5"
                      onClick={onSaveDraft}
                      disabled={!canTriggerApprove}
                    >
                      {isSavingDraft ? <Spinner className="size-3.5" /> : null}
                      <FormattedMessage {...catEditorPanelMessages.saveAsDraft} />
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
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
