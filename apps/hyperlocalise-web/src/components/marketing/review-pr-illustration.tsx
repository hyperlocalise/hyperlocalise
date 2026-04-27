"use client";

import { useEffect, useRef, useState } from "react";

import { DotFlow } from "dot-anime-react";
import { motion, useReducedMotion } from "motion/react";
import Image from "next/image";

const beforeLines = [
  { left: "42", right: "", prefix: "-", code: '  "pricing.trialCta": "Start your free trial",' },
  { left: "43", right: "", prefix: "-", code: '  "pricing.noCard": "No credit card required",' },
  {
    left: "44",
    right: "",
    prefix: "-",
    code: '  "pricing.launchMarkets": "Publish to 12 markets in minutes",',
  },
  {
    left: "45",
    right: "",
    prefix: "-",
    code: '  "pricing.billingCycle": "Billing available monthly"',
  },
];

const COMMENT_DRAFT = `@hyperlocalise fix`;

const interactiveLine = {
  left: "",
  right: "44",
  prefix: "+",
  fixingCode: '  "pricing.launchMarkets": "Publiez sur 12 marches en quelques minutes",',
  resolvedCode: '  "pricing.launchMarkets": "Publiez sur 12 marchés en quelques minutes",',
  reviewTitle: "Missing accent changes the French noun",
  reviewBody:
    "French requires “marchés” with an acute accent. Without it, the line reads like the verb “marches” instead of “markets” in customer-facing pricing copy.",
};

const remainingAfterLines = [
  {
    left: "",
    right: "42",
    prefix: "+",
    code: '  "pricing.trialCta": "Commencez votre essai gratuit",',
  },
  {
    left: "",
    right: "43",
    prefix: "+",
    code: '  "pricing.noCard": "Aucune carte de crédit requise",',
  },
  {
    left: "",
    right: "45",
    prefix: "+",
    code: '  "pricing.billingCycle": "Facturation disponible chaque mois"',
  },
];

const dotItems = [
  {
    title: "Fixing",
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

const EASE_OUT = [0.19, 1, 0.22, 1] as const;
const EASE_IN_OUT = [0.645, 0.045, 0.355, 1] as const;
const RESOLVE_DELAY_MS = 1890;

type IllustrationStep = "draft" | "fixing" | "resolved";

export function ReviewPrIllustration() {
  const shouldReduceMotion = useReducedMotion();
  const [step, setStep] = useState<IllustrationStep>("draft");
  const replyTimeoutRef = useRef<number | null>(null);
  const resolveTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (replyTimeoutRef.current !== null) {
        window.clearTimeout(replyTimeoutRef.current);
      }

      if (resolveTimeoutRef.current !== null) {
        window.clearTimeout(resolveTimeoutRef.current);
      }
    };
  }, []);

  const clearTimers = () => {
    if (replyTimeoutRef.current !== null) {
      window.clearTimeout(replyTimeoutRef.current);
      replyTimeoutRef.current = null;
    }

    if (resolveTimeoutRef.current !== null) {
      window.clearTimeout(resolveTimeoutRef.current);
      resolveTimeoutRef.current = null;
    }
  };

  const handleSend = () => {
    clearTimers();
    setStep("fixing");

    if (shouldReduceMotion) {
      setStep("resolved");
      return;
    }

    resolveTimeoutRef.current = window.setTimeout(() => {
      setStep("resolved");
      resolveTimeoutRef.current = null;
    }, RESOLVE_DELAY_MS);
  };

  const handleReset = () => {
    clearTimers();
    setStep("draft");
  };

  const statusLabel =
    step === "resolved"
      ? "Changes committed"
      : step === "fixing"
        ? "Agent fixing"
        : "Review required";
  const statusClassName =
    step === "resolved"
      ? "border-[color:var(--color-success)] bg-[color:color-mix(in_srgb,var(--color-success)_18%,var(--color-card))] text-[color:var(--color-success)]"
      : step === "fixing"
        ? "border-[color:var(--color-info)] bg-[color:color-mix(in_srgb,var(--color-info)_16%,var(--color-card))] text-[color:var(--color-info)]"
        : "border-[color:var(--color-warning)] bg-[color:color-mix(in_srgb,var(--color-warning)_18%,var(--color-card))] text-[color:var(--color-warning)]";
  const displayedInteractiveCode =
    step === "resolved" ? interactiveLine.resolvedCode : interactiveLine.fixingCode;
  const showComposer = step === "draft";

  return (
    <div className="relative overflow-hidden rounded-xl mask-radial-from-85% mask-radial-at-top bg-background border border-border">
      <div className="relative flex items-center justify-between gap-2.5 bg-background px-4 py-3 sm:gap-3 sm:px-6 sm:py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[0.72rem] font-medium tracking-[0.02em] text-muted-foreground">
            <motion.span
              className="inline-flex size-2 rounded-full bg-(--color-success)"
              animate={
                shouldReduceMotion
                  ? { scale: 1 }
                  : { scale: [1, 1.18, 1], opacity: [0.78, 1, 0.78] }
              }
              transition={
                shouldReduceMotion
                  ? { duration: 0 }
                  : { duration: 1.8, ease: EASE_IN_OUT, repeat: Infinity }
              }
            />
            apps/web/messages/fr.json
          </div>
          <div className="mt-1 text-sm text-foreground">review translation updates</div>
          <div className="mt-3">
            <div className="mt-1 text-sm text-muted-foreground">
              {step === "resolved"
                ? "3 strings changed, 1 French typo corrected directly from the PR thread"
                : "3 strings changed, 1 translation issue called out before merge"}
            </div>
          </div>
        </div>

        <motion.div
          className={`rounded-full border px-2.5 py-1 text-[0.7rem] font-medium sm:px-3 sm:text-xs ${statusClassName}`}
          key={statusLabel}
          initial={shouldReduceMotion ? false : { opacity: 0, y: 8, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.18, ease: EASE_OUT }}
        >
          {statusLabel}
        </motion.div>
      </div>

      <div className="relative p-2.5 sm:p-5">
        <div className="overflow-hidden rounded-[1.35rem] border border-border bg-card">
          <div className="grid grid-cols-[1fr] border-b border-border bg-muted/60 px-2.5 py-1.5 text-[0.62rem] font-semibold tracking-[0.16em] text-muted-foreground uppercase sm:grid-cols-[4.25rem_4.25rem_1fr] sm:px-3 sm:py-2 sm:text-[0.68rem] sm:tracking-[0.18em]">
            <span className="hidden sm:inline">Old</span>
            <span className="hidden sm:inline">New</span>
            <span className="sm:pl-0 pl-2">Diff</span>
          </div>

          <div className="border-b border-border bg-card px-2.5 py-2 font-mono text-[0.74rem] leading-6 text-card-foreground sm:px-3 sm:text-[0.8rem] sm:leading-7">
            <div className="grid grid-cols-[2rem_2rem_1fr] md:grid-cols-[4rem_4rem_1fr] gap-0 rounded-t-lg bg-[color-mix(in_srgb,var(--color-success)_12%,var(--color-card))] sm:grid-cols-[4.25rem_4.25rem_1fr]">
              <div className="border-r border-[color-mix(in_srgb,var(--color-success)_35%,var(--color-border))] px-2.5 text-right text-muted-foreground sm:px-3">
                41
              </div>
              <div className="border-r border-[color-mix(in_srgb,var(--color-success)_35%,var(--color-border))] px-2.5 text-right text-muted-foreground sm:px-3">
                41
              </div>
              <div className="px-2.5 text-card-foreground sm:px-3">{`{`}</div>
            </div>

            {beforeLines.map((line) => (
              <div
                key={`before-${line.code}`}
                className="grid grid-cols-[1fr] bg-[color-mix(in_srgb,var(--color-error)_12%,var(--color-card))] sm:grid-cols-[4.25rem_4.25rem_1fr]"
              >
                <div className="hidden border-r border-[color-mix(in_srgb,var(--color-error)_35%,var(--color-border))] px-2.5 text-right text-muted-foreground sm:block sm:px-3">
                  {line.left}
                </div>
                <div className="hidden border-r border-[color-mix(in_srgb,var(--color-error)_35%,var(--color-border))] px-2.5 text-right text-muted-foreground sm:block sm:px-3">
                  {line.right}
                </div>
                <div className="overflow-hidden px-2.5 text-ellipsis whitespace-nowrap text-card-foreground sm:px-3">
                  <span className="mr-3 inline-block w-3 text-(--color-error)">{line.prefix}</span>
                  {line.code}
                </div>
              </div>
            ))}

            <div
              className={
                step === "resolved"
                  ? "bg-[color-mix(in_srgb,var(--color-success)_18%,var(--color-card))]"
                  : "bg-[color-mix(in_srgb,var(--color-success)_12%,var(--color-card))]"
              }
            >
              <div className="grid grid-cols-[1fr] sm:grid-cols-[4.25rem_4.25rem_1fr]">
                <div className="hidden border-r border-[color-mix(in_srgb,var(--color-success)_35%,var(--color-border))] px-2.5 text-right text-muted-foreground sm:block sm:px-3">
                  {interactiveLine.left}
                </div>
                <div className="hidden border-r border-[color-mix(in_srgb,var(--color-success)_35%,var(--color-border))] px-2.5 text-right text-muted-foreground sm:block sm:px-3">
                  {interactiveLine.right}
                </div>
                <motion.div
                  className={`overflow-hidden px-2.5 text-ellipsis whitespace-nowrap sm:px-3 ${
                    step === "resolved"
                      ? "text-(--color-success-foreground)"
                      : "text-card-foreground"
                  }`}
                  key={displayedInteractiveCode}
                  initial={shouldReduceMotion ? false : { opacity: 0.6, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={
                    shouldReduceMotion ? { duration: 0 } : { duration: 0.18, ease: EASE_OUT }
                  }
                >
                  <span className="mr-3 inline-block w-3 text-(--color-success)">
                    {interactiveLine.prefix}
                  </span>
                  {displayedInteractiveCode}
                </motion.div>
              </div>

              <div className="grid grid-cols-[1fr] sm:grid-cols-[4.25rem_4.25rem_1fr]">
                <div className="hidden border-r border-[color-mix(in_srgb,var(--color-success)_35%,var(--color-border))] sm:block" />
                <div className="hidden border-r border-[color-mix(in_srgb,var(--color-success)_35%,var(--color-border))] sm:block" />
                <div className="px-2.5 pt-1 pb-2.5 sm:px-3 sm:pb-3">
                  <div className="overflow-hidden rounded-[1rem] border border-border bg-background shadow-[0_10px_30px_color-mix(in_srgb,var(--foreground)_10%,transparent)]">
                    <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2.5 text-sm text-muted-foreground sm:px-4 sm:py-3">
                      <div>
                        Comment on line <span className="font-semibold text-foreground">R44</span>
                      </div>
                      {step === "resolved" ? (
                        <div className="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-foreground">
                          Resolved
                        </div>
                      ) : null}
                    </div>

                    <div className="divide-y divide-border">
                      <div className="bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-error)_10%,transparent),color-mix(in_srgb,var(--color-card)_75%,transparent))] px-3 py-3 sm:px-4 sm:py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex size-8 items-center justify-center overflow-hidden rounded-full bg-muted">
                            <Image
                              src="/images/logo.png"
                              alt="Hyperlocalise logo"
                              width={32}
                              height={32}
                              className="size-full object-cover"
                            />
                          </div>
                          <div className="min-w-0 text-sm text-foreground">
                            <span className="font-semibold">Hyperlocalise</span>{" "}
                            <span className="text-muted-foreground">requested changes</span>
                          </div>
                        </div>

                        <div className="mt-2.5 border-l-2 border-(--color-error) bg-[color-mix(in_srgb,var(--color-error)_10%,var(--color-card))] px-3 py-2 text-sm leading-6 text-foreground sm:mt-3 sm:py-2.5">
                          <div className="font-semibold text-(--color-error)">
                            {interactiveLine.reviewTitle}
                          </div>
                          <div className="mt-1">{interactiveLine.reviewBody}</div>
                        </div>
                      </div>

                      {showComposer ? (
                        <div className="px-3 py-3 sm:px-4 sm:py-4">
                          <div className="mt-2.5 overflow-hidden rounded-xl bg-muted/40 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--border)_85%,transparent),inset_0_1px_0_color-mix(in_srgb,var(--background)_80%,transparent)] sm:mt-3">
                            <textarea
                              value={COMMENT_DRAFT}
                              className="min-h-22 w-full resize-none border-0 bg-transparent px-3 py-2.5 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground sm:min-h-24 sm:py-3"
                              disabled
                            />
                            <div className="flex items-center justify-between gap-2.5 border-t border-border bg-background px-3 py-2 sm:gap-3 sm:py-2.5">
                              <div className="text-xs text-muted-foreground">
                                Mention Hyperlocalise to patch the diff in-thread.
                              </div>
                              <motion.button
                                type="button"
                                onClick={handleSend}
                                className="rounded-md border border-(--color-success) bg-(--color-success) px-3 py-1.5 text-sm font-semibold text-(--color-success-foreground) shadow-[0_0_0_1px_color-mix(in_srgb,var(--background)_3%,transparent)_inset] transition-colors hover:bg-[color:color-mix(in_srgb,var(--color-success)_90%,black)] disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground"
                                whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
                              >
                                Comment
                              </motion.button>
                            </div>
                          </div>
                        </div>
                      ) : null}

                      <motion.div
                        className="overflow-hidden bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-info)_12%,transparent),color-mix(in_srgb,var(--color-card)_82%,transparent))]"
                        initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
                        animate={
                          shouldReduceMotion
                            ? { opacity: 1, y: 0, height: "auto" }
                            : step === "draft"
                              ? { opacity: 0, y: 10, height: 0 }
                              : { opacity: 1, y: 0, height: "auto" }
                        }
                        transition={
                          shouldReduceMotion ? { duration: 0 } : { duration: 0.2, ease: EASE_OUT }
                        }
                      >
                        <div className="px-3 py-2.5 sm:px-4 sm:py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex size-8 items-center justify-center overflow-hidden rounded-full bg-(--color-info)">
                              <Image
                                src="/images/logo.png"
                                alt="Hyperlocalise logo"
                                width={32}
                                height={32}
                                className="size-full object-cover"
                              />
                            </div>
                            <div className="min-w-0 text-sm text-foreground">
                              <span className="font-semibold">Hyperlocalise</span>{" "}
                              <span className="text-muted-foreground">
                                {step === "resolved" ? "resolved the thread" : "is replying"}
                              </span>
                            </div>
                          </div>
                          <div className="mt-2.5 border-l-2 border-(--color-info) pl-3 text-sm leading-6 text-foreground sm:mt-3 sm:pl-4">
                            {step === "fixing" ? (
                              <div className="flex items-center gap-3">
                                <DotFlow
                                  items={dotItems}
                                  direction="horizontal"
                                  autoPlay={4000}
                                  spacing={10}
                                  matrix={{
                                    interval: 180,
                                    cols: 4,
                                    rows: 4,
                                    dotSize: 3,
                                    gap: 1,
                                    color: "var(--color-info)",
                                    inactiveColor:
                                      "color-mix(in_srgb,var(--color-info)_16%,transparent)",
                                  }}
                                />
                                <div>
                                  <div className="font-medium text-(--color-info)">Fixing</div>
                                  <div className="text-muted-foreground">
                                    Updating the string to use the correct accented French noun.
                                  </div>
                                </div>
                              </div>
                            ) : step === "resolved" ? (
                              <div className="space-y-2.5 sm:space-y-3">
                                <div className="font-medium text-(--color-success)">
                                  Fixed and committed to this branch.
                                </div>
                                <div className="text-muted-foreground">
                                  Replaced{" "}
                                  <code className="rounded bg-muted px-1 py-0.5 text-foreground">
                                    marches
                                  </code>{" "}
                                  with{" "}
                                  <code className="rounded bg-muted px-1 py-0.5 text-foreground">
                                    marchés
                                  </code>{" "}
                                  so the French pricing copy is spelled correctly.
                                </div>
                                <div>
                                  <button
                                    type="button"
                                    onClick={handleReset}
                                    className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                                  >
                                    Reset
                                  </button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </motion.div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {remainingAfterLines.map((line) => (
              <div
                key={`after-${line.code}`}
                className="grid grid-cols-[1fr] bg-[color-mix(in_srgb,var(--color-success)_12%,var(--color-card))] sm:grid-cols-[4.25rem_4.25rem_1fr]"
              >
                <div className="hidden border-r border-[color-mix(in_srgb,var(--color-success)_35%,var(--color-border))] px-2.5 text-right text-muted-foreground sm:block sm:px-3">
                  {line.left}
                </div>
                <div className="hidden border-r border-[color-mix(in_srgb,var(--color-success)_35%,var(--color-border))] px-2.5 text-right text-muted-foreground sm:block sm:px-3">
                  {line.right}
                </div>
                <div className="overflow-hidden px-2.5 text-ellipsis whitespace-nowrap text-card-foreground sm:px-3">
                  <span className="mr-3 inline-block w-3 text-(--color-success)">
                    {line.prefix}
                  </span>
                  {line.code}
                </div>
              </div>
            ))}

            <div className="grid grid-cols-[1fr] sm:grid-cols-[4.25rem_4.25rem_1fr]">
              <div className="hidden border-r border-[color-mix(in_srgb,var(--color-success)_35%,var(--color-border))] px-2.5 text-right text-muted-foreground sm:block sm:px-3">
                46
              </div>
              <div className="hidden border-r border-[color-mix(in_srgb,var(--color-success)_35%,var(--color-border))] px-2.5 text-right text-muted-foreground sm:block sm:px-3">
                46
              </div>
              <div className="px-2.5 text-card-foreground sm:px-3">{`}`}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
