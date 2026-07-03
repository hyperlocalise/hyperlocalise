"use client";

import { FormattedMessage } from "react-intl";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/primitives/cn";

import { catEditorPanelMessages } from "@/components/cat/shared/cat.messages";
import type { CatSegmentIntelligence } from "@/components/cat/shared/types";

export function CatEditorAiRecommendation({
  intelligence,
  isLoading,
  error,
  onUseAiSuggestion,
  onGenerateAiRecommendation,
}: {
  intelligence: CatSegmentIntelligence;
  isLoading: boolean;
  error?: string;
  onUseAiSuggestion: () => void;
  onGenerateAiRecommendation?: () => void;
}) {
  if (isLoading) {
    return (
      <aside className="space-y-3 rounded-xl border border-foreground/8 bg-foreground/2 p-4">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-3 w-28 rounded-full bg-foreground/8" />
          <Skeleton className="h-8 w-12 rounded-md bg-foreground/8" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-11/12 rounded-full bg-foreground/8" />
          <Skeleton className="h-4 w-8/12 rounded-full bg-foreground/8" />
        </div>
        <Skeleton className="h-3 w-10/12 rounded-full bg-foreground/8" />
      </aside>
    );
  }

  return (
    <aside
      className={cn(
        "border-l pl-4",
        intelligence.aiSuggestion ? "border-grove-300/40" : "border-foreground/12",
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">
          <FormattedMessage {...catEditorPanelMessages.aiRecommendation} />
        </p>
        <div className="flex items-center gap-1">
          {intelligence.aiSuggestion ? (
            <Button variant="ghost" size="sm" onClick={onUseAiSuggestion}>
              <FormattedMessage {...catEditorPanelMessages.use} />
            </Button>
          ) : null}
          {onGenerateAiRecommendation ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onGenerateAiRecommendation}
              disabled={isLoading}
            >
              {intelligence.aiSuggestion ? (
                <FormattedMessage {...catEditorPanelMessages.regenerate} />
              ) : (
                <FormattedMessage {...catEditorPanelMessages.getRecommendation} />
              )}
            </Button>
          ) : null}
        </div>
      </div>
      {error ? (
        <p className="text-sm leading-relaxed text-flame-100">{error}</p>
      ) : intelligence.aiSuggestion ? (
        <>
          <p className="text-sm leading-relaxed text-foreground/88">{intelligence.aiSuggestion}</p>
          {intelligence.aiReasoning ? (
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground/70">
                <FormattedMessage {...catEditorPanelMessages.reasoningPrefix} />
              </span>{" "}
              {intelligence.aiReasoning}
            </p>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          <FormattedMessage {...catEditorPanelMessages.aiSuggestionEmpty} />
        </p>
      )}
    </aside>
  );
}
