"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { useEffect, useRef, useState } from "react";
import {
  Cancel01Icon,
  Chat01Icon,
  File01Icon,
  RefreshIcon,
  SentIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { FormattedMessage, useIntl } from "react-intl";

import { Tool, ToolHeader } from "@/components/ai-elements/tool";
import { Button } from "@/components/ui/button";
import { TypographyH2, TypographyMuted, TypographyP } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";

import { chatDockMockMessages } from "./chat-dock-mock.messages";

const STEP_MS = 720;
const TOOL_RESOLVE_MS = 520;
const EASE_OUT = [0.19, 1, 0.22, 1] as const;
const COLLAPSE_GLYPH = "−";
const MENTION_GLYPH = "@";

type ToolStep = {
  kind: "tool";
  id: string;
  toolName: string;
  detail: string;
  input: Record<string, string>;
  resultLines: string[];
};

const TOOL_DEMO_STEPS: ToolStep[] = [
  {
    kind: "tool",
    id: "grep-save",
    toolName: "grep",
    detail: "Save",
    input: {
      pattern: "Save",
      path: "apps/web/src",
    },
    resultLines: [
      "apps/web/src/components/settings/account-form.tsx:84",
      '  <Button type="submit">{t("account.settings.save")}</Button>',
      "apps/web/src/messages/en-US.json:128",
      '  "account.settings.save": "Save"',
    ],
  },
  {
    kind: "tool",
    id: "read-form",
    toolName: "read",
    detail: "account-form.tsx",
    input: {
      path: "apps/web/src/components/settings/account-form.tsx",
    },
    resultLines: [
      '82  <div className="flex justify-end gap-2">',
      '83    <Button variant="ghost">Cancel</Button>',
      '84    <Button type="submit">{t("account.settings.save")}</Button>',
      "85  </div>",
    ],
  },
];

const ANSWER_SECTION_KEYS = [
  {
    labelKey: "answerWhatItIsLabel",
    bodyKey: "answerWhatItIsBody",
  },
  {
    labelKey: "answerWhereLabel",
    bodyKey: "answerWhereBody",
  },
  {
    labelKey: "answerGuidanceLabel",
    bodyKey: "answerGuidanceBody",
  },
] as const;

const FEATURE_KEYS = [
  "featureContextDiscovery",
  "featureRepositorySearch",
  "featureTranslationGuidance",
  "featureHumanReview",
] as const;

type PlaybackPhase = "idle" | "playing" | "done";

type VisibleTool = {
  step: ToolStep;
  state: "input-available" | "output-available";
};

export function ChatDockMockSection() {
  const intl = useIntl();
  const shouldReduceMotion = useReducedMotion();
  const [phase, setPhase] = useState<PlaybackPhase>("idle");
  const [visibleToolCount, setVisibleToolCount] = useState(0);
  const [toolStates, setToolStates] = useState<Record<string, VisibleTool["state"]>>({});
  const [showAnswer, setShowAnswer] = useState(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const prefilledPrompt = intl.formatMessage(chatDockMockMessages.prefilledPrompt);

  const clearTimers = () => {
    for (const timer of timersRef.current) {
      clearTimeout(timer);
    }
    timersRef.current = [];
  };

  const resetPlayback = () => {
    clearTimers();
    setPhase("idle");
    setVisibleToolCount(0);
    setToolStates({});
    setShowAnswer(false);
  };

  const schedule = (fn: () => void, delay: number) => {
    const timer = setTimeout(fn, delay);
    timersRef.current.push(timer);
  };

  const startPlayback = () => {
    if (phase === "playing") {
      return;
    }

    clearTimers();
    setPhase("playing");
    setVisibleToolCount(0);
    setToolStates({});
    setShowAnswer(false);

    const toolSteps = TOOL_DEMO_STEPS;
    let elapsed = shouldReduceMotion ? 0 : 180;

    toolSteps.forEach((step, index) => {
      schedule(() => {
        setVisibleToolCount(index + 1);
        setToolStates((current) => ({ ...current, [step.id]: "input-available" }));
      }, elapsed);

      elapsed += shouldReduceMotion ? 0 : TOOL_RESOLVE_MS;

      schedule(() => {
        setToolStates((current) => ({ ...current, [step.id]: "output-available" }));
      }, elapsed);

      elapsed += shouldReduceMotion ? 0 : STEP_MS;
    });

    schedule(
      () => {
        setShowAnswer(true);
        setPhase("done");
      },
      elapsed + (shouldReduceMotion ? 0 : 120),
    );
  };

  useEffect(() => () => clearTimers(), []);

  useEffect(() => {
    if (!transcriptRef.current) {
      return;
    }
    transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
  }, [visibleToolCount, toolStates, showAnswer]);

  const toolSteps = TOOL_DEMO_STEPS;
  const answerSections = ANSWER_SECTION_KEYS.map((section) => ({
    label: intl.formatMessage(chatDockMockMessages[section.labelKey]),
    body: intl.formatMessage(chatDockMockMessages[section.bodyKey]),
  }));
  const isBusy = phase === "playing";

  return (
    <section className="relative overflow-hidden rounded-[1.5rem] border border-border bg-background shadow-[0_20px_48px_rgba(0,0,0,0.14)] sm:rounded-[2rem]">
      <div className="grid lg:grid-cols-[minmax(0,1.35fr)_minmax(16rem,0.75fr)]">
        <div className="relative min-h-112 overflow-hidden border-b border-border px-4 py-8 sm:px-6 sm:py-10 lg:min-h-128 lg:border-b-0 lg:border-r lg:px-8 lg:py-12">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(96,116,9,0.14),transparent_42%),radial-gradient(circle_at_88%_78%,rgba(9,108,229,0.1),transparent_46%)]"
          />

          <motion.div
            aria-hidden
            className="absolute left-3 top-8 w-[min(18rem,70%)] rounded-xl border border-border bg-card/90 p-4 shadow-lg backdrop-blur-sm sm:left-6 sm:top-12"
            initial={shouldReduceMotion ? false : { opacity: 0, y: 18, rotate: -2 }}
            animate={{ opacity: 1, y: 0, rotate: -2 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.8, ease: EASE_OUT }}
          >
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <HugeiconsIcon icon={File01Icon} strokeWidth={1.8} className="size-3.5" />
              <span className="font-mono tracking-tight">
                <FormattedMessage {...chatDockMockMessages.backgroundDocTitle} />
              </span>
            </div>
            <p className="mt-3 text-2xl font-medium tracking-[-0.04em] text-foreground">
              <FormattedMessage {...chatDockMockMessages.backgroundDocSource} />
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              <FormattedMessage {...chatDockMockMessages.backgroundDocMeta} />
            </p>
          </motion.div>

          <motion.div
            className="relative mx-auto mt-16 w-full max-w-[30rem] sm:mt-10"
            initial={shouldReduceMotion ? false : { opacity: 0, y: 28, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{
              duration: shouldReduceMotion ? 0 : 0.9,
              delay: shouldReduceMotion ? 0 : 0.12,
              ease: EASE_OUT,
            }}
          >
            <div
              className="flex h-[min(36rem,70svh)] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl shadow-black/15"
              role="region"
              aria-label={intl.formatMessage(chatDockMockMessages.dockTitle)}
            >
              <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
                <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                  <FormattedMessage {...chatDockMockMessages.dockTitle} />
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  tabIndex={-1}
                  aria-label={intl.formatMessage(chatDockMockMessages.collapseLabel)}
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
                  aria-label={intl.formatMessage(chatDockMockMessages.closeLabel)}
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
                        <FormattedMessage {...chatDockMockMessages.emptyTitle} />
                      </h3>
                      <p className="text-pretty text-sm text-muted-foreground">
                        <FormattedMessage {...chatDockMockMessages.emptySubtitle} />
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4 px-4 py-5">
                    <div className="ms-auto max-w-[90%] rounded-2xl bg-muted px-3.5 py-2.5 text-sm leading-6 text-foreground">
                      {prefilledPrompt}
                    </div>

                    <div className="space-y-3">
                      <AnimatePresence initial={false}>
                        {toolSteps.slice(0, visibleToolCount).map((step) => {
                          const state = toolStates[step.id] ?? "input-available";
                          return (
                            <motion.div
                              key={step.id}
                              initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{
                                duration: shouldReduceMotion ? 0 : 0.28,
                                ease: EASE_OUT,
                              }}
                              className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2"
                            >
                              <Tool defaultOpen={state === "output-available"}>
                                <ToolHeader
                                  type="dynamic-tool"
                                  toolName={step.toolName}
                                  state={state}
                                  detail={step.detail}
                                  input={step.input}
                                />
                              </Tool>
                              {state === "output-available" ? (
                                <pre className="mt-2 overflow-x-auto rounded-md bg-muted/50 px-2.5 py-2 font-mono text-[0.72rem] leading-5 text-muted-foreground">
                                  {step.resultLines.join("\n")}
                                </pre>
                              ) : null}
                            </motion.div>
                          );
                        })}
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
                      <HugeiconsIcon icon={File01Icon} strokeWidth={1.8} className="size-3" />
                      <FormattedMessage {...chatDockMockMessages.contextPill} />
                    </span>
                  </div>
                  <div className="flex items-end gap-2 px-3 py-3">
                    <p className="min-w-0 flex-1 text-sm leading-5 text-foreground">
                      {phase === "idle" ? (
                        prefilledPrompt
                      ) : (
                        <span className="text-muted-foreground">
                          <FormattedMessage {...chatDockMockMessages.composerPlaceholder} />
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
                        <FormattedMessage {...chatDockMockMessages.replayLabel} />
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        className="h-8 rounded-full px-3"
                        disabled={isBusy}
                        aria-label={intl.formatMessage(chatDockMockMessages.sendLabel)}
                        onClick={startPlayback}
                      >
                        <HugeiconsIcon
                          data-icon="inline-start"
                          icon={SentIcon}
                          strokeWidth={2}
                          className="size-3.5"
                        />
                        <FormattedMessage {...chatDockMockMessages.sendLabel} />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        <aside className="flex flex-col justify-between gap-10 px-6 py-8 sm:px-8 sm:py-10 lg:py-12">
          <div className="space-y-4">
            <TypographyMuted className="text-[0.72rem] font-medium tracking-[0.18em] uppercase">
              <FormattedMessage {...chatDockMockMessages.sectionEyebrow} />
            </TypographyMuted>
            <TypographyH2 className="pb-0 text-3xl leading-[1.04] tracking-[-0.045em] sm:text-4xl">
              <FormattedMessage {...chatDockMockMessages.sectionTitle} />
            </TypographyH2>
            <TypographyP className="max-w-sm text-muted-foreground">
              <FormattedMessage {...chatDockMockMessages.sectionBody} />
            </TypographyP>
          </div>

          <div className="space-y-4">
            <TypographyMuted className="text-[0.72rem] font-medium tracking-[0.18em] uppercase">
              <FormattedMessage {...chatDockMockMessages.featuresLabel} />
            </TypographyMuted>
            <ul className="space-y-3 font-mono text-[0.78rem] tracking-[0.08em] text-muted-foreground uppercase">
              {FEATURE_KEYS.map((key) => (
                <li key={key} className={cn("leading-5")}>
                  <FormattedMessage {...chatDockMockMessages[key]} />
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </section>
  );
}
