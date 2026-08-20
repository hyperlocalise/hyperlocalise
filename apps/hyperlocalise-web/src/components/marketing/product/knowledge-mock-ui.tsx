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
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Brain01Icon,
  CheckmarkCircle02Icon,
  BookOpen01Icon,
  LanguageCircleIcon,
  UserCheck01Icon,
  GlobalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage } from "react-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/primitives/cn";
import { REQUEST_DEMO_URL } from "@/components/marketing/request-demo";

import { knowledgeMockMessages } from "./knowledge-mock-ui.messages";

const STEP_PAUSE_MS = 1400;
const DROP_MS = 260;
const EAT_HOLD_MS = 150;
const UPDATED_FLASH_MS = 900;
const RESET_PAUSE_MS = 600;

type MemoryItem = {
  id: string;
  titleKey: keyof typeof knowledgeMockMessages;
  tagKey: keyof typeof knowledgeMockMessages;
  timestampKey: keyof typeof knowledgeMockMessages;
  tagIcon: React.ReactNode;
  isNewest?: boolean;
};

type Stage = {
  number: number;
  titleKey: keyof typeof knowledgeMockMessages;
  descKey: keyof typeof knowledgeMockMessages;
};

const STAGES: Stage[] = [
  { number: 1, titleKey: "stage1Title", descKey: "stage1Desc" },
  { number: 2, titleKey: "stage2Title", descKey: "stage2Desc" },
  { number: 3, titleKey: "stage3Title", descKey: "stage3Desc" },
  { number: 4, titleKey: "stage4Title", descKey: "stage4Desc" },
];

const ALL_ITEMS: MemoryItem[] = [
  {
    id: "glossary",
    titleKey: "memoryItem0Title",
    tagKey: "tagGlossary",
    timestampKey: "tsLastWeek",
    tagIcon: <HugeiconsIcon icon={BookOpen01Icon} strokeWidth={1.8} className="size-3" />,
  },
  {
    id: "markets",
    titleKey: "memoryItem1Title",
    tagKey: "tagMarkets",
    timestampKey: "tsYesterday",
    tagIcon: <HugeiconsIcon icon={GlobalIcon} strokeWidth={1.8} className="size-3" />,
  },
  {
    id: "reviewers",
    titleKey: "memoryItem2Title",
    tagKey: "tagReviewers",
    timestampKey: "ts3hAgo",
    tagIcon: <HugeiconsIcon icon={UserCheck01Icon} strokeWidth={1.8} className="size-3" />,
  },
  {
    id: "translations",
    titleKey: "memoryItem3Title",
    tagKey: "tagTranslations",
    timestampKey: "tsJustNow",
    tagIcon: <HugeiconsIcon icon={LanguageCircleIcon} strokeWidth={1.8} className="size-3" />,
    isNewest: true,
  },
];

function MemoryItemRow({ item }: { item: MemoryItem }) {
  return (
    <div className="flex items-start gap-3">
      <HugeiconsIcon
        icon={CheckmarkCircle02Icon}
        strokeWidth={1.8}
        className="mt-0.5 size-4 shrink-0 text-primary/60"
      />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">
          <FormattedMessage {...knowledgeMockMessages[item.titleKey]} />
        </p>
        <div className="mt-1 flex items-center gap-1.5">
          <span className="flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {item.tagIcon}
            <FormattedMessage {...knowledgeMockMessages[item.tagKey]} />
          </span>
          <span className="text-[10px] text-muted-foreground/50">·</span>
          <span className="text-[10px] text-muted-foreground/50">
            <FormattedMessage {...knowledgeMockMessages[item.timestampKey]} />
          </span>
        </div>
      </div>
    </div>
  );
}

function MemoryPanel({
  items,
  eatenUpTo,
  headerY,
  showUpdated,
  cardTops,
  panelHeight,
  headerCardHeight,
  risingIndex,
}: {
  items: MemoryItem[];
  eatenUpTo: number;
  headerY: number;
  showUpdated: boolean;
  cardTops: number[];
  panelHeight: number;
  headerCardHeight: number;
  risingIndex: number;
}) {
  return (
    <div
      className="relative w-full overflow-hidden"
      style={{ height: panelHeight > 0 ? panelHeight : undefined }}
    >
      {items.map((item, i) => {
        if (i < eatenUpTo) return null;

        const cardStep = cardTops.length > 1 ? cardTops[1]! - cardTops[0]! : 0;
        const shiftUp = (eatenUpTo * cardStep) / 2;
        const riseAmount = i === risingIndex ? -(cardStep / 2) : 0;

        return (
          <motion.div
            key={item.id}
            className="absolute overflow-hidden z-0"
            style={{
              top: cardTops[i] ?? 0,
              left: i === risingIndex ? 40 : 16,
              right: i === risingIndex ? 40 : 16,
            }}
            animate={{ y: -shiftUp + riseAmount }}
            transition={{ duration: DROP_MS / 1000, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            <AnimatePresence>
              {i >= eatenUpTo && (
                <motion.div
                  initial={false}
                  animate={{
                    height: i === risingIndex ? headerCardHeight : "auto",
                    paddingTop: i === risingIndex ? 16 : 12,
                    paddingBottom: i === risingIndex ? 16 : 12,
                  }}
                  exit={{
                    opacity: 0,
                    height: headerCardHeight,
                    paddingTop: 16,
                    paddingBottom: 16,
                    transition: { duration: 0.5, ease: "easeInOut" },
                  }}
                  className={cn(
                    "overflow-hidden rounded-xl border px-4 shadow-sm",
                    item.isNewest
                      ? "border-primary/35 bg-primary/6"
                      : "border-border bg-background",
                  )}
                >
                  <MemoryItemRow item={item} />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}

      {/* Mask — covers area above header so rising cards are hidden before reaching it */}
      <motion.div
        className="absolute inset-x-0 top-0 z-30 bg-card"
        animate={{ height: 16 + headerY }}
        transition={{ duration: DROP_MS / 1000, ease: "easeInOut" }}
      />
      <motion.div
        className={cn(
          "absolute inset-x-10 top-2 z-40 rounded-xl border bg-background px-4 py-4 shadow-md transition-colors duration-200",
          showUpdated ? "border-primary/50" : "border-border",
        )}
        animate={{ y: headerY }}
        transition={{ duration: DROP_MS / 1000, ease: "easeInOut" }}
      >
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-2.5">
            <HugeiconsIcon icon={Brain01Icon} strokeWidth={1.8} className="size-4 text-primary" />
            <span className="truncate text-sm font-semibold text-foreground">
              <FormattedMessage {...knowledgeMockMessages.memoryLayerTitle} />
            </span>
          </div>
          <AnimatePresence>
            {showUpdated && (
              <motion.span
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
                className="text-xs font-medium text-primary"
              >
                <FormattedMessage {...knowledgeMockMessages.updated} />
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}

function MeasureClone({
  items,
  measureRef,
}: {
  items: MemoryItem[];
  measureRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={measureRef}
      aria-hidden
      className="pointer-events-none invisible absolute inset-x-4 top-4 flex flex-col gap-3"
    >
      <div className="rounded-xl border border-border bg-background px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="size-4" />
          <span className="text-sm font-semibold">measure</span>
        </div>
      </div>
      {items.map((item) => (
        <div key={item.id} className="rounded-xl border border-border bg-background px-4 py-3">
          <MemoryItemRow item={item} />
        </div>
      ))}
    </div>
  );
}

function StagePanel({ activeStageIndex }: { activeStageIndex: number }) {
  return (
    <div className="flex h-full flex-col justify-between px-6 py-5">
      <div>
        <p className="mb-2 text-xs font-semibold tracking-[0.18em] text-primary uppercase">
          <FormattedMessage {...knowledgeMockMessages.eyebrow} />
        </p>
        <h3 className="mb-6 font-heading text-xl font-semibold leading-snug tracking-normal text-foreground sm:text-2xl">
          <FormattedMessage {...knowledgeMockMessages.headline} />
        </h3>
        <div className="flex flex-col gap-1">
          {STAGES.map((stage, i) => {
            const isActive = i === activeStageIndex;
            return (
              <div key={stage.number} className="flex items-start gap-3">
                <div className="flex flex-col items-center">
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold transition-all duration-300",
                      isActive
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border/60 bg-muted/30 text-muted-foreground",
                    )}
                  >
                    {stage.number}
                  </span>
                  {i < STAGES.length - 1 && <span className="mt-0.5 h-4 w-px bg-border/40" />}
                </div>
                <div className="pb-3">
                  <p
                    className={cn(
                      "text-xs font-semibold leading-snug transition-colors duration-300",
                      isActive ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    <FormattedMessage {...knowledgeMockMessages[stage.titleKey]} />
                  </p>
                  <p
                    className={cn(
                      "mt-0.5 text-xs leading-relaxed transition-colors duration-300",
                      isActive ? "text-muted-foreground" : "text-muted-foreground/40",
                    )}
                  >
                    <FormattedMessage {...knowledgeMockMessages[stage.descKey]} />
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-4 flex items-center">
        <Button
          variant="outline"
          size="lg"
          nativeButton={false}
          render={<a href={REQUEST_DEMO_URL} target="_blank" rel="noopener noreferrer" />}
          className="cursor-pointer rounded-sm"
        >
          <FormattedMessage {...knowledgeMockMessages.requestDemo} />
        </Button>
      </div>
    </div>
  );
}

export function KnowledgeMockUI() {
  const shouldReduceMotion = useReducedMotion();
  const measureRef = useRef<HTMLDivElement>(null);

  const [cardTops, setCardTops] = useState<number[]>([]);
  const [panelHeight, setPanelHeight] = useState(0);
  const [headerCardHeight, setHeaderCardHeight] = useState(0);
  const [risingIndex, setRisingIndex] = useState(-1);

  const [eatenUpTo, setEatenUpTo] = useState(0);
  const [headerY, setHeaderY] = useState(0);
  const [showUpdated, setShowUpdated] = useState(false);
  const [activeStageIndex, setActiveStageIndex] = useState(0);
  const [loopKey, setLoopKey] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => {
      if (!measureRef.current) return;
      const parent = measureRef.current;
      const parentRect = parent.getBoundingClientRect();
      const children = Array.from(parent.children) as HTMLElement[];

      const headerEl = children[0];
      if (headerEl) {
        setHeaderCardHeight(headerEl.getBoundingClientRect().height);
      }
      const tops = children.slice(1).map((el) => {
        return el.getBoundingClientRect().top - parentRect.top + 16; // +16 for top-4 offset
      });

      const lastChild = children[children.length - 1];
      const totalHeight = lastChild
        ? lastChild.getBoundingClientRect().bottom - parentRect.top + 20
        : 300;

      setCardTops(tops);
      setPanelHeight(totalHeight);
    }, 100);

    return () => clearTimeout(t);
  }, [loopKey]);

  useEffect(() => {
    if (shouldReduceMotion || cardTops.length === 0) return;

    let step = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const runStep = () => {
      if (step >= ALL_ITEMS.length) {
        const t = setTimeout(() => {
          setEatenUpTo(0);
          setHeaderY(0);
          setActiveStageIndex(0);
          setRisingIndex(-1);
          setLoopKey((k) => k + 1);
        }, RESET_PAUSE_MS);
        timers.push(t);
        return;
      }

      const cardStep = cardTops.length > 1 ? cardTops[1]! - cardTops[0]! : 0;
      setHeaderY((prev) => prev + cardStep / 2);
      setRisingIndex(step);

      const eatT = setTimeout(() => {
        setEatenUpTo(step + 1);
        setShowUpdated(true);
        setTimeout(() => setRisingIndex(-1), 300);
        setActiveStageIndex(step % STAGES.length);
        step += 1;

        const flashT = setTimeout(() => setShowUpdated(false), UPDATED_FLASH_MS);
        timers.push(flashT);

        const nextT = setTimeout(runStep, STEP_PAUSE_MS);
        timers.push(nextT);
      }, DROP_MS + EAT_HOLD_MS);

      timers.push(eatT);
    };

    const startT = setTimeout(runStep, STEP_PAUSE_MS);
    timers.push(startT);

    return () => timers.forEach(clearTimeout);
  }, [shouldReduceMotion, cardTops, loopKey]);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-2xl shadow-gray-alpha-100">
      <div className="grid min-h-[22rem] md:grid-cols-[1.4fr_1fr]">
        <div className="relative border-b border-border/60 md:border-b-0 md:border-r">
          <MeasureClone items={ALL_ITEMS} measureRef={measureRef} />
          {panelHeight > 0 && (
            <MemoryPanel
              key={loopKey}
              items={ALL_ITEMS}
              eatenUpTo={eatenUpTo}
              headerY={headerY}
              showUpdated={showUpdated}
              cardTops={cardTops}
              panelHeight={panelHeight}
              headerCardHeight={headerCardHeight}
              risingIndex={risingIndex}
            />
          )}
        </div>
        <StagePanel activeStageIndex={activeStageIndex} />
      </div>
    </div>
  );
}
