"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { RefreshIcon, SparklesIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage } from "react-intl";

import { UpgradePlanButton } from "@/components/billing/upgrade-plan-button";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/primitives/cn";

import { contentEditorEditorPanelMessages } from "@/components/content-editor/shared/content-editor.messages";
import type { ContentEditorSegmentIntelligence } from "@/components/content-editor/shared/types";
import { useAiFeaturesUpgradeHref } from "@/lib/billing/ai-features-upgrade-href";

export function ContentEditorEditorAiRecommendation({
  intelligence,
  isLoading,
  error,
  onUseAiSuggestion,
  onGenerateAiRecommendation,
  className,
}: {
  intelligence: ContentEditorSegmentIntelligence;
  isLoading: boolean;
  error?: string;
  onUseAiSuggestion: () => void;
  onGenerateAiRecommendation?: () => void;
  className?: string;
}) {
  const upgradeHref = useAiFeaturesUpgradeHref();
  const hasSuggestion = Boolean(intelligence.aiSuggestion);
  const showActions = hasSuggestion || Boolean(onGenerateAiRecommendation) || Boolean(upgradeHref);

  return (
    <aside
      className={cn(
        "overflow-hidden rounded-2xl bg-muted/50 px-3.5 py-3 ring-1 ring-inset ring-border/50",
        isLoading && "opacity-80",
        className,
      )}
      aria-busy={isLoading}
    >
      <div className="flex items-center gap-1.5">
        <HugeiconsIcon
          icon={SparklesIcon}
          className="size-3.5 shrink-0 text-grove-400"
          aria-hidden
        />
        <p className="text-xs font-medium text-muted-foreground">
          <FormattedMessage {...contentEditorEditorPanelMessages.aiRecommendation} />
        </p>
      </div>

      <div className="mt-2.5">
        {error ? (
          <p className="text-sm leading-relaxed text-flame-100">{error}</p>
        ) : hasSuggestion ? (
          <div className="space-y-2">
            <p className="text-sm leading-relaxed text-foreground">{intelligence.aiSuggestion}</p>
            {intelligence.aiReasoning ? (
              <p className="text-xs leading-relaxed text-muted-foreground">
                <FormattedMessage
                  {...contentEditorEditorPanelMessages.aiReasoning}
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
          <p className="text-sm leading-relaxed text-muted-foreground">
            <FormattedMessage {...contentEditorEditorPanelMessages.aiSuggestionEmpty} />
          </p>
        )}
      </div>

      {showActions ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/50 pt-3">
          {hasSuggestion ? (
            <Button variant="outline" size="xs" onClick={onUseAiSuggestion} disabled={isLoading}>
              <HugeiconsIcon icon={Tick02Icon} className="size-3" aria-hidden />
              <FormattedMessage {...contentEditorEditorPanelMessages.use} />
            </Button>
          ) : null}
          {upgradeHref ? (
            <UpgradePlanButton
              organizationSlug={upgradeHref.organizationSlug}
              variant="outline"
              size="xs"
            />
          ) : onGenerateAiRecommendation ? (
            <Button
              variant={hasSuggestion ? "ghost" : "outline"}
              size="xs"
              onClick={onGenerateAiRecommendation}
              disabled={isLoading}
            >
              {isLoading ? (
                <Spinner className="size-3" />
              ) : (
                <HugeiconsIcon icon={RefreshIcon} className="size-3" aria-hidden />
              )}
              {hasSuggestion ? (
                <FormattedMessage {...contentEditorEditorPanelMessages.regenerate} />
              ) : (
                <FormattedMessage {...contentEditorEditorPanelMessages.getRecommendation} />
              )}
            </Button>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
