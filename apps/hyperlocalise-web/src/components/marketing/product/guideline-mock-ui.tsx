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
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { FormattedMessage, useIntl } from "react-intl";

import { SAGE_MESH_GRADIENT_SRC } from "@/components/marketing/hero-frame-mesh-stage";
import { REQUEST_DEMO_URL } from "@/components/marketing/request-demo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/primitives/cn";

import { guidelineMockMessages } from "./guideline-mock-ui.messages";
import {
  MarketingMockShell,
  type MarketingMockMeshPosition,
  type MarketingMockVariant,
} from "./marketing-mock-shell";
import { MarketingMockUseCaseSelector } from "./marketing-mock-use-case-selector";

const RULE_CYCLE_MS = 2200;
const MARKET_CYCLE_MS = 2600;
const SCENE_HOLD_MS = 3200;
const STYLE_RULE_COUNT = 3;
const MARKET_COUNT = 3;
const COMPLIANCE_ITEM_COUNT = 3;

type SceneId = "style-guides" | "market-knowledge" | "compliance";

function StyleGuidePanel({ activeRuleIndex }: { activeRuleIndex: number }) {
  const intl = useIntl();
  const rules = useMemo(
    () => [
      {
        label: intl.formatMessage(guidelineMockMessages.styleRuleTone),
        before: intl.formatMessage(guidelineMockMessages.styleBeforeCopy),
        after: intl.formatMessage(guidelineMockMessages.styleAfterCopy),
      },
      {
        label: intl.formatMessage(guidelineMockMessages.styleRuleCta),
        before: intl.formatMessage(guidelineMockMessages.styleBeforeCopyCta),
        after: intl.formatMessage(guidelineMockMessages.styleAfterCopyCta),
      },
      {
        label: intl.formatMessage(guidelineMockMessages.styleRuleTerms),
        before: intl.formatMessage(guidelineMockMessages.styleBeforeCopyTerms),
        after: intl.formatMessage(guidelineMockMessages.styleAfterCopyTerms),
      },
    ],
    [intl],
  );

  const activeRule = rules[activeRuleIndex] ?? rules[0]!;

  return (
    <div className="flex w-full flex-col overflow-hidden rounded-xl border border-border/80 bg-background/90 shadow-lg backdrop-blur-sm">
      <div className="border-b border-border/50 px-4 py-3">
        <div className="text-sm font-semibold text-foreground">
          <FormattedMessage {...guidelineMockMessages.styleGuidePanelTitle} />
        </div>
        <div className="text-xs text-muted-foreground">
          <FormattedMessage {...guidelineMockMessages.styleGuidePanelSubtitle} />
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="flex flex-wrap gap-2">
          {rules.map((rule, index) => (
            <motion.span
              key={rule.label}
              layout
              animate={{
                scale: index === activeRuleIndex ? 1 : 0.98,
                opacity: index === activeRuleIndex ? 1 : 0.55,
              }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
              className={cn(
                "rounded-full border px-3 py-1 text-[11px] leading-relaxed",
                index === activeRuleIndex
                  ? "border-primary/40 bg-primary/10 font-medium text-foreground"
                  : "border-border/70 bg-background text-muted-foreground",
              )}
            >
              {rule.label}
            </motion.span>
          ))}
        </div>

        <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold tracking-wide uppercase text-muted-foreground">
              <FormattedMessage {...guidelineMockMessages.styleDraftPreviewLabel} />
            </span>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              <FormattedMessage {...guidelineMockMessages.styleAppliedBadge} />
            </span>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={activeRuleIndex}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.24 }}
              className="space-y-3"
            >
              <div className="rounded-lg border border-border/50 bg-background/70 px-3 py-2.5">
                <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  <FormattedMessage {...guidelineMockMessages.styleBeforeLabel} />
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">{activeRule.before}</p>
              </div>

              <div className="flex justify-center">
                <span className="text-muted-foreground/60" aria-hidden>
                  ↓
                </span>
              </div>

              <div className="rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5">
                <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-primary/80">
                  <FormattedMessage {...guidelineMockMessages.styleAfterLabel} />
                </div>
                <p className="text-sm font-medium leading-relaxed text-foreground">
                  {activeRule.after}
                </p>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function MarketKnowledgePanel({ activeMarketIndex }: { activeMarketIndex: number }) {
  const intl = useIntl();
  const markets = useMemo(
    () => [
      {
        title: intl.formatMessage(guidelineMockMessages.marketDeTitle),
        do: intl.formatMessage(guidelineMockMessages.marketDeDo),
        dont: intl.formatMessage(guidelineMockMessages.marketDeDont),
        flag: "DE",
      },
      {
        title: intl.formatMessage(guidelineMockMessages.marketJpTitle),
        do: intl.formatMessage(guidelineMockMessages.marketJpDo),
        dont: intl.formatMessage(guidelineMockMessages.marketJpDont),
        flag: "JP",
      },
      {
        title: intl.formatMessage(guidelineMockMessages.marketBrTitle),
        do: intl.formatMessage(guidelineMockMessages.marketBrDo),
        dont: intl.formatMessage(guidelineMockMessages.marketBrDont),
        flag: "BR",
      },
    ],
    [intl],
  );

  const activeMarket = markets[activeMarketIndex] ?? markets[0]!;

  return (
    <div className="flex w-full flex-col overflow-hidden rounded-xl border border-border/80 bg-background/90 shadow-lg backdrop-blur-sm">
      <div className="border-b border-border/50 px-4 py-3">
        <div className="text-sm font-semibold text-foreground">
          <FormattedMessage {...guidelineMockMessages.marketPanelTitle} />
        </div>
        <div className="text-xs text-muted-foreground">
          <FormattedMessage {...guidelineMockMessages.marketPanelSubtitle} />
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="flex gap-2">
          {markets.map((market, index) => (
            <div
              key={market.flag}
              className={cn(
                "flex-1 rounded-lg border px-3 py-2 text-center transition-colors",
                index === activeMarketIndex
                  ? "border-primary/40 bg-primary/10"
                  : "border-border/60 bg-background/80 opacity-60",
              )}
            >
              <div className="text-xs font-medium text-foreground">{market.flag}</div>
              <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
                {market.title}
              </div>
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeMarket.flag}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.28 }}
            className="space-y-3"
          >
            <div className="text-sm font-semibold text-foreground">
              <FormattedMessage
                {...guidelineMockMessages.marketActiveLabel}
                values={{ market: activeMarket.title }}
              />
            </div>

            <div className="rounded-lg border border-grove-500/35 bg-grove-100 px-3 py-2.5 dark:border-grove-300/20 dark:bg-grove-300/10">
              <div className="mb-1 text-[10px] font-semibold tracking-wide uppercase text-grove-900 dark:text-grove-300">
                <FormattedMessage {...guidelineMockMessages.marketDoLabel} />
              </div>
              <p className="text-sm leading-relaxed text-grove-900 dark:text-grove-300">
                {activeMarket.do}
              </p>
            </div>

            <div className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2.5 dark:border-destructive/30 dark:bg-destructive/20">
              <div className="mb-1 text-[10px] font-semibold tracking-wide uppercase text-destructive">
                <FormattedMessage {...guidelineMockMessages.marketDontLabel} />
              </div>
              <p className="text-sm leading-relaxed text-destructive">{activeMarket.dont}</p>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function CompliancePanel({ checkedCount }: { checkedCount: number }) {
  const intl = useIntl();
  const items = useMemo(
    () => [
      intl.formatMessage(guidelineMockMessages.complianceItemGdpr),
      intl.formatMessage(guidelineMockMessages.complianceItemAi),
      intl.formatMessage(guidelineMockMessages.complianceItemHealth),
    ],
    [intl],
  );

  const progress = checkedCount / items.length;
  const isReady = checkedCount >= items.length;

  return (
    <div className="flex w-full flex-col overflow-hidden rounded-xl border border-border/80 bg-background/90 shadow-lg backdrop-blur-sm">
      <div className="flex items-start justify-between gap-3 border-b border-border/50 px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-foreground">
            <FormattedMessage {...guidelineMockMessages.compliancePanelTitle} />
          </div>
          <div className="text-xs text-muted-foreground">
            <FormattedMessage {...guidelineMockMessages.compliancePanelSubtitle} />
          </div>
        </div>
        {isReady ? (
          <span className="rounded-full bg-grove-100 px-2.5 py-1 text-[10px] font-medium text-grove-900">
            <FormattedMessage {...guidelineMockMessages.complianceReadyLabel} />
          </span>
        ) : (
          <span className="rounded-full border border-destructive/25 bg-destructive/10 px-2.5 py-1 text-[10px] font-medium text-destructive dark:border-destructive/30 dark:bg-destructive/20">
            <FormattedMessage {...guidelineMockMessages.complianceBlockedLabel} />
          </span>
        )}
      </div>

      <div className="space-y-4 px-4 py-4">
        <div>
          <div className="mb-2 flex items-center justify-between text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <span>
              <FormattedMessage {...guidelineMockMessages.complianceProgressLabel} />
            </span>
            <span>
              {checkedCount}/{items.length}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-border/50">
            <motion.div
              className="h-full rounded-full bg-primary/70"
              initial={false}
              animate={{ width: `${progress * 100}%` }}
              transition={{ duration: 0.35, ease: "easeOut" }}
            />
          </div>
        </div>

        <div className="space-y-2">
          {items.map((item, index) => {
            const isChecked = index < checkedCount;
            const isPending = index === checkedCount;
            return (
              <motion.div
                key={item}
                initial={false}
                animate={{ opacity: isChecked || isPending ? 1 : 0.45 }}
                className={cn(
                  "flex items-start gap-3 rounded-lg border px-3 py-2.5",
                  isPending
                    ? "border-primary/30 bg-primary/5"
                    : isChecked
                      ? "border-border/40 bg-background"
                      : "border-transparent bg-muted/20",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full text-[10px]",
                    isChecked
                      ? "bg-grove-300 text-grove-900"
                      : isPending
                        ? "border border-primary/50 text-primary"
                        : "border border-border/60",
                  )}
                >
                  {isChecked ? "✓" : isPending ? "…" : ""}
                </span>
                <span
                  className={cn(
                    "text-xs leading-relaxed",
                    isChecked || isPending ? "text-foreground/90" : "text-muted-foreground",
                  )}
                >
                  {item}
                </span>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function GuidelineMockUI({
  priority = false,
  pauseAutoplay = false,
  renderCta,
  variant = "full",
  aside,
  meshPosition = "left",
}: {
  priority?: boolean;
  pauseAutoplay?: boolean;
  renderCta?: () => ReactNode;
  variant?: MarketingMockVariant;
  aside?: ReactNode;
  meshPosition?: MarketingMockMeshPosition;
}) {
  const intl = useIntl();
  const shouldReduceMotion = useReducedMotion();

  const useCases = useMemo(
    () => [
      {
        id: "market-knowledge",
        title: intl.formatMessage(guidelineMockMessages.useCaseMarketKnowledgeTitle),
        description: intl.formatMessage(guidelineMockMessages.useCaseMarketKnowledgeDescription),
      },
      {
        id: "style-guides",
        title: intl.formatMessage(guidelineMockMessages.useCaseStyleGuidesTitle),
        description: intl.formatMessage(guidelineMockMessages.useCaseStyleGuidesDescription),
      },
      {
        id: "compliance-regulatory",
        title: intl.formatMessage(guidelineMockMessages.useCaseComplianceTitle),
        description: intl.formatMessage(guidelineMockMessages.useCaseComplianceDescription),
      },
    ],
    [intl],
  );

  const sceneByUseCase: Record<string, SceneId> = {
    "market-knowledge": "market-knowledge",
    "style-guides": "style-guides",
    "compliance-regulatory": "compliance",
  };

  const [activeIndex, setActiveIndex] = useState(0);
  const [activeRuleIndex, setActiveRuleIndex] = useState(0);
  const [activeMarketIndex, setActiveMarketIndex] = useState(0);
  const [checkedCount, setCheckedCount] = useState(1);
  const [isPaused, setIsPaused] = useState(false);

  const activeUseCase = useCases[activeIndex]!;
  const activeScene = sceneByUseCase[activeUseCase.id] ?? "market-knowledge";

  useEffect(() => {
    if (isPaused || pauseAutoplay || shouldReduceMotion) {
      return;
    }

    if (activeScene === "style-guides" && activeRuleIndex < STYLE_RULE_COUNT - 1) {
      const timer = setTimeout(() => setActiveRuleIndex((value) => value + 1), RULE_CYCLE_MS);
      return () => clearTimeout(timer);
    }

    if (activeScene === "market-knowledge" && activeMarketIndex < MARKET_COUNT - 1) {
      const timer = setTimeout(() => setActiveMarketIndex((value) => value + 1), MARKET_CYCLE_MS);
      return () => clearTimeout(timer);
    }

    if (activeScene === "compliance" && checkedCount < COMPLIANCE_ITEM_COUNT) {
      const timer = setTimeout(() => setCheckedCount((value) => value + 1), RULE_CYCLE_MS);
      return () => clearTimeout(timer);
    }

    const timer = setTimeout(() => {
      setActiveIndex((index) => (index + 1) % useCases.length);
      setActiveRuleIndex(0);
      setActiveMarketIndex(0);
      setCheckedCount(1);
    }, SCENE_HOLD_MS);

    return () => clearTimeout(timer);
  }, [
    activeScene,
    activeRuleIndex,
    activeMarketIndex,
    checkedCount,
    isPaused,
    pauseAutoplay,
    shouldReduceMotion,
    useCases.length,
  ]);

  function handleSelect(id: string) {
    const index = useCases.findIndex((useCase) => useCase.id === id);
    if (index === -1) {
      return;
    }

    setIsPaused(true);
    setActiveIndex(index);
    setActiveRuleIndex(0);
    setActiveMarketIndex(0);
    setCheckedCount(1);
    setTimeout(() => setIsPaused(false), 500);
  }

  const visual = (
    <AnimatePresence mode="wait">
      <motion.div
        key={activeUseCase.id}
        initial={{ opacity: 0, x: -12 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 12 }}
        transition={{ duration: 0.32, ease: [0.19, 1, 0.22, 1] }}
        className="w-full"
      >
        {activeScene === "style-guides" ? (
          <StyleGuidePanel activeRuleIndex={activeRuleIndex} />
        ) : null}
        {activeScene === "market-knowledge" ? (
          <MarketKnowledgePanel activeMarketIndex={activeMarketIndex} />
        ) : null}
        {activeScene === "compliance" ? <CompliancePanel checkedCount={checkedCount} /> : null}
      </motion.div>
    </AnimatePresence>
  );

  const sidebar =
    variant === "full" ? (
      <MarketingMockUseCaseSelector
        eyebrow={guidelineMockMessages.eyebrow}
        headline={guidelineMockMessages.headline}
        useCases={useCases}
        activeId={activeUseCase.id}
        onSelect={handleSelect}
        cta={
          renderCta === undefined ? (
            <Button
              variant="outline"
              size="lg"
              nativeButton={false}
              render={<a href={REQUEST_DEMO_URL} target="_blank" rel="noopener noreferrer" />}
              className="cursor-pointer rounded-sm"
            >
              <FormattedMessage {...guidelineMockMessages.requestDemo} />
            </Button>
          ) : (
            renderCta()
          )
        }
      />
    ) : undefined;

  return (
    <MarketingMockShell
      visual={visual}
      sidebar={sidebar}
      aside={aside}
      meshSrc={SAGE_MESH_GRADIENT_SRC}
      priority={priority}
      variant={variant}
      meshPosition={meshPosition}
    />
  );
}
