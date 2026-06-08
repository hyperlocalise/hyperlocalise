"use client";

import { useMemo, useState } from "react";
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useHotkeys } from "react-hotkeys-hook";

import { Button } from "@/components/ui/button";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Textarea } from "@/components/ui/textarea";

import { CatFormatChecks } from "./cat-format-checks";
import { analyzeCatMessageFormat } from "./cat-message-format";
import { CatIcuStructureSummary, CatMessagePreview, CatTargetEditor } from "./cat-target-editor";
import type { CatFormatCheck, CatSegment, CatSegmentIntelligence } from "./types";

function ShortcutKbd({ keys, className }: { keys: string[]; className?: string }) {
  return (
    <KbdGroup aria-hidden="true" className="ms-2 inline-flex items-center gap-1">
      {keys.map((key) => (
        <Kbd key={key} className={className}>
          {key}
        </Kbd>
      ))}
    </KbdGroup>
  );
}

interface CatEditorComment {
  id: string;
  author: string;
  createdAtLabel: string;
  body: string;
}

export function CatEditorPanel({
  segment,
  segmentPosition,
  totalSegments,
  formatChecks,
  intelligence,
  isBusy,
  onTargetChange,
  onUseAiSuggestion,
  onApprove,
  onAskQuestion,
  onPrevious,
  onNext,
  hasPreviousSegment,
  hasNextSegment,
}: {
  segment: CatSegment;
  segmentPosition: number;
  totalSegments: number;
  formatChecks: CatFormatCheck[];
  intelligence: CatSegmentIntelligence;
  isBusy?: boolean;
  onTargetChange: (value: string) => void;
  onUseAiSuggestion: () => void;
  onApprove: () => void;
  onAskQuestion: () => void;
  onPrevious: () => void;
  onNext: () => void;
  hasPreviousSegment: boolean;
  hasNextSegment: boolean;
}) {
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [commentsBySegmentId, setCommentsBySegmentId] = useState<
    Record<string, CatEditorComment[]>
  >({});
  const commentDraft = commentDrafts[segment.id] ?? "";
  const segmentComments = commentsBySegmentId[segment.id] ?? [];
  const trimmedCommentDraft = commentDraft.trim();
  const sourceMessageAnalysis = useMemo(
    () => analyzeCatMessageFormat(segment.sourceText),
    [segment.sourceText],
  );

  useHotkeys(
    "mod+arrowleft, mod+arrowup",
    (event) => {
      event.preventDefault();
      onPrevious();
    },
    {
      enabled: hasPreviousSegment,
      enableOnFormTags: false,
      preventDefault: true,
    },
    [hasPreviousSegment, onPrevious],
  );

  useHotkeys(
    "mod+arrowright, mod+arrowdown",
    (event) => {
      event.preventDefault();
      onNext();
    },
    {
      enabled: hasNextSegment,
      enableOnFormTags: false,
      preventDefault: true,
    },
    [hasNextSegment, onNext],
  );

  function handleCommentDraftChange(value: string) {
    setCommentDrafts((current) => ({ ...current, [segment.id]: value }));
  }

  function handleAddComment() {
    if (!trimmedCommentDraft) {
      return;
    }

    setCommentsBySegmentId((current) => {
      const currentComments = current[segment.id] ?? [];
      const commentNumber = currentComments.length + 1;
      return {
        ...current,
        [segment.id]: [
          ...currentComments,
          {
            id: `${segment.id}-comment-${commentNumber}`,
            author: "Reviewer",
            createdAtLabel: "Just now",
            body: trimmedCommentDraft,
          },
        ],
      };
    });
    handleCommentDraftChange("");
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-foreground/8 px-5 py-3">
        <div className="flex items-center">
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            {String(segmentPosition).padStart(2, "0")} / {String(totalSegments).padStart(2, "0")}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onPrevious}
            disabled={!hasPreviousSegment}
            aria-label="Previous segment"
            title="Previous segment (⌘←)"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onNext}
            disabled={!hasNextSegment}
            aria-label="Next segment"
            title="Next segment (⌘→)"
          >
            <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-7 px-8 py-8">
          <section className="space-y-3">
            <h3 className="text-xs font-medium text-muted-foreground">
              Source ({segment.sourceLocale})
            </h3>
            <p className="text-pretty text-lg leading-relaxed text-foreground/92">
              <CatMessagePreview message={segment.sourceText} />
            </p>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-medium text-muted-foreground">
                Target ({segment.targetLocale})
              </h3>
            </div>
            <CatTargetEditor
              sourceText={segment.sourceText}
              value={segment.targetText}
              onChange={onTargetChange}
              disabled={isBusy}
            />
            <CatIcuStructureSummary blocks={sourceMessageAnalysis.icuBlocks} />
          </section>

          {intelligence.aiSuggestion ? (
            <aside className="border-l border-grove-300/40 pl-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-xs font-medium text-muted-foreground">AI recommendation</p>
                <Button variant="ghost" size="sm" onClick={onUseAiSuggestion}>
                  Use
                </Button>
              </div>
              <p className="text-sm leading-relaxed text-foreground/88">
                {intelligence.aiSuggestion}
              </p>
              {intelligence.aiReasoning ? (
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  <span className="font-medium text-foreground/70">Reasoning:</span>{" "}
                  {intelligence.aiReasoning}
                </p>
              ) : null}
            </aside>
          ) : null}

          <section className="space-y-3">
            <h3 className="text-xs font-medium text-muted-foreground">Format & QA checks</h3>
            <CatFormatChecks checks={formatChecks} />
          </section>

          <div className="flex flex-wrap items-center gap-2 border-t border-foreground/8 pt-5">
            <Button
              className="bg-grove-500 text-white hover:bg-grove-400"
              onClick={onApprove}
              disabled={isBusy}
            >
              Approve
              <ShortcutKbd keys={["⌘", "↵"]} className="bg-white/15 text-white" />
            </Button>
            <Button variant="outline" onClick={onAskQuestion} disabled={isBusy}>
              Find context
              <ShortcutKbd keys={["⌘", "K"]} />
            </Button>
            <Button variant="ghost" onClick={onPrevious} disabled={isBusy || !hasPreviousSegment}>
              Previous
              <ShortcutKbd keys={["⌘", "←"]} />
            </Button>
            <Button variant="ghost" onClick={onNext} disabled={isBusy || !hasNextSegment}>
              Next
              <ShortcutKbd keys={["⌘", "→"]} />
            </Button>
          </div>

          <section className="space-y-3 border-t border-foreground/8 pt-5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-medium text-muted-foreground">Comments</h3>
              <span className="text-xs text-muted-foreground tabular-nums">
                {segmentComments.length}
              </span>
            </div>
            {segmentComments.length > 0 ? (
              <ul className="space-y-3">
                {segmentComments.map((comment) => (
                  <li key={comment.id} className="space-y-1">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground/78">{comment.author}</span>
                      <span>{comment.createdAtLabel}</span>
                    </div>
                    <p className="text-sm leading-relaxed text-foreground/88">{comment.body}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No comments yet. Add a note for reviewers or translators.
              </p>
            )}
            <Textarea
              value={commentDraft}
              onChange={(event) => handleCommentDraftChange(event.currentTarget.value)}
              className="min-h-20 resize-y rounded-xl border-foreground/12 bg-background px-3 py-3 text-sm leading-relaxed"
              placeholder="Add a comment..."
            />
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleAddComment}
                disabled={!trimmedCommentDraft}
              >
                Add comment
              </Button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
