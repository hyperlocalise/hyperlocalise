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
import {
  ArrowClockwiseIcon,
  CheckIcon,
  GlobeIcon,
  ProhibitIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TypographyH1, TypographyP } from "@/components/ui/typography";
import type {
  LocalisationAuditProgressSnapshot,
  LocalisationAuditProgressStage,
} from "@/lib/localisation-audit/types";
import { LOCALISATION_AUDIT_USER_AGENT } from "@/lib/localisation-audit/user-agent";
import { cn } from "@/lib/primitives/cn";

import type { LocalisationAuditResultCopy } from "./localisation-audit-page-content";
import { TweenNumber } from "./localisation-audit-score-visuals";
import { LocalisationAuditSiteMark } from "./localisation-audit-site-mark";

const PROGRESS_STAGES = ["queued", "preparing", "crawling", "analyzing", "scoring"] as const;
type ProgressStage = (typeof PROGRESS_STAGES)[number];

/** Overall progress range per stage. Crawling and analysis take most of the run. */
const STAGE_PROGRESS: Record<ProgressStage, { start: number; end: number }> = {
  queued: { start: 2, end: 6 },
  preparing: { start: 6, end: 15 },
  crawling: { start: 15, end: 55 },
  analyzing: { start: 55, end: 90 },
  scoring: { start: 90, end: 98 },
};

/** Seconds for progress to cover ~63% of the current stage's range. */
const STAGE_CREEP_SECONDS = 25;
const PROGRESS_TICK_MS = 500;
const FEED_STAGGER_SECONDS = 0.07;

export function stageIndex(stage: LocalisationAuditProgressStage | null | undefined) {
  if (!stage || stage === "failed") return 0;
  if (stage === "completed") return PROGRESS_STAGES.length - 1;
  const index = (PROGRESS_STAGES as readonly string[]).indexOf(stage);
  return index >= 0 ? index : 0;
}

/**
 * Progress inside a stage creeps toward the stage's end but never reaches it, so the
 * bar keeps moving between polls without claiming work that has not happened.
 */
function useCreepingProgress(stage: ProgressStage) {
  const reduceMotion = useReducedMotion();
  const [elapsed, setElapsed] = useState(0);
  const stageStartedAt = useRef(Date.now());

  useEffect(() => {
    stageStartedAt.current = Date.now();
    setElapsed(0);
    if (reduceMotion) return;
    const timer = window.setInterval(() => {
      setElapsed((Date.now() - stageStartedAt.current) / 1000);
    }, PROGRESS_TICK_MS);
    return () => window.clearInterval(timer);
  }, [reduceMotion, stage]);

  const { start, end } = STAGE_PROGRESS[stage];
  return start + (end - start) * (1 - Math.exp(-elapsed / STAGE_CREEP_SECONDS));
}

function StatusShell({ children }: { children: ReactNode }) {
  return <section className="px-5 pt-12 pb-20 sm:px-8 sm:pt-16 lg:px-10">{children}</section>;
}

function DomainLine({ domainKey }: { domainKey: string }) {
  return (
    <div className="flex items-center gap-3">
      <LocalisationAuditSiteMark domainKey={domainKey} companyName={null} logoUrl={null} />
      <span className="text-sm font-medium text-muted-foreground">{domainKey}</span>
    </div>
  );
}

function StageStepper({
  activeIndex,
  copy,
}: {
  activeIndex: number;
  copy: LocalisationAuditResultCopy;
}) {
  const reduceMotion = useReducedMotion();
  const labels: Record<ProgressStage, string> = {
    queued: copy.progressQueued,
    preparing: copy.progressPreparing,
    crawling: copy.progressCrawling,
    analyzing: copy.progressAnalyzing,
    scoring: copy.progressScoring,
  };
  const details: Record<ProgressStage, string> = {
    queued: copy.progressQueuedDetail,
    preparing: copy.progressPreparingDetail,
    crawling: copy.progressCrawlingDetail,
    analyzing: copy.progressAnalyzingDetail,
    scoring: copy.progressScoringDetail,
  };
  const currentStage = PROGRESS_STAGES[activeIndex]!;

  return (
    <>
      <ol className="space-y-0" aria-label={copy.progressBarLabel}>
        {PROGRESS_STAGES.map((stage, index) => {
          const done = index < activeIndex;
          const current = index === activeIndex;
          const isLast = index === PROGRESS_STAGES.length - 1;
          return (
            <li
              key={stage}
              className="relative flex gap-3 pb-6 last:pb-0"
              aria-current={current ? "step" : undefined}
            >
              {isLast ? null : (
                <span
                  aria-hidden
                  className="absolute start-3 top-7 bottom-1 w-px -translate-x-1/2 overflow-hidden bg-border rtl:translate-x-1/2"
                >
                  <motion.span
                    className="block h-full w-full origin-top bg-foreground"
                    initial={false}
                    animate={{ scaleY: done ? 1 : 0 }}
                    transition={{ duration: reduceMotion ? 0 : 0.5, ease: "easeOut" }}
                  />
                </span>
              )}
              <span className="relative flex size-6 shrink-0 items-center justify-center">
                {current && !reduceMotion ? (
                  <motion.span
                    aria-hidden
                    className="absolute inset-0 rounded-full bg-foreground/15"
                    animate={{ scale: [1, 1.7], opacity: [0.6, 0] }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
                  />
                ) : null}
                <motion.span
                  className={cn(
                    "relative flex size-6 items-center justify-center rounded-full transition-colors duration-300",
                    done && "bg-foreground text-background",
                    current && "border-2 border-foreground bg-background",
                    !done && !current && "border border-border bg-background",
                  )}
                  initial={false}
                  animate={{ scale: current ? 1.08 : 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 22 }}
                >
                  <AnimatePresence initial={false}>
                    {done ? (
                      <motion.span
                        key="done"
                        initial={reduceMotion ? false : { scale: 0, rotate: -45 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: "spring", stiffness: 500, damping: 20 }}
                      >
                        <CheckIcon className="size-3.5" weight="bold" aria-hidden />
                      </motion.span>
                    ) : null}
                  </AnimatePresence>
                  {current ? <span className="size-2 rounded-full bg-foreground" /> : null}
                </motion.span>
              </span>
              <div className="min-w-0 pt-0.5">
                <p
                  className={cn(
                    "text-sm transition-colors duration-300",
                    current ? "font-medium text-foreground" : null,
                    done ? "text-foreground" : null,
                    !done && !current ? "text-muted-foreground" : null,
                  )}
                >
                  {labels[stage]}
                </p>
                <AnimatePresence initial={false}>
                  {current ? (
                    <motion.p
                      key={stage}
                      className="overflow-hidden text-pretty text-sm text-muted-foreground"
                      initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: reduceMotion ? 0 : 0.3, ease: "easeOut" }}
                    >
                      <span className="block pt-1">{details[stage]}</span>
                    </motion.p>
                  ) : null}
                </AnimatePresence>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="sr-only" aria-live="polite">
        {labels[currentStage]}. {details[currentStage]}
      </p>
    </>
  );
}

function ScanningPlaceholder({ label }: { label: string }) {
  const reduceMotion = useReducedMotion();
  return (
    <div className="space-y-3" aria-hidden>
      <p className="text-sm text-muted-foreground">{label}</p>
      {[72, 54, 64].map((width, index) => (
        <div
          key={width}
          className="relative h-3 overflow-hidden rounded-full bg-muted"
          style={{ width: `${width}%` }}
        >
          {reduceMotion ? null : (
            <motion.span
              className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-foreground/10 to-transparent"
              animate={{ left: ["-35%", "105%"] }}
              transition={{
                duration: 1.4,
                repeat: Infinity,
                ease: "easeInOut",
                delay: index * 0.2,
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function LiveFeed({
  snapshot,
  analyzing,
  copy,
}: {
  snapshot: LocalisationAuditProgressSnapshot | null | undefined;
  analyzing: boolean;
  copy: LocalisationAuditResultCopy;
}) {
  const reduceMotion = useReducedMotion();
  const item = (index: number) => ({
    initial: reduceMotion ? false : ({ opacity: 0, y: 6 } as const),
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.3, delay: reduceMotion ? 0 : index * FEED_STAGGER_SECONDS },
  });

  return (
    <div className="min-w-0 rounded-xl border border-border bg-muted/30 p-5" aria-live="polite">
      <p className="flex items-center gap-2 text-sm font-medium">
        <GlobeIcon className="size-4 text-muted-foreground" aria-hidden />
        {copy.liveHeading}
      </p>

      {!snapshot ? (
        <div className="mt-5">
          <ScanningPlaceholder label={copy.liveWaiting} />
        </div>
      ) : (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-background p-3">
              <dt className="sr-only">{copy.overviewPages}</dt>
              <dd className="font-serif text-3xl tracking-tight">
                <TweenNumber value={snapshot.pagesCrawled} />
              </dd>
              <dd className="text-xs text-muted-foreground">
                {copy.livePages({ count: snapshot.pagesCrawled })}
              </dd>
            </div>
            <div className="rounded-lg bg-background p-3">
              <dt className="sr-only">{copy.overviewLanguages}</dt>
              <dd className="font-serif text-3xl tracking-tight">
                <TweenNumber value={snapshot.locales.length} />
              </dd>
              <dd className="text-xs text-muted-foreground">
                {copy.liveLanguages({ count: snapshot.locales.length })}
              </dd>
            </div>
          </dl>

          {snapshot.locales.length > 0 ? (
            <ul className="mt-4 flex flex-wrap gap-1.5">
              {snapshot.locales.map((locale, index) => (
                <motion.li
                  key={locale}
                  {...item(index)}
                  className="rounded-full border border-border bg-background px-2.5 py-0.5 font-mono text-xs"
                >
                  {locale}
                </motion.li>
              ))}
            </ul>
          ) : null}

          {snapshot.pagePaths.length > 0 ? (
            <ul className="relative mt-4 space-y-1.5 overflow-hidden text-sm">
              {snapshot.pagePaths.map((path, index) => (
                <motion.li
                  key={path}
                  {...item(index + snapshot.locales.length)}
                  className="flex min-w-0 items-center gap-2"
                >
                  <CheckIcon className="size-3.5 shrink-0 text-success" aria-hidden />
                  <span className="truncate font-mono text-xs text-muted-foreground">{path}</span>
                </motion.li>
              ))}
              {analyzing && !reduceMotion ? (
                <motion.span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 h-6 bg-gradient-to-b from-transparent via-foreground/8 to-transparent"
                  animate={{ top: ["-15%", "100%"] }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: "linear" }}
                />
              ) : null}
            </ul>
          ) : null}

          {analyzing ? (
            <p className="mt-4 text-pretty text-xs text-muted-foreground">{copy.liveAnalyzing}</p>
          ) : null}
        </>
      )}
    </div>
  );
}

export function ReportEmailForm({
  id,
  email,
  onEmailChange,
  onSubmit,
  pending,
  submitLabel,
  pendingLabel,
  error,
  deliveryMessage,
  copy,
}: {
  id: string;
  email: string;
  onEmailChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  pending: boolean;
  submitLabel: string;
  pendingLabel: string;
  error: string | null;
  deliveryMessage: string | null;
  copy: LocalisationAuditResultCopy;
}) {
  return (
    <>
      <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1 space-y-2">
          <Label htmlFor={id}>{copy.emailLabel}</Label>
          <Input
            id={id}
            type="email"
            required
            autoComplete="email"
            placeholder={copy.emailPlaceholder}
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
          />
        </div>
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? pendingLabel : submitLabel}
        </Button>
      </form>
      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      {deliveryMessage ? (
        <p className="mt-3 text-sm text-muted-foreground" aria-live="polite">
          {deliveryMessage}
        </p>
      ) : null}
    </>
  );
}

export function LocalisationAuditRunningView({
  domainKey,
  progressStage,
  progressSnapshot,
  copy,
  emailForm,
}: {
  domainKey: string;
  progressStage: LocalisationAuditProgressStage | null | undefined;
  progressSnapshot: LocalisationAuditProgressSnapshot | null | undefined;
  copy: LocalisationAuditResultCopy;
  emailForm: ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const activeIndex = stageIndex(progressStage);
  const stage = PROGRESS_STAGES[activeIndex]!;
  const progress = useCreepingProgress(stage);
  const analyzing = stage === "analyzing" || stage === "scoring";

  return (
    <StatusShell>
      <div className="max-w-4xl">
        <DomainLine domainKey={domainKey} />
        <p className="mt-8 text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
          {copy.runningTitle}
        </p>
        <TypographyH1 className="mt-2 border-none break-words">
          {copy.runningHeading({ domain: domainKey })}
        </TypographyH1>
        <TypographyP className="mt-4 max-w-2xl" size="large" tone="subtle">
          {copy.runningBody}
        </TypographyP>
        <p className="mt-2 text-sm text-muted-foreground">{copy.expectedDuration}</p>

        <div className="mt-10 rounded-2xl border border-border bg-background p-5 shadow-xs sm:p-8">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-medium">{copy.progressBarLabel}</p>
            <p className="text-sm text-muted-foreground tabular-nums">
              {copy.progressStepOf({ current: activeIndex + 1, total: PROGRESS_STAGES.length })}
            </p>
          </div>
          <div
            className="relative mt-3 h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label={copy.progressBarLabel}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress)}
          >
            <motion.div
              className="absolute inset-y-0 start-0 w-full origin-left rounded-full bg-foreground rtl:origin-right"
              initial={false}
              animate={{ scaleX: progress / 100 }}
              transition={{ duration: reduceMotion ? 0 : 0.6, ease: "easeOut" }}
            />
            {reduceMotion ? null : (
              <motion.div
                aria-hidden
                className="absolute inset-y-0 w-24 bg-gradient-to-r from-transparent via-background/50 to-transparent"
                animate={{ left: ["-6rem", "100%"] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
              />
            )}
          </div>

          <div className="mt-8 grid gap-8 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <StageStepper activeIndex={activeIndex} copy={copy} />
            <LiveFeed snapshot={progressSnapshot} analyzing={analyzing} copy={copy} />
          </div>
        </div>

        <div className="mt-8 max-w-2xl rounded-2xl border border-border p-5 sm:p-6">
          <p className="font-medium">{copy.emailWhenReadyHeading}</p>
          <TypographyP className="mt-1" tone="subtle">
            {copy.emailWhenReadyBody}
          </TypographyP>
          <div className="mt-4">{emailForm}</div>
        </div>
      </div>
    </StatusShell>
  );
}

function StatusCard({
  icon,
  tone,
  domainKey,
  title,
  children,
}: {
  icon: ReactNode;
  tone: "risk" | "watch";
  domainKey: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <StatusShell>
      <div className="max-w-2xl">
        <DomainLine domainKey={domainKey} />
        <div className="mt-8 rounded-2xl border border-border p-6 sm:p-8">
          <span
            className={cn(
              "flex size-10 items-center justify-center rounded-full",
              tone === "risk" ? "bg-red-100 text-red-900" : "bg-beam-100 text-beam-900",
            )}
          >
            {icon}
          </span>
          <TypographyH1 className="mt-5 border-none" size="large">
            {title}
          </TypographyH1>
          {children}
        </div>
      </div>
    </StatusShell>
  );
}

export function LocalisationAuditStaleView({
  domainKey,
  copy,
  error,
  pending,
  onRetry,
}: {
  domainKey: string;
  copy: LocalisationAuditResultCopy;
  error: string | null;
  pending: boolean;
  onRetry: () => void;
}) {
  return (
    <StatusCard
      icon={<ArrowClockwiseIcon className="size-5" aria-hidden />}
      tone="watch"
      domainKey={domainKey}
      title={copy.staleTitle}
    >
      <TypographyP className="mt-3" tone="subtle">
        {copy.staleBody}
      </TypographyP>
      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
      <Button className="mt-6" onClick={onRetry} disabled={pending}>
        {pending ? copy.retrying : copy.retry}
      </Button>
    </StatusCard>
  );
}

export function LocalisationAuditFailedView({
  domainKey,
  errorMessage,
  copy,
  error,
  pending,
  onRetry,
}: {
  domainKey: string;
  errorMessage: string | null | undefined;
  copy: LocalisationAuditResultCopy;
  error: string | null;
  pending: boolean;
  onRetry: () => void;
}) {
  return (
    <StatusCard
      icon={<WarningCircleIcon className="size-5" aria-hidden />}
      tone="risk"
      domainKey={domainKey}
      title={copy.failedTitle}
    >
      <TypographyP className="mt-3" tone="subtle">
        {copy.failedBody}
      </TypographyP>
      <p className="mt-3 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
        {errorMessage ?? copy.failedFallback}
      </p>
      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
      <Button className="mt-6" onClick={onRetry} disabled={pending}>
        {pending ? copy.retrying : copy.retry}
      </Button>
    </StatusCard>
  );
}

export function LocalisationAuditBlockedView({
  domainKey,
  newAuditHref,
  copy,
}: {
  domainKey: string;
  newAuditHref: string;
  copy: LocalisationAuditResultCopy;
}) {
  return (
    <StatusCard
      icon={<ProhibitIcon className="size-5" aria-hidden />}
      tone="risk"
      domainKey={domainKey}
      title={copy.blockedTitle}
    >
      <TypographyP className="mt-3" tone="subtle">
        {copy.blockedBody}
      </TypographyP>
      <TypographyP className="mt-2" tone="subtle">
        {copy.blockedGuidance}
      </TypographyP>
      <p className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
        <span className="text-muted-foreground">{copy.blockedUserAgent}:</span>
        <code className="break-all rounded bg-muted px-1.5 py-0.5 text-xs">
          {LOCALISATION_AUDIT_USER_AGENT}
        </code>
      </p>
      <Link href={newAuditHref} className={buttonVariants({ className: "mt-6" })}>
        {copy.startNewAudit}
      </Link>
    </StatusCard>
  );
}
