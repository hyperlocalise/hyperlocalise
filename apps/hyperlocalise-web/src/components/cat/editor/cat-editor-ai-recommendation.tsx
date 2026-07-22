"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { CheckIcon, RefreshCwIcon, SparklesIcon } from "lucide-react";
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
  className,
}: {
  intelligence: CatSegmentIntelligence;
  isLoading: boolean;
  error?: string;
  onUseAiSuggestion: () => void;
  onGenerateAiRecommendation?: () => void;
  className?: string;
}) {
  const hasSuggestion = Boolean(intelligence.aiSuggestion);

  return (
    <aside
      className={cn(
        "rounded-xl border px-3.5 py-3 transition-opacity",
        hasSuggestion ? "border-grove-300/35 bg-grove-500/[0.07]" : "border-border/80 bg-muted/50",
        isLoading && "opacity-80",
        className,
      )}
      aria-busy={isLoading}
    >
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <SparklesIcon className="size-3.5 shrink-0" aria-hidden />
          <FormattedMessage {...catEditorPanelMessages.aiRecommendation} />
        </p>
        <div className="flex items-center gap-1.5">
          {hasSuggestion ? (
            <Button variant="ghost" size="xs" onClick={onUseAiSuggestion} disabled={isLoading}>
              <CheckIcon className="size-3" aria-hidden />
              <FormattedMessage {...catEditorPanelMessages.use} />
            </Button>
          ) : null}
          {onGenerateAiRecommendation ? (
            <Button
              variant="outline"
              size="xs"
              onClick={onGenerateAiRecommendation}
              disabled={isLoading}
            >
              {isLoading ? (
                <Spinner className="size-3" />
              ) : (
                <RefreshCwIcon className="size-3" aria-hidden />
              )}
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
        <div className="space-y-2">
          <p className="text-sm leading-relaxed text-foreground">{intelligence.aiSuggestion}</p>
          {intelligence.aiReasoning ? (
            <p className="text-xs leading-relaxed text-muted-foreground">
              <FormattedMessage
                {...catEditorPanelMessages.aiReasoning}
                values={{
                  reasoning: intelligence.aiReasoning,
                  b: (chunks) => (
                    <span className="font-medium text-subtle-foreground">{chunks}</span>
                  ),
                }}
              />
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          <FormattedMessage {...catEditorPanelMessages.aiSuggestionEmpty} />
        </p>
      )}
    </aside>
  );
}
