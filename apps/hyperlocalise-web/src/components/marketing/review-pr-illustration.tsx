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
      ? "border-[#1f6f43] bg-[#16351f] text-[#7ee787]"
      : step === "fixing"
        ? "border-[#1f6feb] bg-[#1f6feb26] text-[#79c0ff]"
        : "border-[#9e6a03] bg-[#bb800926] text-[#f2cc60]";
  const displayedInteractiveCode =
    step === "resolved" ? interactiveLine.resolvedCode : interactiveLine.fixingCode;
  const showComposer = step === "draft";

  return (
    <div className="relative overflow-hidden rounded-xl mask-radial-from-85% mask-radial-at-top bg-background border-border">
      <div className="relative flex items-center justify-between gap-3 border-b bg-background border-border px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[0.72rem] font-medium tracking-[0.02em] text-[#8b949e]">
            <motion.span
              className="inline-flex size-2 rounded-full bg-[#3fb950]"
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
          <div className="mt-1 text-sm text-[#c9d1d9]">review translation updates</div>
          <div className="mt-3">
            <div className="mt-1 text-sm text-[#c9d1d9]">
              {step === "resolved"
                ? "3 strings changed, 1 French typo corrected directly from the PR thread"
                : "3 strings changed, 1 translation issue called out before merge"}
            </div>
          </div>
        </div>

        <motion.div
          className={`rounded-full border px-3 py-1 text-xs font-medium ${statusClassName}`}
          key={statusLabel}
          initial={shouldReduceMotion ? false : { opacity: 0, y: 8, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.18, ease: EASE_OUT }}
        >
          {statusLabel}
        </motion.div>
      </div>

      <div className="relative p-3 sm:p-5">
        <div className="overflow-hidden rounded-[1.35rem] border border-[#30363d] bg-[#0d1117]">
          <div className="grid grid-cols-[4.25rem_4.25rem_1fr] border-b border-[#30363d] bg-[#161b22] px-3 py-2 text-[0.68rem] font-semibold tracking-[0.18em] text-[#8b949e] uppercase">
            <span>Old</span>
            <span>New</span>
            <span>Diff</span>
          </div>

          <div className="border-b border-[#30363d] bg-[#0d1117] px-3 py-2 font-mono text-[0.8rem] leading-7 text-[#c9d1d9]">
            <div className="grid grid-cols-[4.25rem_4.25rem_1fr] gap-0 rounded-t-lg bg-[#12261e]">
              <div className="border-r border-[#1b4721] px-3 text-right text-[#7d8590]">41</div>
              <div className="border-r border-[#1b4721] px-3 text-right text-[#7d8590]">41</div>
              <div className="px-3 text-[#e6edf3]">{`{`}</div>
            </div>

            {beforeLines.map((line) => (
              <div
                key={`before-${line.code}`}
                className="grid grid-cols-[4.25rem_4.25rem_1fr] gap-0 bg-[#30151c]"
              >
                <div className="border-r border-[#5c1e28] px-3 text-right text-[#7d8590]">
                  {line.left}
                </div>
                <div className="border-r border-[#5c1e28] px-3 text-right text-[#7d8590]">
                  {line.right}
                </div>
                <div className="overflow-hidden px-3 text-ellipsis whitespace-nowrap text-[#ffdcd7]">
                  <span className="mr-3 inline-block w-3 text-[#f85149]">{line.prefix}</span>
                  {line.code}
                </div>
              </div>
            ))}

            <div className={`${step === "resolved" ? "bg-[#16351f]" : "bg-[#12261e]"}`}>
              <div className="grid grid-cols-[4.25rem_4.25rem_1fr] gap-0">
                <div className="border-r border-[#1b4721] px-3 text-right text-[#7d8590]">
                  {interactiveLine.left}
                </div>
                <div className="border-r border-[#1b4721] px-3 text-right text-[#7d8590]">
                  {interactiveLine.right}
                </div>
                <motion.div
                  className={`overflow-hidden px-3 text-ellipsis whitespace-nowrap ${
                    step === "resolved" ? "text-[#d2f7d7]" : "text-[#aff5b4]"
                  }`}
                  key={displayedInteractiveCode}
                  initial={shouldReduceMotion ? false : { opacity: 0.6, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={
                    shouldReduceMotion ? { duration: 0 } : { duration: 0.18, ease: EASE_OUT }
                  }
                >
                  <span className="mr-3 inline-block w-3 text-[#3fb950]">
                    {interactiveLine.prefix}
                  </span>
                  {displayedInteractiveCode}
                </motion.div>
              </div>

              <div className="grid grid-cols-[4.25rem_4.25rem_1fr] gap-0">
                <div className="border-r border-[#1b4721]" />
                <div className="border-r border-[#1b4721]" />
                <div className="px-3 pt-1 pb-3">
                  <div className="overflow-hidden rounded-[1rem] border border-[#30363d] bg-[#161b22] shadow-[0_10px_30px_rgba(1,4,9,0.2)]">
                    <div className="flex items-center justify-between gap-3 border-b border-[#30363d] px-4 py-3 text-sm text-[#8b949e]">
                      <div>
                        Comment on line <span className="font-semibold text-[#c9d1d9]">R44</span>
                      </div>
                      {step === "resolved" ? (
                        <div className="rounded-full border border-[#30363d] px-2.5 py-1 text-xs font-medium text-[#c9d1d9]">
                          Resolved
                        </div>
                      ) : null}
                    </div>

                    <div className="divide-y divide-[#30363d]">
                      <div className="bg-[linear-gradient(180deg,rgba(248,81,73,0.08),rgba(13,17,23,0.2))] px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex size-8 items-center justify-center overflow-hidden rounded-full bg-[#30363d]">
                            <Image
                              src="/images/logo.png"
                              alt="Hyperlocalise logo"
                              width={32}
                              height={32}
                              className="size-full object-cover"
                            />
                          </div>
                          <div className="min-w-0 text-sm text-[#c9d1d9]">
                            <span className="font-semibold text-white">Hyperlocalise</span>{" "}
                            <span className="text-[#8b949e]">requested changes</span>
                          </div>
                        </div>

                        <div className="mt-3 border-l-2 border-[#f85149] bg-[#2a1318]/70 px-3 py-2.5 text-sm leading-6 text-[#ffdcd7]">
                          <div className="font-semibold text-[#ffb3aa]">
                            {interactiveLine.reviewTitle}
                          </div>
                          <div className="mt-1">{interactiveLine.reviewBody}</div>
                        </div>
                      </div>

                      {showComposer ? (
                        <div className="px-4 py-4">
                          <div className="mt-3 overflow-hidden rounded-xl bg-[#0b0f14] shadow-[inset_0_0_0_1px_rgba(48,54,61,0.75),inset_0_1px_0_rgba(255,255,255,0.03)]">
                            <textarea
                              value={COMMENT_DRAFT}
                              className="min-h-24 w-full resize-none border-0 bg-transparent px-3 py-3 text-sm leading-6 text-[#c9d1d9] outline-none placeholder:text-[#6e7681]"
                              disabled
                            />
                            <div className="flex items-center justify-between gap-3 border-t border-[#30363d] bg-[#0d1117] px-3 py-2.5">
                              <div className="text-xs text-[#8b949e]">
                                Mention Hyperlocalise to patch the diff in-thread.
                              </div>
                              <motion.button
                                type="button"
                                onClick={handleSend}
                                className="rounded-md border border-[#1f6feb] bg-[#238636] px-3 py-1.5 text-sm font-semibold text-white shadow-[0_0_0_1px_rgba(255,255,255,0.03)_inset] transition-colors hover:bg-[#2ea043] disabled:cursor-not-allowed disabled:border-[#30363d] disabled:bg-[#21262d] disabled:text-[#8b949e]"
                                whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
                              >
                                Comment
                              </motion.button>
                            </div>
                          </div>
                        </div>
                      ) : null}

                      <motion.div
                        className="overflow-hidden bg-[linear-gradient(180deg,rgba(31,111,235,0.1),rgba(13,17,23,0.08))]"
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
                        <div className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex size-8 items-center justify-center overflow-hidden rounded-full bg-[#1f6feb]">
                              <Image
                                src="/images/logo.png"
                                alt="Hyperlocalise logo"
                                width={32}
                                height={32}
                                className="size-full object-cover"
                              />
                            </div>
                            <div className="min-w-0 text-sm text-[#c9d1d9]">
                              <span className="font-semibold text-white">Hyperlocalise</span>{" "}
                              <span className="text-[#8b949e]">
                                {step === "resolved" ? "resolved the thread" : "is replying"}
                              </span>
                            </div>
                          </div>
                          <div className="mt-3 border-l-2 border-[#1f6feb] pl-4 text-sm leading-6 text-[#c9d1d9]">
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
                                    color: "#79c0ff",
                                    inactiveColor: "rgba(121, 192, 255, 0.12)",
                                  }}
                                />
                                <div>
                                  <div className="font-medium text-[#79c0ff]">Fixing</div>
                                  <div className="text-[#8b949e]">
                                    Updating the string to use the correct accented French noun.
                                  </div>
                                </div>
                              </div>
                            ) : step === "resolved" ? (
                              <div className="space-y-3">
                                <div className="font-medium text-[#7ee787]">
                                  Fixed and committed to this branch.
                                </div>
                                <div className="text-[#8b949e]">
                                  Replaced{" "}
                                  <code className="rounded bg-white/6 px-1 py-0.5 text-[#f0f6fc]">
                                    marches
                                  </code>{" "}
                                  with{" "}
                                  <code className="rounded bg-white/6 px-1 py-0.5 text-[#f0f6fc]">
                                    marchés
                                  </code>{" "}
                                  so the French pricing copy is spelled correctly.
                                </div>
                                <div>
                                  <button
                                    type="button"
                                    onClick={handleReset}
                                    className="rounded-md border border-[#30363d] px-3 py-1.5 text-sm font-medium text-[#c9d1d9] transition-colors hover:bg-white/5"
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
                className="grid grid-cols-[4.25rem_4.25rem_1fr] gap-0 bg-[#12261e]"
              >
                <div className="border-r border-[#1b4721] px-3 text-right text-[#7d8590]">
                  {line.left}
                </div>
                <div className="border-r border-[#1b4721] px-3 text-right text-[#7d8590]">
                  {line.right}
                </div>
                <div className="overflow-hidden px-3 text-ellipsis whitespace-nowrap text-[#aff5b4]">
                  <span className="mr-3 inline-block w-3 text-[#3fb950]">{line.prefix}</span>
                  {line.code}
                </div>
              </div>
            ))}

            <div className="grid grid-cols-[4.25rem_4.25rem_1fr] gap-0 rounded-b-lg bg-[#12261e]">
              <div className="border-r border-[#1b4721] px-3 text-right text-[#7d8590]">46</div>
              <div className="border-r border-[#1b4721] px-3 text-right text-[#7d8590]">46</div>
              <div className="px-3 text-[#e6edf3]">{`}`}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
