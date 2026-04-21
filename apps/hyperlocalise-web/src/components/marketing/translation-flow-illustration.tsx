"use client";
import { useEffect, useState } from "react";

import { DotFlow } from "dot-anime-react";
import { useInView } from "react-intersection-observer";
import { motion, useReducedMotion } from "motion/react";

import { TranslateIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Badge } from "@/components/ui/badge";
import {
  TypographyH4,
  TypographyMuted,
  TypographyP,
  TypographySmall,
} from "@/components/ui/typography";
import { cn } from "@/lib/utils";

const consoleLines = [
  {
    label: "Started cloud agent",
    showAgentModel: true,
    tone: "text-muted-foreground",
  },
  {
    label: "Translating en/pricing.json for 38 locales",
    tone: "text-muted-foreground",
  },
  {
    label: "Gathering glossary, translation memory, and release context",
    tone: "text-muted-foreground",
  },
  {
    label: "Reviewing translated strings with legal and market nuance",
    tone: "text-muted-foreground",
  },
  {
    label: "Syncing to your TMS",
    tone: "text-muted-foreground",
  },
];

const flagshipModelsByAgent: Record<string, string> = {
  OpenAI: "GPT 5.4",
  Claude: "Opus 4.7",
  Gemini: "3.1 Pro",
};

const CONSOLE_STEP_MS = 520;
const CONSOLE_EASE_OUT = [0.19, 1, 0.22, 1] as const;

export type AssignmentTarget = {
  name: string;
  role?: string;
  meta?: string;
  avatarUrl: string;
};

const flipDotItems = [
  {
    title: "Working ...",
    frames: [
      [0, 4, 7, 8, 10, 11, 15],
      [0, 4, 5, 7, 8, 11, 15],
      [4, 5, 7, 8, 11, 12, 15],
      [3, 4, 5, 7, 8, 11, 12],
      [2, 3, 4, 7, 8, 11, 12],
      [3, 4, 7, 8, 11, 12, 13],
      [4, 7, 8, 11, 12, 13, 15],
      [4, 7, 8, 10, 11, 12, 15],
    ],
  },
  {
    title: "Thinking",
    frames: [
      [0, 4, 7, 8, 10, 11, 15],
      [0, 4, 5, 7, 8, 11, 15],
      [4, 5, 7, 8, 11, 12, 15],
      [3, 4, 5, 7, 8, 11, 12],
      [2, 3, 4, 7, 8, 11, 12],
      [3, 4, 7, 8, 11, 12, 13],
      [4, 7, 8, 11, 12, 13, 15],
      [4, 7, 8, 10, 11, 12, 15],
    ],
  },
];

function SelectorAvatar({ target }: { target: AssignmentTarget }) {
  return (
    <div className="size-9 overflow-hidden rounded-full bg-muted">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={target.avatarUrl} alt="" className="size-full object-cover" />
    </div>
  );
}

export function TranslationFlowIllustration({
  assignmentTargets,
}: {
  assignmentTargets: readonly AssignmentTarget[];
}) {
  const [activeAgent, setActiveAgent] = useState(assignmentTargets[0]?.name ?? "");
  const shouldReduceMotion = useReducedMotion();
  const [visibleLineCount, setVisibleLineCount] = useState(
    shouldReduceMotion ? consoleLines.length : 0,
  );
  const { ref: inViewRef, inView } = useInView({
    triggerOnce: true,
    threshold: 0.3,
  });

  useEffect(() => {
    setActiveAgent((currentAgent) =>
      assignmentTargets.some((target) => target.name === currentAgent)
        ? currentAgent
        : (assignmentTargets[0]?.name ?? ""),
    );
  }, [assignmentTargets]);

  useEffect(() => {
    if (shouldReduceMotion) {
      setVisibleLineCount(consoleLines.length);
      return;
    }

    if (!inView) {
      setVisibleLineCount(0);
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const advance = (nextVisibleCount: number) => {
      timeoutId = setTimeout(
        () => {
          if (nextVisibleCount <= consoleLines.length) {
            setVisibleLineCount(nextVisibleCount);

            advance(nextVisibleCount + 1);
          }
        },
        nextVisibleCount === 1 ? 180 : CONSOLE_STEP_MS,
      );
    };

    advance(1);

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [activeAgent, shouldReduceMotion, inView]);

  return (
    <div
      ref={inViewRef}
      className="relative overflow-hidden rounded-[1.8rem] border border-border/70 bg-background mask-radial-from-65% mask-radial-at-top"
    >
      <div className="relative">
        <div className="flex items-center justify-between gap-4 border-b border-border/70 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-2xl border border-border/70 bg-card text-card-foreground">
              <HugeiconsIcon icon={TranslateIcon} strokeWidth={1.8} className="size-5" />
            </div>
            <div>
              <TypographyH4 className="text-foreground">Translate Task</TypographyH4>
              <TypographyMuted className="text-muted-foreground">
                Localise Pricing Messages
              </TypographyMuted>
            </div>
          </div>
          <Badge variant="secondary" className="rounded-full px-3">
            Agentic workflow
          </Badge>
        </div>

        <div className="relative grid gap-5 px-5 py-5 sm:px-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="mt-6 overflow-hidden">
            <div className="px-5 py-2">
              <div className="space-y-1">
                <div className="flex items-center gap-3 text-muted-foreground">
                  <DotFlow
                    items={flipDotItems}
                    direction="horizontal"
                    spacing={12}
                    autoPlay={4000}
                    matrix={{
                      interval: 180,
                      cols: 4,
                      rows: 4,
                      dotSize: 4,
                      gap: 1,
                      color: "#ff8dd0",
                      inactiveColor: "rgba(244, 114, 182, 0.1)",
                    }}
                  />
                </div>
                {consoleLines.map((line, index) => (
                  <motion.div
                    key={line.label}
                    className={cn(
                      "rounded-xl 0.5",
                      index < visibleLineCount ? "text-foreground" : "hidden",
                    )}
                    initial={false}
                    animate={
                      shouldReduceMotion
                        ? {
                            opacity: 1,
                            y: 0,
                            scale: 1,
                          }
                        : index < visibleLineCount
                          ? {
                              opacity: 1,
                              y: 0,
                              scale: 1,
                            }
                          : {
                              opacity: 0.2,
                              y: 8,
                              scale: 0.985,
                            }
                    }
                    transition={{
                      duration: shouldReduceMotion ? 0 : 0.8,
                      ease: CONSOLE_EASE_OUT,
                    }}
                  >
                    <TypographyP
                      className={cn("flex flex-wrap items-center gap-x-3 gap-y-1", line.tone)}
                    >
                      <span>{line.label}</span>
                      {line.showAgentModel ? (
                        <span className="text-[0.98rem] text-muted-foreground/50">
                          {activeAgent} - {flagshipModelsByAgent[activeAgent] ?? ""}
                        </span>
                      ) : null}
                    </TypographyP>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>

          <div className="relative lg:pl-6">
            <div className="mx-auto max-w-136">
              <div className="flex flex-col gap-2.5 rounded-4xl bg-popover p-1 text-popover-foreground">
                <div className="p-1 pb-0">
                  <div className="flex h-9 items-center rounded-[1.1rem] bg-input/30 px-3 text-sm text-muted-foreground">
                    Assign to...
                  </div>
                </div>

                <div className="no-scrollbar max-h-72 space-y-1 overflow-x-hidden overflow-y-auto outline-none">
                  {assignmentTargets.map((target) => (
                    <button
                      type="button"
                      key={target.name}
                      disabled={!target.role}
                      onClick={target.role ? () => setActiveAgent(target.name) : undefined}
                      data-active={target.name === activeAgent}
                      className={cn(
                        "relative flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm outline-hidden select-none",
                        "data-[active=true]:bg-muted data-[active=true]:text-foreground",
                        !target.role && "pointer-events-none opacity-50",
                      )}
                    >
                      <div className="flex flex-1 items-center gap-3.5">
                        <SelectorAvatar target={target} />
                        <div>
                          <div className="flex items-center gap-2.5">
                            <TypographySmall className="text-[0.98rem] font-medium tracking-[-0.02em] text-foreground">
                              {target.name}
                            </TypographySmall>
                            {target.role ? (
                              <span className="rounded-[0.7rem] border border-border/70 bg-secondary/60 px-2.5 py-1 text-[0.72rem] text-muted-foreground">
                                {target.role}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
