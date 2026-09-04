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

import { LAVENDER_MESH_GRADIENT_SRC } from "@/components/marketing/hero-frame-mesh-stage";
import { REQUEST_DEMO_URL } from "@/components/marketing/request-demo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/primitives/cn";

import { hyperlabMockMessages } from "./hyperlab-mock-ui.messages";
import {
  MarketingMockShell,
  type MarketingMockMeshPosition,
  type MarketingMockVariant,
} from "./marketing-mock-shell";
import { MarketingMockUseCaseSelector } from "./marketing-mock-use-case-selector";

type SceneId = "flags" | "experiments" | "audiences";

const SCENE_HOLD_MS = 3200;
const ROLLOUT_STEP_MS = 700;

function MockNav({ active }: { active: SceneId }) {
  const tabs = useMemo(
    () =>
      [
        ["overview", hyperlabMockMessages.navOverview, false],
        ["flags", hyperlabMockMessages.navFlags, active === "flags"],
        ["experiments", hyperlabMockMessages.navExperiments, active === "experiments"],
        ["audiences", hyperlabMockMessages.navAudiences, active === "audiences"],
        ["keys", hyperlabMockMessages.navKeys, false],
      ] as const,
    [active],
  );

  return (
    <div className="flex flex-wrap gap-1 border-b border-border/50 px-4 py-2">
      {tabs.map(([id, message, isActive]) => (
        <span
          key={id}
          className={cn(
            "rounded-sm px-2.5 py-1 text-xs",
            isActive ? "font-medium text-foreground" : "text-muted-foreground/70",
          )}
        >
          <FormattedMessage {...message} />
        </span>
      ))}
    </div>
  );
}

function FlagsPanel() {
  const intl = useIntl();

  const flags = useMemo(
    () => [
      {
        key: intl.formatMessage(hyperlabMockMessages.flagCheckoutCta),
        kind: intl.formatMessage(hyperlabMockMessages.kindExperiment),
        tone: "experiment" as const,
      },
      {
        key: intl.formatMessage(hyperlabMockMessages.flagThemePalette),
        kind: intl.formatMessage(hyperlabMockMessages.kindConfig),
        tone: "config" as const,
      },
      {
        key: intl.formatMessage(hyperlabMockMessages.flagOnboardingFlow),
        kind: intl.formatMessage(hyperlabMockMessages.kindExperiment),
        tone: "experiment" as const,
      },
    ],
    [intl],
  );

  return (
    <div className="flex w-full flex-col overflow-hidden rounded-xl border border-border/80 bg-background/90 shadow-lg backdrop-blur-sm">
      <div className="border-b border-border/50 px-4 py-3">
        <div className="text-sm font-semibold text-foreground">
          <FormattedMessage {...hyperlabMockMessages.flagsPanelTitle} />
        </div>
        <div className="text-xs text-muted-foreground">
          <FormattedMessage {...hyperlabMockMessages.flagsPanelSubtitle} />
        </div>
      </div>

      <MockNav active="flags" />

      <div className="space-y-2 p-4">
        {flags.map((flag, index) => (
          <motion.div
            key={flag.key}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.08, duration: 0.25 }}
            className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/80 px-3 py-2.5"
          >
            <span className="font-mono text-xs text-foreground">{flag.key}</span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-medium",
                flag.tone === "experiment"
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {flag.kind}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function ExperimentsPanel({ rolloutPercent }: { rolloutPercent: number }) {
  const intl = useIntl();

  const variants = useMemo(
    () => [
      {
        label: intl.formatMessage(hyperlabMockMessages.variantControl),
        percent: 100 - rolloutPercent,
      },
      {
        label: intl.formatMessage(hyperlabMockMessages.variantTreatment),
        percent: rolloutPercent,
      },
    ],
    [intl, rolloutPercent],
  );

  return (
    <div className="flex w-full flex-col overflow-hidden rounded-xl border border-border/80 bg-background/90 shadow-lg backdrop-blur-sm">
      <div className="flex items-start justify-between gap-3 border-b border-border/50 px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-foreground">
            <FormattedMessage {...hyperlabMockMessages.experimentsPanelTitle} />
          </div>
          <div className="text-xs text-muted-foreground">
            <FormattedMessage {...hyperlabMockMessages.experimentsPanelSubtitle} />
          </div>
        </div>
        <span className="rounded-full bg-grove-100 px-2.5 py-1 text-[10px] font-medium text-grove-900">
          <FormattedMessage {...hyperlabMockMessages.statusActive} />
        </span>
      </div>

      <MockNav active="experiments" />

      <div className="space-y-4 p-4">
        <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          <FormattedMessage {...hyperlabMockMessages.rolloutLabel} />
        </div>

        {variants.map((variant) => (
          <div key={variant.label} className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono text-foreground">{variant.label}</span>
              <span className="text-muted-foreground">{variant.percent}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-border/50">
              <motion.div
                className="h-full rounded-full bg-primary/70"
                initial={false}
                animate={{ width: `${variant.percent}%` }}
                transition={{ duration: 0.4, ease: "easeOut" }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AudiencesPanel({ showEvaluate }: { showEvaluate: boolean }) {
  const intl = useIntl();

  return (
    <div className="flex w-full flex-col overflow-hidden rounded-xl border border-border/80 bg-background/90 shadow-lg backdrop-blur-sm">
      <div className="border-b border-border/50 px-4 py-3">
        <div className="text-sm font-semibold text-foreground">
          <FormattedMessage {...hyperlabMockMessages.audiencesPanelTitle} />
        </div>
        <div className="text-xs text-muted-foreground">
          <FormattedMessage {...hyperlabMockMessages.audiencesPanelSubtitle} />
        </div>
      </div>

      <MockNav active="audiences" />

      <div className="space-y-4 p-4">
        <div className="rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5">
          <div className="mb-2 text-sm font-medium text-foreground">
            <FormattedMessage {...hyperlabMockMessages.audienceProUsers} />
          </div>
          <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
            <span className="rounded border border-border/60 bg-background px-1.5 py-0.5">
              {intl.formatMessage(hyperlabMockMessages.criterionAttribute)}
            </span>
            <span>{intl.formatMessage(hyperlabMockMessages.criterionMatch)}</span>
            <span className="rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-primary">
              {intl.formatMessage(hyperlabMockMessages.criterionValue)}
            </span>
          </div>
        </div>

        <AnimatePresence>
          {showEvaluate ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.28 }}
              className="rounded-lg border border-border/60 bg-muted/30 p-3"
            >
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <FormattedMessage {...hyperlabMockMessages.evaluateTitle} />
              </div>
              <pre className="overflow-x-auto font-mono text-[11px] leading-relaxed text-foreground/90">
                {`{\n  ${intl.formatMessage(hyperlabMockMessages.evaluateEnabled)},\n  ${intl.formatMessage(hyperlabMockMessages.evaluateVariant)},\n  ${intl.formatMessage(hyperlabMockMessages.evaluateReason)}\n}`}
              </pre>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}

export function HyperlabMockUI({
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
        id: "flags",
        title: intl.formatMessage(hyperlabMockMessages.useCaseFlagsTitle),
        description: intl.formatMessage(hyperlabMockMessages.useCaseFlagsDescription),
      },
      {
        id: "experiments",
        title: intl.formatMessage(hyperlabMockMessages.useCaseExperimentsTitle),
        description: intl.formatMessage(hyperlabMockMessages.useCaseExperimentsDescription),
      },
      {
        id: "audiences",
        title: intl.formatMessage(hyperlabMockMessages.useCaseAudiencesTitle),
        description: intl.formatMessage(hyperlabMockMessages.useCaseAudiencesDescription),
      },
    ],
    [intl],
  );

  const sceneByUseCase: Record<string, SceneId> = {
    flags: "flags",
    experiments: "experiments",
    audiences: "audiences",
  };

  const [activeIndex, setActiveIndex] = useState(0);
  const [rolloutPercent, setRolloutPercent] = useState(30);
  const [showEvaluate, setShowEvaluate] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const activeUseCase = useCases[activeIndex]!;
  const activeScene = sceneByUseCase[activeUseCase.id] ?? "flags";

  useEffect(() => {
    if (isPaused || pauseAutoplay || shouldReduceMotion) {
      return;
    }

    if (activeScene === "experiments" && rolloutPercent < 50) {
      const timer = setTimeout(() => setRolloutPercent((value) => value + 10), ROLLOUT_STEP_MS);
      return () => clearTimeout(timer);
    }

    if (activeScene === "audiences" && !showEvaluate) {
      const timer = setTimeout(() => setShowEvaluate(true), ROLLOUT_STEP_MS);
      return () => clearTimeout(timer);
    }

    const timer = setTimeout(() => {
      setActiveIndex((index) => (index + 1) % useCases.length);
      setRolloutPercent(30);
      setShowEvaluate(false);
    }, SCENE_HOLD_MS);

    return () => clearTimeout(timer);
  }, [
    activeScene,
    rolloutPercent,
    showEvaluate,
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
    setRolloutPercent(30);
    setShowEvaluate(false);
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
        {activeScene === "flags" ? <FlagsPanel /> : null}
        {activeScene === "experiments" ? (
          <ExperimentsPanel rolloutPercent={rolloutPercent} />
        ) : null}
        {activeScene === "audiences" ? <AudiencesPanel showEvaluate={showEvaluate} /> : null}
      </motion.div>
    </AnimatePresence>
  );

  const sidebar =
    variant === "full" ? (
      <MarketingMockUseCaseSelector
        eyebrow={hyperlabMockMessages.eyebrow}
        headline={hyperlabMockMessages.headline}
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
              <FormattedMessage {...hyperlabMockMessages.requestDemo} />
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
      meshSrc={LAVENDER_MESH_GRADIENT_SRC}
      priority={priority}
      variant={variant}
      meshPosition={meshPosition}
    />
  );
}
