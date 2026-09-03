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
  ArrowDown01Icon,
  Cancel01Icon,
  Share08Icon,
  Tick02Icon,
  Shield01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import { MeshStage, SAGE_MESH_GRADIENT_SRC } from "@/components/marketing/hero-frame-mesh-stage";
import { REQUEST_DEMO_URL } from "@/components/marketing/request-demo";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TypographyH1, TypographyH2, TypographyP } from "@/components/ui/typography";
import { clientAnalytics } from "@/lib/analytics/client";
import { LOCALISATION_AUDIT_ANALYTICS_EVENTS, scoreBand } from "@/lib/analytics/events";
import { isLocalisationAuditSignInCtaEnabled } from "@/lib/flags/localisation-audit-sign-in-ctas";
import {
  buildLocalisationAuditCriteria,
  groupLocalisationAuditCriteria,
  type LocalisationAuditCriterion,
} from "@/lib/localisation-audit/criteria";
import { sanitizeLocalisationAuditFindingUrl } from "@/lib/localisation-audit/finding-url";
import { LOCALISATION_AUDIT_USER_AGENT } from "@/lib/localisation-audit/user-agent";
import {
  scoreTone,
  severityTone,
  type LocalisationAuditTone,
} from "@/lib/localisation-audit/score-tone";
import type { LocalisationAuditStanding } from "@/lib/localisation-audit/store";
import type {
  LocalisationAuditCompanyProfile,
  LocalisationAuditCreditResult,
  LocalisationAuditFinding,
  LocalisationAuditProgressStage,
  LocalisationAuditReport,
  LocalisationAuditTeaser,
} from "@/lib/localisation-audit/types";
import { cn } from "@/lib/primitives/cn";
import { DEFAULT_APP_LOCALE, normalizeAppLocale } from "@/lib/app-i18n/locales";
import { rewriteAppLocalePath } from "@/lib/app-i18n/rewrite-app-locale-path";

import {
  getLocalisationAuditGuideHref,
  getLocalisationAuditResultCopy,
  interpretScore,
  interpretScoreCtaBand,
} from "./localisation-audit-page-content";
import { animate, useInView, useReducedMotion } from "motion/react";

type AuditPayload = {
  id: string;
  domainKey: string;
  domainSlug: string;
  sourceUrl: string;
  status: string;
  attemptNumber?: number;
  progressStage?: LocalisationAuditProgressStage | null;
  score: number | null;
  teaser: LocalisationAuditTeaser | null;
  report: LocalisationAuditReport | null;
  unlocked: boolean;
  retryable?: boolean;
  rerunnable?: boolean;
  rerunAvailableAt?: string | null;
  claimed?: boolean;
  errorCode: string | null;
  errorMessage?: string | null;
  completedAt?: string | null;
};

type LocalisationAuditResultProps = {
  locale: string;
  domainSlug: string;
  initialAudit: AuditPayload;
  standing: LocalisationAuditStanding | null;
  /** Workspace embeds hide marketing unlock/share/claim chrome. */
  variant?: "public" | "workspace";
};

const PROGRESS_STAGES = ["queued", "preparing", "crawling", "analyzing", "scoring"] as const;

const CRITERIA_INITIAL_LIMIT = 3;

const FLUSH_ACCORDION = "rounded-none border-0";

const COMPACT_TRIGGER = "gap-3 px-1 py-2.5 hover:no-underline";

function auditToneTextClass(tone: LocalisationAuditTone) {
  switch (tone) {
    case "safe":
      return "text-grove-900 dark:text-grove-300";
    case "watch":
      return "text-beam-900 dark:text-warning-foreground";
    case "risk":
      return "text-destructive";
    case "info":
      return "text-blue-1000 dark:text-blue-900";
    default:
      return "text-muted-foreground";
  }
}

function auditToneBadgeClass(tone: LocalisationAuditTone) {
  switch (tone) {
    case "safe":
      return "border-grove-700/25 bg-grove-100 text-grove-900 dark:border-grove-500/30 dark:bg-grove-100 dark:text-grove-900";
    case "watch":
      return "border-warning/25 bg-warning/10 text-warning-foreground dark:border-warning/30 dark:bg-warning/20 dark:text-warning-foreground";
    case "risk":
      return "border-destructive/25 bg-destructive/10 text-destructive dark:border-destructive/30 dark:bg-destructive/20 dark:text-destructive";
    case "info":
      return "border-blue-700/25 bg-blue-100 text-blue-1000 dark:border-blue-600/30 dark:bg-blue-100 dark:text-blue-900";
    default:
      return "border-border text-muted-foreground";
  }
}

function FindingDetailBlock({
  finding,
  copy,
  domainKey,
  showSummary = true,
}: {
  finding: LocalisationAuditFinding;
  copy: ReturnType<typeof getLocalisationAuditResultCopy>;
  domainKey: string;
  showSummary?: boolean;
}) {
  const findingHref = sanitizeLocalisationAuditFindingUrl(finding.url, domainKey);

  return (
    <div className="space-y-2 text-sm">
      {showSummary ? <p className="text-muted-foreground">{finding.summary}</p> : null}
      {finding.where || findingHref ? (
        <div>
          <p className="text-xs font-medium text-muted-foreground">{copy.findingWhereLabel}</p>
          {finding.where ? <p className="text-sm wrap-break-word">{finding.where}</p> : null}
          {findingHref ? (
            <a
              href={findingHref}
              target="_blank"
              rel="noopener noreferrer"
              className="block break-all text-xs text-muted-foreground"
            >
              {findingHref}
            </a>
          ) : null}
        </div>
      ) : null}
      {finding.evidence ? (
        <div>
          <p className="text-xs font-medium text-muted-foreground">{copy.findingEvidenceLabel}</p>
          <p className="font-mono text-xs wrap-break-word whitespace-pre-wrap text-muted-foreground">
            {finding.evidence}
          </p>
        </div>
      ) : null}
      {finding.advice ? (
        <div>
          <p className="text-xs font-medium text-muted-foreground">{copy.findingAdviceLabel}</p>
          <p className="text-sm wrap-break-word">{finding.advice}</p>
        </div>
      ) : null}
    </div>
  );
}

function CountUp({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    if (!inView) return;
    const node = ref.current;
    if (!node) return;

    if (shouldReduceMotion) {
      node.textContent = String(value);
      return;
    }

    const controls = animate(0, value, {
      duration: 1.2,
      ease: [0.19, 1, 0.22, 1],
      onUpdate: (latest) => {
        node.textContent = String(Math.round(latest));
      },
    });

    return () => controls.stop();
  }, [inView, value, shouldReduceMotion]);

  return (
    <span ref={ref} className={className}>
      0
    </span>
  );
}

function CriterionStatusIcon({ status }: { status: LocalisationAuditCriterion["status"] }) {
  if (status === "pass") {
    return (
      <span
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full",
          auditToneBadgeClass("safe"),
        )}
        aria-hidden
      >
        <HugeiconsIcon icon={Tick02Icon} className="size-3" />
      </span>
    );
  }
  if (status === "fail") {
    return (
      <span
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full",
          auditToneBadgeClass("risk"),
        )}
        aria-hidden
      >
        <HugeiconsIcon icon={Cancel01Icon} className="size-3" />
      </span>
    );
  }
  return (
    <span
      className="flex size-5 shrink-0 items-center justify-center rounded-full border border-border text-xs text-muted-foreground"
      aria-hidden
    >
      —
    </span>
  );
}

function CriterionAccordionItem({
  criterion,
  copy,
  showFindings,
  domainKey,
  dimensionLabel,
}: {
  criterion: LocalisationAuditCriterion;
  copy: ReturnType<typeof getLocalisationAuditResultCopy>;
  showFindings: boolean;
  domainKey: string;
  dimensionLabel: string;
}) {
  const tone: LocalisationAuditTone =
    criterion.status === "pass" ? "safe" : criterion.status === "fail" ? "risk" : "neutral";

  return (
    <AccordionItem className="not-last:border-b" value={criterion.id}>
      <AccordionTrigger className={COMPACT_TRIGGER}>
        <span className="flex min-w-0 flex-1 items-center gap-3">
          <CriterionStatusIcon status={criterion.status} />
          <span className="min-w-0">
            <span className="block text-sm leading-snug font-medium">{criterion.title}</span>
            <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
              {criterion.status !== "na" && criterion.score != null ? (
                <span className={cn("text-xs tabular-nums", auditToneTextClass(tone))}>
                  {criterion.score}
                </span>
              ) : null}
              <span className="text-xs font-normal text-muted-foreground">{dimensionLabel}</span>
            </span>
          </span>
        </span>
      </AccordionTrigger>
      <AccordionContent className="space-y-3 ps-9">
        <p className="text-sm text-muted-foreground">{criterion.rubric}</p>
        {showFindings && criterion.findings.length > 0
          ? criterion.findings.map((finding) => (
              <FindingDetailBlock
                key={finding.id}
                finding={finding}
                copy={copy}
                domainKey={domainKey}
                showSummary={false}
              />
            ))
          : null}
      </AccordionContent>
    </AccordionItem>
  );
}

function FindingAccordionItem({
  finding,
  copy,
  domainKey,
}: {
  finding: LocalisationAuditFinding;
  copy: ReturnType<typeof getLocalisationAuditResultCopy>;
  domainKey: string;
}) {
  const tone = severityTone(finding.severity);
  const dotClass =
    tone === "risk"
      ? "bg-destructive"
      : tone === "watch"
        ? "bg-warning"
        : tone === "safe"
          ? "bg-grove-500"
          : "bg-blue-500";

  return (
    <AccordionItem className="not-last:border-b" value={finding.id}>
      <AccordionTrigger className="gap-3 px-1 py-5 hover:no-underline">
        <span className="flex min-w-0 flex-1 items-start gap-3">
          <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", dotClass)} />
          <span className="min-w-0 flex-1">
            <span className="block text-sm leading-snug font-semibold">{finding.title}</span>
            <span className="mt-2 flex items-center justify-between gap-3">
              <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-normal capitalize text-muted-foreground">
                {finding.category}
              </span>
              {finding.confidence != null ? (
                <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-normal text-muted-foreground">
                  <HugeiconsIcon icon={Shield01Icon} className="size-3.5" aria-hidden />
                  {copy.findingConfidence({ confidence: finding.confidence })}
                </span>
              ) : null}
            </span>
          </span>
        </span>
      </AccordionTrigger>
      <AccordionContent className="ps-6">
        <FindingDetailBlock finding={finding} copy={copy} domainKey={domainKey} />
      </AccordionContent>
    </AccordionItem>
  );
}

function CriteriaGroup({
  heading,
  criteria,
  copy,
  showFindings,
  domainKey,
  dimensionLabels,
  defaultOpen,
  expandLabel,
  collapseLabel,
}: {
  heading: string;
  criteria: LocalisationAuditCriterion[];
  copy: ReturnType<typeof getLocalisationAuditResultCopy>;
  showFindings: boolean;
  domainKey: string;
  dimensionLabels: Record<LocalisationAuditCriterion["dimension"], string>;
  defaultOpen: boolean;
  expandLabel: string;
  collapseLabel: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  if (criteria.length === 0) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {heading}
        </p>
        <CollapsibleTrigger className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          {open ? collapseLabel : expandLabel}
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            className={cn("size-3.5 transition-transform", open && "rotate-180")}
          />
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <Accordion className={cn(FLUSH_ACCORDION, "mt-1")}>
          {criteria.map((criterion) => (
            <CriterionAccordionItem
              key={criterion.id}
              criterion={criterion}
              copy={copy}
              showFindings={showFindings}
              domainKey={domainKey}
              dimensionLabel={dimensionLabels[criterion.dimension]}
            />
          ))}
        </Accordion>
      </CollapsibleContent>
    </Collapsible>
  );
}

function AuditCriteriaList({
  credits,
  findings,
  copy,
  domainKey,
  unlocked,
  openItems,
  onOpenChange,
}: {
  credits: LocalisationAuditCreditResult[];
  findings: LocalisationAuditFinding[];
  copy: ReturnType<typeof getLocalisationAuditResultCopy>;
  domainKey: string;
  unlocked: boolean;
  openItems: string[];
  onOpenChange: (value: string[]) => void;
}) {
  const [showAllFailed, setShowAllFailed] = useState(false);
  const { passed, failed, notApplicable } = groupLocalisationAuditCriteria(
    buildLocalisationAuditCriteria(credits, findings),
  );
  const dimensionLabels = {
    technical: copy.dimensionTechnicalShort,
    linguistic: copy.dimensionLinguisticShort,
    contextual: copy.dimensionContextualShort,
    visual: copy.dimensionVisualShort,
  } as const;

  const visibleFailed = showAllFailed ? failed : failed.slice(0, CRITERIA_INITIAL_LIMIT);
  const hasMore = failed.length > CRITERIA_INITIAL_LIMIT;

  return (
    <div>
      <p className="mt-1 text-xs text-muted-foreground">
        {copy.criteriaSummary({
          passed: passed.length,
          failed: failed.length,
          na: notApplicable.length,
        })}
      </p>

      {failed.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {copy.criteriaNeedsAttentionHeading({ count: failed.length })}
          </p>
          <Accordion
            className={cn(FLUSH_ACCORDION, "mt-1")}
            value={openItems}
            onValueChange={onOpenChange}
          >
            {visibleFailed.map((criterion) => (
              <CriterionAccordionItem
                key={criterion.id}
                criterion={criterion}
                copy={copy}
                showFindings={unlocked}
                domainKey={domainKey}
                dimensionLabel={dimensionLabels[criterion.dimension]}
              />
            ))}
          </Accordion>
          {hasMore ? (
            <button
              type="button"
              onClick={() => setShowAllFailed((value) => !value)}
              className="mt-2 flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {showAllFailed ? copy.criteriaCollapsePassed : copy.criteriaExpandPassed}
              <HugeiconsIcon
                icon={ArrowDown01Icon}
                className={cn("size-3.5 transition-transform", showAllFailed && "rotate-180")}
              />
            </button>
          ) : null}
        </div>
      ) : null}

      <CriteriaGroup
        heading={copy.criteriaPassedHeading({ count: passed.length })}
        criteria={passed}
        copy={copy}
        showFindings={false}
        domainKey={domainKey}
        dimensionLabels={dimensionLabels}
        defaultOpen={failed.length === 0}
        expandLabel={copy.criteriaExpandPassed}
        collapseLabel={copy.criteriaCollapsePassed}
      />

      <CriteriaGroup
        heading={copy.criteriaNotApplicableHeading({ count: notApplicable.length })}
        criteria={notApplicable}
        copy={copy}
        showFindings={false}
        domainKey={domainKey}
        dimensionLabels={dimensionLabels}
        defaultOpen={false}
        expandLabel={copy.criteriaExpandNa}
        collapseLabel={copy.criteriaCollapseNa}
      />
    </div>
  );
}

function stageIndex(stage: LocalisationAuditProgressStage | null | undefined) {
  if (!stage || stage === "failed") return 0;
  if (stage === "completed") return PROGRESS_STAGES.length - 1;
  const index = (PROGRESS_STAGES as readonly string[]).indexOf(stage);
  return index >= 0 ? index : 0;
}

function AuditProgressTrack({
  activeIndex,
  copy,
}: {
  activeIndex: number;
  copy: ReturnType<typeof getLocalisationAuditResultCopy>;
}) {
  const labels = {
    queued: copy.progressQueued,
    preparing: copy.progressPreparing,
    crawling: copy.progressCrawling,
    analyzing: copy.progressAnalyzing,
    scoring: copy.progressScoring,
  } as const;
  const details = {
    queued: copy.progressQueuedDetail,
    preparing: copy.progressPreparingDetail,
    crawling: copy.progressCrawlingDetail,
    analyzing: copy.progressAnalyzingDetail,
    scoring: copy.progressScoringDetail,
  } as const;
  const total = PROGRESS_STAGES.length;
  const currentIndex = Math.min(activeIndex, total - 1);
  const currentStage = PROGRESS_STAGES[currentIndex]!;
  const currentStep = currentIndex + 1;

  return (
    <div className="mt-10 max-w-2xl">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-pretty text-sm font-medium">{labels[currentStage]}</p>
        <p className="text-sm text-muted-foreground tabular-nums">
          {copy.progressStepOf({ current: currentStep, total })}
        </p>
      </div>

      <ol className="mt-6 grid grid-cols-5" aria-label={copy.progressBarLabel}>
        {PROGRESS_STAGES.map((stage, index) => {
          const done = index < activeIndex;
          const current = index === activeIndex;
          const isLast = index === total - 1;
          return (
            <li
              key={stage}
              className="relative flex flex-col items-center"
              aria-current={current ? "step" : undefined}
            >
              {isLast ? null : (
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-3 start-[calc(50%+0.75rem)] h-px w-[calc(100%-1.5rem)]",
                    index < activeIndex ? "bg-foreground" : "bg-border",
                  )}
                />
              )}
              <span
                className={cn(
                  "relative flex size-6 items-center justify-center rounded-full",
                  done && "bg-foreground text-background",
                  current && "border-2 border-foreground bg-background",
                  !done && !current && "border border-border bg-background",
                )}
              >
                {done ? <HugeiconsIcon icon={Tick02Icon} className="size-3.5" aria-hidden /> : null}
                {current ? (
                  <span className="size-2 rounded-full bg-foreground motion-safe:animate-pulse" />
                ) : null}
              </span>
              <p
                className={cn(
                  "mt-2 text-center text-xs text-pretty",
                  current && "font-medium",
                  done && "text-foreground",
                  !done && !current && "text-muted-foreground",
                )}
              >
                {labels[stage]}
              </p>
            </li>
          );
        })}
      </ol>

      <p
        key={currentStage}
        className="mt-4 text-pretty text-sm text-muted-foreground motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
      >
        {details[currentStage]}
      </p>
      <p className="sr-only" aria-live="polite">
        {labels[currentStage]}. {details[currentStage]}
      </p>
    </div>
  );
}

function prioritizeFindings(findings: LocalisationAuditFinding[]) {
  const weight = { critical: 0, high: 1, warning: 1, medium: 2, low: 3, info: 4 } as const;
  return findings.toSorted((a, b) => weight[a.severity] - weight[b.severity]).slice(0, 3);
}

function companyMonogram(name: string | null | undefined, domainKey: string) {
  const source = (name ?? domainKey).trim();
  const letter = source.charAt(0).toUpperCase();
  return letter || "H";
}

function CompanyMark({
  profile,
  domainKey,
}: {
  profile: LocalisationAuditCompanyProfile | null | undefined;
  domainKey: string;
}) {
  const [logoFailed, setLogoFailed] = useState(false);
  const showLogo = Boolean(profile?.logoUrl) && !logoFailed;

  return (
    <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/20 bg-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] backdrop-blur-sm">
      {showLogo ? (
        <img
          src={profile!.logoUrl!}
          alt=""
          className="size-full object-contain p-2"
          onError={() => setLogoFailed(true)}
        />
      ) : (
        <span className="font-serif text-2xl tracking-tight text-white">
          {companyMonogram(profile?.name, domainKey)}
        </span>
      )}
    </div>
  );
}

function MeshWash({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn("px-5 pt-10 pb-16 sm:px-8 sm:pt-14 lg:px-10", className)}>
      <MeshStage
        meshSrc={SAGE_MESH_GRADIENT_SRC}
        contentClassName="p-0"
        priority
        className="[&>div]:rounded-md [&>div]:sm:rounded-lg"
      >
        <div className="relative">
          <div
            className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/35 to-black/60"
            aria-hidden
          />
          <div className="relative px-6 py-10 text-white sm:px-8 sm:py-12 lg:px-10">{children}</div>
        </div>
      </MeshStage>
    </section>
  );
}

export function LocalisationAuditResult({
  locale,
  domainSlug,
  initialAudit,
  standing,
  variant = "public",
}: LocalisationAuditResultProps) {
  const copy = getLocalisationAuditResultCopy(locale);
  const appLocale = normalizeAppLocale(locale) ?? DEFAULT_APP_LOCALE;
  const claimDomainHref = rewriteAppLocalePath(`/claim-domain/${domainSlug}`, appLocale);
  const { user, loading: authLoading, featureFlags } = useAuth();
  const showSignInCtas = isLocalisationAuditSignInCtaEnabled({
    loading: authLoading,
    user,
    featureFlags,
  });
  const isWorkspace = variant === "workspace";
  const [audit, setAudit] = useState(initialAudit);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [rerunPending, setRerunPending] = useState(false);
  const [deliveryMessage, setDeliveryMessage] = useState<string | null>(null);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [openCriteria, setOpenCriteria] = useState<string[]>([]);
  const [openFindings, setOpenFindings] = useState<string[]>([]);
  const anyOpen = openCriteria.length > 0 || openFindings.length > 0;
  const teaserTracked = useRef(false);

  useEffect(() => {
    if (audit.status !== "succeeded" || teaserTracked.current) return;
    teaserTracked.current = true;
    clientAnalytics.track(LOCALISATION_AUDIT_ANALYTICS_EVENTS.teaserView, {
      status: "succeeded",
      score_band: scoreBand(audit.score),
    });
  }, [audit.score, audit.status]);

  useEffect(() => {
    if (audit.status === "succeeded" || audit.status === "failed" || audit.status === "blocked") {
      return;
    }

    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/localisation-audit/${domainSlug}`);
        if (!response.ok) return;
        const body = (await response.json()) as { audit: AuditPayload };
        setAudit(body.audit);
      } catch {
        // keep polling
      }
    }, 2500);

    return () => window.clearInterval(timer);
  }, [audit.status, domainSlug]);

  async function requestReportEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setDeliveryMessage(null);
    setPending(true);
    try {
      const response = await fetch(`/api/localisation-audit/${domainSlug}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, locale }),
      });
      const body = (await response.json().catch(() => null)) as {
        audit?: AuditPayload;
        delivery?: { message?: string; status?: string };
        message?: string;
      } | null;
      if (!response.ok) {
        setError(body?.message ?? copy.requestEmailError);
        return;
      }
      if (body?.audit) setAudit(body.audit);
      setDeliveryMessage(
        body?.delivery?.message ??
          (audit.status === "succeeded" ? copy.unlockQueued : copy.emailWhenReadyQueued),
      );
    } catch {
      setError(copy.requestEmailError);
    } finally {
      setPending(false);
    }
  }

  async function restartAudit(failureMessage: string) {
    setError(null);
    setRerunPending(true);
    try {
      const response = await fetch("/api/localisation-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: audit.sourceUrl }),
      });
      const body = (await response.json().catch(() => null)) as {
        audit?: AuditPayload;
        message?: string;
      } | null;
      if (!response.ok || !body?.audit) {
        setError(body?.message ?? failureMessage);
        return;
      }
      setAudit(body.audit);
    } catch {
      setError(failureMessage);
    } finally {
      setRerunPending(false);
    }
  }

  function trackCta(cta: string) {
    clientAnalytics.track(LOCALISATION_AUDIT_ANALYTICS_EVENTS.ctaClick, {
      cta,
      score_band: scoreBand(audit.score),
    });
  }

  async function copyShareLink() {
    const url = `${window.location.origin}/${locale}/localisation-audit/${domainSlug}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareMessage(copy.shareCopied);
      trackCta("share_teaser");
    } catch {
      setShareMessage(url);
    }
  }

  if ((audit.status === "queued" || audit.status === "running") && audit.retryable) {
    return (
      <MeshWash>
        <TypographyH1 className="border-none text-white">{copy.staleTitle}</TypographyH1>
        <TypographyP className="mt-4 max-w-2xl text-lg text-white/80">{copy.staleBody}</TypographyP>
        <p className="mt-6 text-sm text-white/65">{audit.domainKey}</p>
        {error ? <p className="mt-4 text-sm text-red-200">{error}</p> : null}
        <Button
          className="mt-8 bg-white text-black hover:bg-white/90"
          onClick={() => restartAudit(copy.retryError)}
          disabled={rerunPending}
        >
          {rerunPending ? copy.retrying : copy.retry}
        </Button>
      </MeshWash>
    );
  }

  if (audit.status === "queued" || audit.status === "running") {
    const activeIndex = stageIndex(audit.progressStage);
    return (
      <>
        <MeshWash>
          <TypographyH1 className="border-none text-white">{copy.runningTitle}</TypographyH1>
          <TypographyP className="mt-4 max-w-2xl text-lg text-white/80">
            {copy.runningBody}
          </TypographyP>
          <p className="mt-2 text-sm text-white/65">{copy.expectedDuration}</p>
          <p className="mt-6 text-sm text-white/65">{audit.domainKey}</p>
        </MeshWash>
        <section className="px-5 pb-20 sm:px-8 lg:px-10">
          <AuditProgressTrack activeIndex={activeIndex} copy={copy} />
          <div className="mt-12 max-w-md">
            <TypographyH2 className="pb-0 text-xl">{copy.emailWhenReadyHeading}</TypographyH2>
            <TypographyP className="mt-3 text-muted-foreground">
              {copy.emailWhenReadyBody}
            </TypographyP>
            <form onSubmit={requestReportEmail} className="mt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="localisation-audit-notify-email">{copy.emailLabel}</Label>
                <Input
                  id="localisation-audit-notify-email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder={copy.emailPlaceholder}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              {deliveryMessage ? (
                <p className="text-sm text-muted-foreground">{deliveryMessage}</p>
              ) : null}
              <Button type="submit" disabled={pending}>
                {pending ? copy.emailWhenReadyPending : copy.emailWhenReadySubmit}
              </Button>
            </form>
          </div>
        </section>
      </>
    );
  }

  if (audit.status === "failed") {
    return (
      <MeshWash>
        <TypographyH1 className="border-none text-white">{copy.failedTitle}</TypographyH1>
        <TypographyP className="mt-4 max-w-2xl text-lg text-white/80">
          {copy.failedBody}
        </TypographyP>
        <TypographyP className="mt-2 max-w-2xl text-white/70">
          {audit.errorMessage ?? audit.errorCode ?? copy.failedFallback}
        </TypographyP>
        {error ? <p className="mt-4 text-sm text-red-200">{error}</p> : null}
        <Button
          className="mt-8 bg-white text-black hover:bg-white/90"
          onClick={() => restartAudit(copy.retryError)}
          disabled={rerunPending}
        >
          {rerunPending ? copy.retrying : copy.retry}
        </Button>
      </MeshWash>
    );
  }

  if (audit.status === "blocked") {
    return (
      <MeshWash>
        <TypographyH1 className="border-none text-white">{copy.blockedTitle}</TypographyH1>
        <TypographyP className="mt-4 max-w-2xl text-lg text-white/80">
          {copy.blockedBody}
        </TypographyP>
        <TypographyP className="mt-2 max-w-2xl text-white/70">{copy.blockedGuidance}</TypographyP>
        <p className="mt-5 max-w-2xl text-sm text-white/75">
          <span className="text-white/55">{copy.blockedUserAgent}: </span>
          <code className="break-all text-white">{LOCALISATION_AUDIT_USER_AGENT}</code>
        </p>
        {error ? <p className="mt-4 text-sm text-red-200">{error}</p> : null}
        <Button
          nativeButton={false}
          render={<Link href={rewriteAppLocalePath("/localisation-audit", appLocale)} />}
          className="mt-8 bg-white text-black hover:bg-white/90"
        >
          {copy.startNewAudit}
        </Button>
      </MeshWash>
    );
  }

  const teaser = audit.teaser;
  const report = audit.report;
  const score = audit.score ?? teaser?.score ?? report?.score ?? null;
  const rating = interpretScore(score);
  const band = interpretScoreCtaBand(rating);
  const interpretation =
    rating === "excellent"
      ? copy.scoreInterpretationExcellent
      : rating === "good"
        ? copy.scoreInterpretationGood
        : rating === "needs-improvement"
          ? copy.scoreInterpretationNeedsImprovement
          : rating === "poor"
            ? copy.scoreInterpretationPoor
            : rating === "critical"
              ? copy.scoreInterpretationCritical
              : copy.scoreInterpretationNeedsImprovement;
  const ratingLabel =
    rating === "excellent"
      ? copy.scoreRatingExcellent
      : rating === "good"
        ? copy.scoreRatingGood
        : rating === "needs-improvement"
          ? copy.scoreRatingNeedsImprovement
          : rating === "poor"
            ? copy.scoreRatingPoor
            : rating === "critical"
              ? copy.scoreRatingCritical
              : null;
  const dimensionScores = report?.dimensionScores ?? teaser?.dimensionScores;
  const allFindings = report?.findings ?? teaser?.headlineFindings ?? [];
  const fixFirst = prioritizeFindings(allFindings);
  const companyProfile = report?.companyProfile ?? teaser?.companyProfile ?? null;
  const displayName = companyProfile?.name?.trim() || audit.domainKey;
  const ctaBody =
    band === "high"
      ? copy.reauditBodyHigh
      : band === "mid"
        ? copy.reauditBodyMid
        : copy.reauditBodyLow;
  const freshness = audit.completedAt ?? teaser?.completedAt ?? report?.completedAt ?? null;
  const credits = report?.credits ?? teaser?.credits ?? [];
  const criteriaFindings = allFindings;
  const detectedLocales = report?.detectedLocales ?? teaser?.detectedLocales ?? [];

  const scoreBarClass =
    scoreTone(score) === "safe"
      ? "bg-grove-400"
      : scoreTone(score) === "watch"
        ? "bg-warning"
        : "bg-destructive";

  const outerPadding = isWorkspace ? "px-0 py-0" : "px-5 py-8 sm:px-8 lg:px-10";

  return (
    <div className={outerPadding}>
      {dimensionScores ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              { label: copy.dimensionTechnical, score: dimensionScores.technical },
              { label: copy.dimensionLinguistic, score: dimensionScores.linguistic },
              { label: copy.dimensionContextual, score: dimensionScores.contextual },
              { label: copy.dimensionVisual, score: dimensionScores.visual },
            ] as const
          ).map((dimension) => {
            const tone = scoreTone(dimension.score);
            const numberClass =
              tone === "safe"
                ? "text-grove-700 dark:text-grove-400"
                : tone === "watch"
                  ? "text-warning-foreground"
                  : tone === "risk"
                    ? "text-destructive"
                    : "text-muted-foreground";
            const statusLabel =
              tone === "safe"
                ? copy.scoreRatingGood
                : tone === "watch"
                  ? copy.scoreRatingNeedsImprovement
                  : tone === "risk"
                    ? copy.scoreRatingCritical
                    : "—";
            return (
              <div
                key={dimension.label}
                className="rounded-xl border border-border bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.0784)] text-center"
              >
                <p className="text-xs font-medium text-muted-foreground uppercase">
                  {dimension.label}
                </p>
                <p
                  className={cn(
                    "mt-2 font-serif text-4xl tracking-tight tabular-nums",
                    numberClass,
                  )}
                >
                  {dimension.score == null ? "—" : <CountUp value={dimension.score} />}
                </p>
                <p className={cn("mt-1 text-xs font-medium", numberClass)}>{statusLabel}</p>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* ── Row 2: hero + compare + detected locales ────────────────────── */}
      <div className={cn("mt-3 grid gap-3 lg:grid-cols-[1fr_400px]", anyOpen && "items-start")}>
        <div className="overflow-hidden rounded-sm">
          <MeshStage
            meshSrc={SAGE_MESH_GRADIENT_SRC}
            contentClassName="p-0"
            priority
            className="[&>div]:rounded-lg [&>div]:sm:rounded-lg"
          >
            <div className="relative">
              <div
                className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/35 to-black/60"
                aria-hidden
              />
              <div className="relative px-6 py-6 text-white">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <p className="text-xs font-medium tracking-[0.18em] text-white/70 uppercase">
                    {copy.companyReportEyebrow}
                  </p>
                  {isWorkspace ? null : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-white/25 bg-white/10 text-white hover:bg-white/15 hover:text-white"
                      onClick={copyShareLink}
                    >
                      <HugeiconsIcon icon={Share08Icon} className="size-3.5" aria-hidden />
                      {copy.shareCopyLink}
                    </Button>
                  )}
                </div>

                <div className="mt-4 flex items-start gap-3">
                  <CompanyMark profile={companyProfile} domainKey={audit.domainKey} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="font-serif text-xl tracking-tight text-white sm:text-2xl">
                        {displayName}
                      </h1>
                      {companyProfile?.industry ? (
                        <Badge
                          variant="outline"
                          className="border-white/25 bg-white/10 text-white capitalize"
                        >
                          {companyProfile.industry}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-sm text-white/60">{audit.domainKey}</p>
                    {companyProfile?.productSummary ? (
                      <p className="mt-2 text-sm text-white/80">
                        <span className="text-white/50">{copy.companyProductLabel}: </span>
                        {companyProfile.productSummary}
                      </p>
                    ) : null}
                    {companyProfile?.brandVoice ? (
                      <p className="mt-1 text-sm text-white/70">
                        <span className="text-white/50">{copy.companyBrandVoiceLabel}: </span>
                        {companyProfile.brandVoice}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 border-t border-white/15 pt-4">
                  <p className="text-xs tracking-widest text-white/60 uppercase">
                    {copy.scoreLabel}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-end gap-3">
                    <p className="font-serif text-7xl tracking-tight text-white tabular-nums">
                      {score ?? "—"}
                      <span className="text-xl text-white/50">{copy.scoreOutOf}</span>
                    </p>
                    {ratingLabel ? (
                      <Badge
                        variant="outline"
                        className="mb-1 border-white/25 bg-white/10 text-white capitalize"
                      >
                        {ratingLabel}
                      </Badge>
                    ) : null}
                  </div>

                  {score != null ? (
                    <div className="mt-2.5 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-white/20">
                      <div
                        className={cn("h-full rounded-full", scoreBarClass)}
                        style={{ width: `${score}%` }}
                      />
                    </div>
                  ) : null}

                  <TypographyP className="mt-2.5 max-w-xl text-sm text-white/75">
                    {interpretation}
                  </TypographyP>

                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-white/55">
                    {freshness ? (
                      <span>
                        {copy.freshnessLabel}: {new Date(freshness).toLocaleDateString()}
                      </span>
                    ) : null}
                    <span>
                      {copy.scopeLabel}: {copy.scopeBody}
                    </span>
                  </div>

                  {shareMessage ? (
                    <p className="mt-2.5 text-sm text-white/70">{shareMessage}</p>
                  ) : null}
                </div>
              </div>
            </div>
          </MeshStage>
        </div>

        <div className="flex flex-col gap-3">
          {standing && !isWorkspace ? (
            <div className="rounded-sm border-[0.5px] border-border bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.0784)] flex-1">
              <h2 className="font-semibold font-serif">{copy.standingHeading}</h2>
              <dl className="mt-8 space-y-8">
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-sm text-muted-foreground">{copy.standingHeading}</dt>
                  <dd className="text-sm font-semibold tabular-nums">
                    {copy.standingRank({ rank: standing.rank, total: standing.total })}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-2 border-t border-border pt-3">
                  <dt className="text-sm text-muted-foreground">{copy.scopeLabel}</dt>
                  <dd className="text-sm font-semibold text-primary tabular-nums">
                    {copy.standingPercentile({ percentile: standing.percentile })}
                  </dd>
                </div>
                {standing.averageScore != null ? (
                  <div className="flex items-baseline justify-between gap-2 border-t border-border pt-3">
                    <dt className="text-sm text-muted-foreground">{copy.scoreLabel}</dt>
                    <dd className="text-sm font-semibold tabular-nums">
                      {copy.standingAverage({ average: standing.averageScore })}
                    </dd>
                  </div>
                ) : null}
              </dl>
              <div className="mt-8 border-t border-border pt-4">
                <Link
                  href={`/${locale}/localisation-audit`}
                  className="text-sm text-primary underline-offset-4 hover:underline"
                >
                  {copy.standingCta}
                </Link>
              </div>
            </div>
          ) : null}

          {detectedLocales.length > 0 ? (
            <div className="rounded-lg border-[0.5px] border-border bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.0784)]">
              <h2 className="font-semibold font-serif">{copy.localesHeading}</h2>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {detectedLocales.map((localeSignal) => (
                  <span
                    key={`${localeSignal.locale}-${localeSignal.source}`}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-primary/10 px-2.5 py-1 text-xs font-medium"
                  >
                    {localeSignal.locale}
                    <span className="text-muted-foreground/70">({localeSignal.source})</span>
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className={cn("mt-3 grid gap-3 lg:grid-cols-[1fr_400px]", anyOpen && "items-start")}>
        {credits.length > 0 ? (
          <div className="rounded-lg border border-border bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.0784)]">
            <h2 className="font-semibold font-serif">{copy.creditsHeading}</h2>
            <AuditCriteriaList
              credits={credits}
              findings={criteriaFindings}
              copy={copy}
              domainKey={audit.domainKey}
              unlocked
              openItems={openCriteria}
              onOpenChange={setOpenCriteria}
            />
          </div>
        ) : null}

        <div className="rounded-lg border border-border bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.0784)]">
          <h2 className="font-semibold font-serif">{copy.fixFirstHeading}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{copy.fixFirstSubheading}</p>
          <Accordion
            className={cn(FLUSH_ACCORDION, "mt-4")}
            value={openFindings}
            onValueChange={setOpenFindings}
          >
            {fixFirst.map((finding) => (
              <FindingAccordionItem
                key={finding.id}
                finding={finding}
                copy={copy}
                domainKey={audit.domainKey}
              />
            ))}
          </Accordion>
        </div>
      </div>

      {report?.linguisticNotes && report.linguisticNotes.length > 0 ? (
        <div className="mt-3 rounded-xl border border-border bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.0784)]">
          <h2 className="font-semibold font-serif">{copy.linguisticHeading}</h2>
          <div className="mt-4 grid gap-6 sm:grid-cols-2">
            {report.linguisticNotes.map((note) => (
              <div key={note.locale}>
                <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold">
                  {note.locale}
                </span>
                <p className="mt-2 text-sm text-muted-foreground">{note.summary}</p>
                <ul className="mt-3 space-y-2">
                  {note.samples.map((sample) => (
                    <li
                      key={`${note.locale}-${sample.text}`}
                      className="border-l-2 border-border pl-3"
                    >
                      <p className="text-sm italic">“{sample.text}”</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{sample.note}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {report?.pages && report.pages.length > 0 ? (
        <div className="mt-3 rounded-xl border border-border bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.0784)] ">
          <Collapsible>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold font-serif">{copy.pagesHeading}</h2>
              <CollapsibleTrigger className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                {copy.pagesHeading}
                <HugeiconsIcon
                  icon={ArrowDown01Icon}
                  className="size-3.5 transition-transform [[data-state=open]_&]:rotate-180"
                />
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent>
              <ul className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                {report.pages.map((page) => (
                  <li key={page.url} className="flex items-baseline gap-2 break-all">
                    <span
                      className={cn(
                        "shrink-0 rounded px-1.5 py-0.5 text-xs font-medium tabular-nums",
                        page.status === 200
                          ? "bg-grove-100 text-grove-900"
                          : "bg-destructive/10 text-destructive",
                      )}
                    >
                      {page.status}
                    </span>
                    <span>{page.url}</span>
                    {page.htmlLang ? (
                      <span className="shrink-0 font-mono">lang={page.htmlLang}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        </div>
      ) : null}

      {isWorkspace ? null : (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 pb-16">
          <div className="rounded-xl border border-border bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.0784)]">
            <h2 className="font-semibold font-serif">{copy.unlockHeading}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{copy.unlockBody}</p>
            <form onSubmit={requestReportEmail} className="mt-4 space-y-3">
              <div className="flex flex-col gap-3 md:flex-row">
                <Input
                  id="localisation-audit-email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder={copy.emailPlaceholder}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="flex-1"
                />
                <Button type="submit" disabled={pending} className="shrink-0">
                  {pending ? copy.unlocking : copy.unlockSubmit}
                </Button>
              </div>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              {deliveryMessage ? (
                <p className="text-sm text-muted-foreground">{deliveryMessage}</p>
              ) : null}
            </form>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.0784)]">
            <h2 className="font-semibold font-serif">{copy.reauditHeading}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{ctaBody}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {audit.rerunnable ? (
                <Button onClick={() => restartAudit(copy.rerunError)} disabled={rerunPending}>
                  {rerunPending ? copy.rerunning : copy.rerun}
                </Button>
              ) : null}
              {showSignInCtas ? (
                audit.claimed ? (
                  <Button
                    nativeButton={false}
                    render={
                      <Link
                        href={claimDomainHref}
                        onClick={() => trackCta("open_claimed_domain")}
                      />
                    }
                  >
                    {copy.openInWorkspace}
                  </Button>
                ) : (
                  <Button
                    nativeButton={false}
                    render={
                      <Link
                        href={`/auth/sign-in?returnTo=${encodeURIComponent(claimDomainHref)}`}
                        onClick={() => trackCta("claim_domain")}
                      />
                    }
                  >
                    {copy.claimDomain}
                  </Button>
                )
              ) : null}
              {showSignInCtas ? (
                <Button
                  variant="outline"
                  nativeButton={false}
                  render={
                    <Link href="/auth/sign-in" onClick={() => trackCta("create_workspace")} />
                  }
                >
                  {band === "low" ? copy.createWorkspace : copy.deeperAudit}
                </Button>
              ) : null}
              <Button
                variant="outline"
                nativeButton={false}
                render={
                  <a
                    href={REQUEST_DEMO_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => trackCta("book_review")}
                  />
                }
              >
                {copy.bookReview}
              </Button>
            </div>
            {!audit.rerunnable && audit.rerunAvailableAt ? (
              <p className="mt-3 text-xs text-muted-foreground">
                {copy.rerunCooldown({
                  when: new Date(audit.rerunAvailableAt).toLocaleString(locale, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }),
                })}
              </p>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
