"use client";

import { FormattedMessage } from "react-intl";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
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
  const hasSuggestion = Boolean(intelligence.aiSuggestion);

  return (
    <aside
      className={cn(
        "border-l pl-4 transition-opacity",
        hasSuggestion ? "border-grove-300/40" : "border-border",
        isLoading && "opacity-80",
      )}
      aria-busy={isLoading}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">
          <FormattedMessage {...catEditorPanelMessages.aiRecommendation} />
        </p>
        <div className="flex items-center gap-1">
          {hasSuggestion ? (
            <Button variant="ghost" size="sm" onClick={onUseAiSuggestion} disabled={isLoading}>
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
              {isLoading ? <Spinner className="size-4" /> : null}
              {hasSuggestion ? (
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
      ) : hasSuggestion ? (
        <>
          <p className="text-sm leading-relaxed text-foreground">{intelligence.aiSuggestion}</p>
          {intelligence.aiReasoning ? (
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              <span className="font-medium text-subtle-foreground">
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
