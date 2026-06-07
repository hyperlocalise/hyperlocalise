"use client";

import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  MagicWand01Icon,
  MoreHorizontalCircle01Icon,
  TextFirstlineRightIcon,
  VolumeHighIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/primitives/cn";

import { CatFormatChecks } from "./cat-format-checks";
import { CatSuggestionsTabs } from "./cat-suggestions-tabs";
import { catToneClass, segmentStatusLabel, segmentStatusTone } from "./cat-tone";
import type { CatFormatCheck, CatSegment, CatSegmentIntelligence, CatSuggestion } from "./types";

export function CatEditorPanel({
  segment,
  segmentPosition,
  totalSegments,
  suggestions,
  formatChecks,
  intelligence,
  historyCount,
  glossaryMatchCount,
  tmMatchBasisCount,
  isBusy,
  onTargetChange,
  onUseSuggestion,
  onUseAiSuggestion,
  onApprove,
  onRequestChanges,
  onAskQuestion,
  onSkip,
  onPrevious,
  onNext,
}: {
  segment: CatSegment;
  segmentPosition: number;
  totalSegments: number;
  suggestions: CatSuggestion[];
  formatChecks: CatFormatCheck[];
  intelligence: CatSegmentIntelligence;
  historyCount?: number;
  glossaryMatchCount?: number;
  tmMatchBasisCount?: number;
  isBusy?: boolean;
  onTargetChange: (value: string) => void;
  onUseSuggestion: (suggestion: CatSuggestion) => void;
  onUseAiSuggestion: () => void;
  onApprove: () => void;
  onRequestChanges: () => void;
  onAskQuestion: () => void;
  onSkip: () => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-foreground/8 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm text-foreground/70">
            {String(segmentPosition).padStart(2, "0")} / {String(totalSegments).padStart(2, "0")}
          </span>
          <Badge
            variant="outline"
            className={cn("rounded-full", catToneClass(segmentStatusTone(segment.status)))}
          >
            {segmentStatusLabel(segment.status)}
          </Badge>
          {segment.tags?.map((tag) => (
            <Badge
              key={tag}
              variant="outline"
              className={cn(
                "rounded-full",
                tag === "high impact"
                  ? catToneClass("risk")
                  : "border-foreground/15 text-muted-foreground",
              )}
            >
              {tag}
            </Badge>
          ))}
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
        <div className="space-y-4 border-b border-foreground/8 p-4">
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Source ({segment.sourceLocale})
              </h3>
              <Button variant="ghost" size="icon-sm" aria-label="Play source audio">
                <HugeiconsIcon icon={VolumeHighIcon} className="size-4" />
              </Button>
            </div>
            <p className="text-base leading-relaxed text-foreground/92">{segment.sourceText}</p>
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Target ({segment.targetLocale})
              </h3>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon-sm" aria-label="Expand editor">
                  <HugeiconsIcon icon={TextFirstlineRightIcon} className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="AI assist"
                  onClick={onUseAiSuggestion}
                >
                  <HugeiconsIcon icon={MagicWand01Icon} className="size-4" />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label="More options">
                  <HugeiconsIcon icon={MoreHorizontalCircle01Icon} className="size-4" />
                </Button>
              </div>
            </div>
            <Textarea
              value={segment.targetText}
              onChange={(event) => onTargetChange(event.currentTarget.value)}
              disabled={isBusy}
              className="min-h-24 resize-y text-base"
              placeholder="Enter translation…"
            />
          </section>

          {intelligence.aiSuggestion ? (
            <div className="rounded-lg border border-spruce-400/20 bg-spruce-500/8 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-spruce-200">
                  AI suggestion
                </p>
                <Button variant="outline" size="sm" onClick={onUseAiSuggestion}>
                  Use
                </Button>
              </div>
              <p className="text-sm text-foreground/90">{intelligence.aiSuggestion}</p>
              {intelligence.aiReasoning ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground/70">AI reasoning:</span>{" "}
                  {intelligence.aiReasoning}
                </p>
              ) : null}
            </div>
          ) : null}

          <section className="space-y-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Format & QA checks
            </h3>
            <CatFormatChecks checks={formatChecks} />
          </section>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              className="bg-grove-500 text-white hover:bg-grove-400"
              onClick={onApprove}
              disabled={isBusy}
            >
              Approve
              <Kbd className="ms-2 bg-white/15 text-white">⌘↵</Kbd>
            </Button>
            <Button variant="outline" onClick={onRequestChanges} disabled={isBusy}>
              Request changes
              <Kbd className="ms-2">⌘B</Kbd>
            </Button>
            <Button variant="outline" onClick={onAskQuestion} disabled={isBusy}>
              Ask a question
              <Kbd className="ms-2">⌘K</Kbd>
            </Button>
            <Button variant="ghost" onClick={onSkip} disabled={isBusy}>
              Skip
              <Kbd className="ms-2">⌘L</Kbd>
            </Button>
          </div>
        </div>
      </div>

      <div className="flex min-h-48 flex-col border-t border-foreground/8">
        <CatSuggestionsTabs
          suggestions={suggestions}
          historyCount={historyCount}
          glossaryMatchCount={glossaryMatchCount}
          tmMatchBasisCount={tmMatchBasisCount}
          onUseSuggestion={onUseSuggestion}
        />
      </div>
    </div>
  );
}
