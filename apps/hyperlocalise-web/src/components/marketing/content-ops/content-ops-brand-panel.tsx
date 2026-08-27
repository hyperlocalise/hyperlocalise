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
import { useCallback, useEffect, useRef, useState } from "react";
import { Chat01Icon, RefreshIcon, SentIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { FormattedMessage, useIntl } from "react-intl";

import { Tool, ToolHeader } from "@/components/ai-elements/tool";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/primitives/cn";

import { contentOpsMockStageMessages } from "./content-ops-mock-stage.messages";

const TOOL_RESOLVE_MS = 520;
const STEP_MS = 720;
const EASE_OUT = [0.19, 1, 0.22, 1] as const;

type PlaybackPhase = "idle" | "playing" | "done";

export function ContentOpsBrandPanel({
  pauseAutoplay = false,
  onPhaseChange,
}: {
  pauseAutoplay?: boolean;
  onPhaseChange?: (phase: PlaybackPhase) => void;
}) {
  const intl = useIntl();
  const shouldReduceMotion = useReducedMotion() ?? false;
  const [phase, setPhase] = useState<PlaybackPhase>("idle");
  const [showTool, setShowTool] = useState(false);
  const [toolResolved, setToolResolved] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

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

  const resetPlayback = () => {
    clearTimers();
    setPhase("idle");
    setShowTool(false);
    setToolResolved(false);
    setShowAnswer(false);
    onPhaseChange?.("idle");
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
    onPhaseChange?.("playing");

    let elapsed = shouldReduceMotion ? 0 : 180;

    schedule(() => setShowTool(true), elapsed);
    elapsed += shouldReduceMotion ? 0 : TOOL_RESOLVE_MS;
    schedule(() => setToolResolved(true), elapsed);
    elapsed += shouldReduceMotion ? 0 : STEP_MS;
    schedule(() => {
      setShowAnswer(true);
      setPhase("done");
      onPhaseChange?.("done");
    }, elapsed);
  }, [onPhaseChange, shouldReduceMotion]);

  useEffect(() => {
    if (pauseAutoplay || shouldReduceMotion) {
      return;
    }

    const timer = setTimeout(() => startPlayback(), 400);
    return () => clearTimeout(timer);
  }, [pauseAutoplay, shouldReduceMotion, startPlayback]);

  useEffect(() => () => clearTimers(), []);

  const showAppliedStyle = showAnswer;

  return (
    <div className="grid w-full gap-4 lg:grid-cols-2">
      <div className="flex flex-col overflow-hidden rounded-xl border border-border/80 bg-background/90 shadow-lg backdrop-blur-sm">
        <div className="border-b border-border/50 px-4 py-3">
          <div className="text-sm font-semibold text-foreground">
            <FormattedMessage {...contentOpsMockStageMessages.brandStyleTitle} />
          </div>
          <div className="text-xs text-muted-foreground">
            <FormattedMessage {...contentOpsMockStageMessages.brandStyleSubtitle} />
          </div>
        </div>

        <div className="space-y-4 p-4">
          <div className="flex flex-wrap gap-2">
            {[contentOpsMockStageMessages.brandRuleTone, contentOpsMockStageMessages.brandRuleCta].map(
              (rule) => (
                <span
                  key={rule.id}
                  className="rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-[11px] font-medium text-foreground"
                >
                  <FormattedMessage {...rule} />
                </span>
              ),
            )}
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

      <div
        className="flex h-[22rem] flex-col overflow-hidden rounded-xl border border-border bg-background/95 shadow-lg backdrop-blur-sm sm:h-[24rem]"
        role="region"
        aria-label={intl.formatMessage(contentOpsMockStageMessages.brandChatTitle)}
      >
        <header className="flex h-11 shrink-0 items-center border-b border-border px-3">
          <p className="text-sm font-medium text-foreground">
            <FormattedMessage {...contentOpsMockStageMessages.brandChatTitle} />
          </p>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4">
          {phase === "idle" ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-center">
              <div className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <HugeiconsIcon icon={Chat01Icon} strokeWidth={1.8} className="size-4" />
              </div>
              <p className="max-w-xs text-sm text-muted-foreground">{prompt}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="ms-auto max-w-[95%] rounded-2xl bg-muted px-3.5 py-2.5 text-sm leading-6 text-foreground">
                {prompt}
              </div>

              {showTool ? (
                <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
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
                </div>
              ) : null}

              {showAnswer ? (
                <motion.div
                  initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-3 text-sm leading-6"
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
          )}
        </div>

        <div className="shrink-0 border-t border-border p-3">
          <div className="flex items-center justify-end gap-2">
            {phase === "done" ? (
              <Button type="button" size="sm" variant="secondary" onClick={resetPlayback}>
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
                disabled={phase === "playing"}
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
  );
}
