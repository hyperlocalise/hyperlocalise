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
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import {
  BookOpenTextIcon,
  Cancel01Icon,
  Chat01Icon,
  RefreshIcon,
  SentIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { FormattedMessage, useIntl } from "react-intl";

import { Tool, ToolHeader } from "@/components/ai-elements/tool";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/primitives/cn";

import { CONTENT_OPS_MOCK_INNER_CLASSNAME } from "./content-ops-mock-stage.constants";
import { contentOpsMockStageMessages } from "./content-ops-mock-stage.messages";

const TOOL_RESOLVE_MS = 520;
const STEP_MS = 720;
const EASE_OUT = [0.19, 1, 0.22, 1] as const;
const COLLAPSE_GLYPH = "−";
const MENTION_GLYPH = "@";

export type BrandPlaybackPhase = "idle" | "playing" | "done";

export function ContentOpsBrandPanel({
  pauseAutoplay = false,
  onPhaseChange,
}: {
  pauseAutoplay?: boolean;
  onPhaseChange?: (phase: BrandPlaybackPhase) => void;
}) {
  const intl = useIntl();
  const shouldReduceMotion = useReducedMotion() ?? false;
  const hasAutoStartedRef = useRef(false);
  const [phase, setPhase] = useState<BrandPlaybackPhase>("idle");
  const [showTool, setShowTool] = useState(false);
  const [toolResolved, setToolResolved] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const prompt = intl.formatMessage(contentOpsMockStageMessages.brandChatPrompt);
  const answerSections = [
    {
      label: intl.formatMessage(contentOpsMockStageMessages.brandVerdictLabel),
      body: intl.formatMessage(contentOpsMockStageMessages.brandVerdictBody),
    },
    {
      label: intl.formatMessage(contentOpsMockStageMessages.brandGuidelineLabel),
      body: intl.formatMessage(contentOpsMockStageMessages.brandGuidelineBody),
    },
    {
      label: intl.formatMessage(contentOpsMockStageMessages.brandSuggestLabel),
      body: intl.formatMessage(contentOpsMockStageMessages.brandSuggestBody),
    },
  ];

  const clearTimers = () => {
    for (const timer of timersRef.current) {
      clearTimeout(timer);
    }
    timersRef.current = [];
  };

  const notifyPhaseChange = useEffectEvent((nextPhase: BrandPlaybackPhase) => {
    onPhaseChange?.(nextPhase);
  });

  const resetPlayback = () => {
    clearTimers();
    setPhase("idle");
    setShowTool(false);
    setToolResolved(false);
    setShowAnswer(false);
    notifyPhaseChange("idle");
  };

  const schedule = (fn: () => void, delay: number) => {
    const timer = setTimeout(fn, delay);
    timersRef.current.push(timer);
  };

  const startPlayback = useCallback(() => {
    clearTimers();
    setPhase("playing");
    setShowTool(false);
    setToolResolved(false);
    setShowAnswer(false);
    notifyPhaseChange("playing");

    let elapsed = shouldReduceMotion ? 0 : 180;

    schedule(() => setShowTool(true), elapsed);
    elapsed += shouldReduceMotion ? 0 : TOOL_RESOLVE_MS;
    schedule(() => setToolResolved(true), elapsed);
    elapsed += shouldReduceMotion ? 0 : STEP_MS;
    schedule(() => {
      setShowAnswer(true);
      setPhase("done");
      notifyPhaseChange("done");
    }, elapsed);
  }, [shouldReduceMotion]);

  useEffect(() => {
    if (pauseAutoplay || shouldReduceMotion || hasAutoStartedRef.current) {
      return;
    }

    hasAutoStartedRef.current = true;
    const timer = setTimeout(() => startPlayback(), 400);
    return () => clearTimeout(timer);
  }, [pauseAutoplay, shouldReduceMotion, startPlayback]);

  useEffect(() => () => clearTimers(), []);

  useEffect(() => {
    if (!transcriptRef.current) {
      return;
    }
    transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
  }, [showTool, toolResolved, showAnswer]);

  const showAppliedStyle = showAnswer;

  return (
    <div className={cn(CONTENT_OPS_MOCK_INNER_CLASSNAME, "grid lg:grid-cols-2")}>
      <div className="flex flex-col border-b border-border/50 lg:border-b-0 lg:border-r">
        <div className="border-b border-border/50 px-5 py-4">
          <div className="text-base font-semibold text-foreground">
            <FormattedMessage {...contentOpsMockStageMessages.brandStyleTitle} />
          </div>
        </div>

        <div className="space-y-4 p-4">
          <div className="flex flex-wrap gap-2">
            {[
              contentOpsMockStageMessages.brandRuleTone,
              contentOpsMockStageMessages.brandRuleCta,
            ].map((rule) => (
              <span
                key={rule.id}
                className="rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-[11px] font-medium text-foreground"
              >
                <FormattedMessage {...rule} />
              </span>
            ))}
          </div>

          <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
            <div className="space-y-3">
              <div className="rounded-lg border border-border/50 bg-background/70 px-3 py-2.5">
                <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  <FormattedMessage {...contentOpsMockStageMessages.brandBeforeLabel} />
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  <FormattedMessage {...contentOpsMockStageMessages.brandBeforeCopy} />
                </p>
              </div>

              <AnimatePresence mode="wait">
                {showAppliedStyle ? (
                  <motion.div
                    key="after"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.24 }}
                  >
                    <div className="rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="text-[10px] font-medium uppercase tracking-wide text-primary/80">
                          <FormattedMessage {...contentOpsMockStageMessages.brandAfterLabel} />
                        </span>
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                          <FormattedMessage {...contentOpsMockStageMessages.brandAppliedBadge} />
                        </span>
                      </div>
                      <p className="text-sm font-medium leading-relaxed text-foreground">
                        <FormattedMessage {...contentOpsMockStageMessages.brandAfterCopy} />
                      </p>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>

      <div className="flex min-h-[24rem] flex-col p-3 lg:min-h-0 lg:p-4">
        <div
          className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl shadow-black/15"
          role="region"
          aria-label={intl.formatMessage(contentOpsMockStageMessages.brandChatTitle)}
        >
          <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
            <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
              <FormattedMessage {...contentOpsMockStageMessages.brandChatTitle} />
            </p>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              tabIndex={-1}
              aria-label={intl.formatMessage(contentOpsMockStageMessages.brandCollapseLabel)}
            >
              <span aria-hidden className="text-base leading-none">
                {COLLAPSE_GLYPH}
              </span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              tabIndex={-1}
              aria-label={intl.formatMessage(contentOpsMockStageMessages.brandCloseLabel)}
            >
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3.5" />
            </Button>
          </header>

          <div ref={transcriptRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {phase === "idle" ? (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-5 py-8 text-center">
                <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <HugeiconsIcon icon={Chat01Icon} strokeWidth={1.8} className="size-5" />
                </div>
                <div className="max-w-sm space-y-1">
                  <h3 className="text-balance text-sm font-semibold text-foreground">
                    <FormattedMessage {...contentOpsMockStageMessages.brandChatEmptyTitle} />
                  </h3>
                  <p className="text-pretty text-sm text-muted-foreground">{prompt}</p>
                  <p className="text-pretty text-xs text-muted-foreground">
                    <FormattedMessage {...contentOpsMockStageMessages.brandChatEmptySubtitle} />
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4 px-4 py-5">
                <div className="ms-auto max-w-[90%] rounded-2xl bg-muted px-3.5 py-2.5 text-sm leading-6 text-foreground">
                  {prompt}
                </div>

                <div className="space-y-3">
                  <AnimatePresence initial={false}>
                    {showTool ? (
                      <motion.div
                        key="brand-tool"
                        initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          duration: shouldReduceMotion ? 0 : 0.28,
                          ease: EASE_OUT,
                        }}
                        className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2"
                      >
                        <Tool defaultOpen={toolResolved}>
                          <ToolHeader
                            type="dynamic-tool"
                            toolName={intl.formatMessage(contentOpsMockStageMessages.brandToolName)}
                            state={toolResolved ? "output-available" : "input-available"}
                            detail={intl.formatMessage(contentOpsMockStageMessages.brandToolDetail)}
                            input={{
                              query: "brand voice CTA DE",
                            }}
                          />
                        </Tool>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>

                  {showAnswer ? (
                    <motion.div
                      initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: shouldReduceMotion ? 0 : 0.35, ease: EASE_OUT }}
                      className="space-y-4 text-sm leading-6 text-foreground"
                    >
                      {answerSections.map((section) => (
                        <div key={section.label} className="space-y-1">
                          <p className="font-medium text-foreground">{section.label}</p>
                          <p className="text-muted-foreground">{section.body}</p>
                        </div>
                      ))}
                    </motion.div>
                  ) : null}
                </div>
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-border bg-background p-3">
            <div className="overflow-hidden rounded-xl border border-border bg-muted/30 shadow-sm">
              <div className="flex flex-wrap gap-1.5 px-3 pt-3">
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[0.7rem] text-muted-foreground">
                  {MENTION_GLYPH}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2 py-0.5 text-[0.7rem] text-foreground">
                  <HugeiconsIcon icon={BookOpenTextIcon} strokeWidth={1.8} className="size-3" />
                  <FormattedMessage {...contentOpsMockStageMessages.brandContextPill} />
                </span>
              </div>
              <div className="flex items-end gap-2 px-3 py-3">
                <p className="min-w-0 flex-1 text-sm leading-5 text-foreground">
                  {phase === "idle" ? (
                    prompt
                  ) : (
                    <span className="text-muted-foreground">
                      <FormattedMessage {...contentOpsMockStageMessages.brandComposerPlaceholder} />
                    </span>
                  )}
                </p>
                {phase === "done" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-8 rounded-full px-3"
                    onClick={resetPlayback}
                  >
                    <HugeiconsIcon
                      data-icon="inline-start"
                      icon={RefreshIcon}
                      strokeWidth={2}
                      className="size-3.5"
                    />
                    <FormattedMessage {...contentOpsMockStageMessages.brandReplay} />
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 rounded-full px-3"
                    disabled={phase === "playing"}
                    aria-label={intl.formatMessage(contentOpsMockStageMessages.brandSend)}
                    onClick={startPlayback}
                  >
                    <HugeiconsIcon
                      data-icon="inline-start"
                      icon={SentIcon}
                      strokeWidth={2}
                      className="size-3.5"
                    />
                    <FormattedMessage {...contentOpsMockStageMessages.brandSend} />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
