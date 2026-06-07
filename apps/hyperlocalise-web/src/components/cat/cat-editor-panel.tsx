"use client";

import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Textarea } from "@/components/ui/textarea";

import { CatFormatChecks } from "./cat-format-checks";
import type { CatFormatCheck, CatSegment, CatSegmentIntelligence } from "./types";

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
  onSkip,
  onPrevious,
  onNext,
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
  onSkip: () => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-foreground/8 px-5 py-3">
        <div className="flex items-center">
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            {String(segmentPosition).padStart(2, "0")} / {String(totalSegments).padStart(2, "0")}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={onPrevious} aria-label="Previous segment">
            <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onNext} aria-label="Next segment">
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
              {segment.sourceText}
            </p>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-medium text-muted-foreground">
                Target ({segment.targetLocale})
              </h3>
            </div>
            <Textarea
              value={segment.targetText}
              onChange={(event) => onTargetChange(event.currentTarget.value)}
              disabled={isBusy}
              className="min-h-36 resize-y rounded-2xl border-foreground/12 bg-background px-4 py-4 text-lg leading-relaxed shadow-sm md:text-lg"
              placeholder="Enter translation…"
            />
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
              <Kbd className="ms-2 bg-white/15 text-white">⌘↵</Kbd>
            </Button>
            <Button variant="outline" onClick={onAskQuestion} disabled={isBusy}>
              Find context
              <Kbd className="ms-2">⌘K</Kbd>
            </Button>
            <Button variant="ghost" onClick={onSkip} disabled={isBusy}>
              Skip
              <Kbd className="ms-2">⌘L</Kbd>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
