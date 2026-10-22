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
  CaretDownIcon,
  CheckIcon,
  ShareNetworkIcon,
  WarningIcon,
  XIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import { MeshStage, SAGE_MESH_GRADIENT_SRC } from "@/components/marketing/hero-frame-mesh-stage";
import { REQUEST_DEMO_URL } from "@/components/marketing/request-demo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TypographyH1, TypographyH2, TypographyP } from "@/components/ui/typography";
import { clientAnalytics } from "@/lib/analytics/client";
import { LOCALISATION_AUDIT_ANALYTICS_EVENTS, scoreBand } from "@/lib/analytics/events";
import { isLocalisationAuditSignInCtaEnabled } from "@/lib/flags/localisation-audit-sign-in-ctas";
import { LOCALISATION_AUDIT_METHODOLOGY_VERSION } from "@/lib/localisation-audit/credits/catalog";
import {
  buildLocalisationAuditCriteria,
  groupLocalisationAuditCriteria,
  type LocalisationAuditCriterion,
} from "@/lib/localisation-audit/criteria";
import { sanitizeLocalisationAuditFindingUrl } from "@/lib/localisation-audit/finding-url";
import { isSuccessfulLocalisationAuditPageStatus } from "@/lib/localisation-audit/report-coverage";
import { LOCALISATION_AUDIT_USER_AGENT } from "@/lib/localisation-audit/user-agent";
import {
  formatDimensionScore,
  scoreTone,
  severityTone,
  type LocalisationAuditTone,
} from "@/lib/localisation-audit/score-tone";
import type { LocalisationAuditStanding } from "@/lib/localisation-audit/store";
import type {
  LocalisationAuditCompanyProfile,
  LocalisationAuditFinding,
  LocalisationAuditLocaleSignal,
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

const EVIDENCE_PREVIEW_CHARS = 280;

const CRITERION_STATUS_TONE = {
  pass: "safe",
  watch: "watch",
  fail: "risk",
  na: "neutral",
} as const satisfies Record<LocalisationAuditCriterion["status"], LocalisationAuditTone>;
const FIX_FIRST_LIMIT = 3;

function auditToneTextClass(tone: LocalisationAuditTone) {
  switch (tone) {
    case "safe":
      return "text-grove-900 dark:text-grove-300";
    case "watch":
      return "text-beam-900 dark:text-warning-foreground";
    case "risk":
      return "text-red-900";
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
      return "border-beam-700/30 bg-beam-100 text-beam-900";
    case "risk":
      return "border-red-700/25 bg-red-100 text-red-900";
    case "info":
      return "border-blue-700/25 bg-blue-100 text-blue-1000 dark:border-blue-600/30 dark:bg-blue-100 dark:text-blue-900";
    default:
      return "border-border text-muted-foreground";
  }
}

function DimensionScoreCircle({
  label,
  score,
  onMesh = false,
}: {
  label: string;
  score: number | null;
  onMesh?: boolean;
}) {
  const display = formatDimensionScore(score);
  return (
    <div className="flex flex-col items-center gap-2">
      <span
        className={cn(
          "flex size-16 items-center justify-center rounded-full font-semibold tabular-nums",
          score == null ? "text-sm" : "text-lg",
          auditToneBadgeClass(scoreTone(score)),
        )}
      >
        {display}
      </span>
      <span
        className={cn(
          "text-center text-pretty text-sm",
          onMesh ? "text-white/85" : "text-muted-foreground",
        )}
      >
        {label}
      </span>
    </div>
  );
}

function FindingDetail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-3 min-w-0">
      <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </p>
      <div className="mt-1.5 min-w-0">{children}</div>
    </div>
  );
}

function findingAnchorId(finding: LocalisationAuditFinding) {
  return `finding-${finding.id}`;
}

function FindingEvidence({
  evidence,
  copy,
}: {
  evidence: string;
  copy: ReturnType<typeof getLocalisationAuditResultCopy>;
}) {
  const [expanded, setExpanded] = useState(false);
  const clipped = evidence.length > EVIDENCE_PREVIEW_CHARS && !expanded;

  return (
    <>
      <p className="min-w-0 font-mono text-sm wrap-break-word whitespace-pre-wrap text-muted-foreground">
        {clipped ? `${evidence.slice(0, EVIDENCE_PREVIEW_CHARS).trimEnd()}…` : evidence}
      </p>
      {evidence.length > EVIDENCE_PREVIEW_CHARS ? (
        <button
          type="button"
          className="mt-1.5 text-sm font-medium underline-offset-4 hover:underline"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? copy.evidenceShowLess : copy.evidenceShowMore}
        </button>
      ) : null}
    </>
  );
}

function FixFirstList({
  findings,
  linkableIds,
  copy,
}: {
  findings: LocalisationAuditFinding[];
  linkableIds: ReadonlySet<string>;
  copy: ReturnType<typeof getLocalisationAuditResultCopy>;
}) {
  if (findings.length === 0) {
    return <p className="text-muted-foreground">{copy.noFindings}</p>;
  }

  return (
    <ol className="min-w-0 space-y-5">
      {findings.map((finding, index) => (
        <li key={finding.id} className="flex min-w-0 gap-4">
          <span className="font-serif text-2xl leading-none text-muted-foreground tabular-nums">
            {index + 1}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className={cn("capitalize", auditToneBadgeClass(severityTone(finding.severity)))}
              >
                {finding.severity}
              </Badge>
              <p className="font-medium text-pretty">{finding.title}</p>
            </div>
            <p className="mt-1 text-pretty text-muted-foreground">{finding.summary}</p>
            {linkableIds.has(finding.id) ? (
              <a
                href={`#${findingAnchorId(finding)}`}
                className="mt-1.5 inline-block text-sm font-medium underline-offset-4 hover:underline"
              >
                {copy.fixFirstSeeDetails}
              </a>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

function FindingList({
  findings,
  copy,
  domainKey,
}: {
  findings: LocalisationAuditFinding[];
  copy: ReturnType<typeof getLocalisationAuditResultCopy>;
  domainKey: string;
}) {
  if (findings.length === 0) {
    return <p className="text-muted-foreground">{copy.noFindings}</p>;
  }

  return (
    <ul className="min-w-0 space-y-6">
      {findings.map((finding) => {
        const tone = severityTone(finding.severity);
        const findingHref = sanitizeLocalisationAuditFindingUrl(finding.url, domainKey);
        return (
          <li
            key={finding.id}
            id={findingAnchorId(finding)}
            className="min-w-0 scroll-mt-24 border-t border-border pt-6 first:border-t-0 first:pt-0"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={cn("capitalize", auditToneBadgeClass(tone))}>
                {finding.severity}
              </Badge>
              <span className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
                {finding.category}
                {finding.confidence != null
                  ? ` · ${copy.findingConfidence({ confidence: finding.confidence })}`
                  : ""}
              </span>
            </div>
            <p className="mt-2 text-lg font-medium text-pretty">{finding.title}</p>
            <p className="mt-1 text-pretty text-muted-foreground">{finding.summary}</p>
            {finding.where || findingHref ? (
              <FindingDetail label={copy.findingWhereLabel}>
                {finding.where ? <p className="text-sm wrap-break-word">{finding.where}</p> : null}
                {findingHref ? (
                  <a
                    href={findingHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 block break-all text-sm text-muted-foreground underline underline-offset-2"
                  >
                    {findingHref}
                  </a>
                ) : null}
              </FindingDetail>
            ) : null}
            {finding.evidence ? (
              <FindingDetail label={copy.findingEvidenceLabel}>
                <FindingEvidence evidence={finding.evidence} copy={copy} />
              </FindingDetail>
            ) : null}
            {finding.advice ? (
              <FindingDetail label={copy.findingAdviceLabel}>
                <p className="text-pretty text-sm wrap-break-word">{finding.advice}</p>
              </FindingDetail>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function CriterionStatusIcon({ status }: { status: LocalisationAuditCriterion["status"] }) {
  if (status === "pass") {
    return (
      <span
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full",
          auditToneBadgeClass("safe"),
        )}
        aria-hidden
      >
        <CheckIcon className="size-3.5" />
      </span>
    );
  }
  if (status === "fail") {
    return (
      <span
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full",
          auditToneBadgeClass("risk"),
        )}
        aria-hidden
      >
        <XIcon className="size-3.5" />
      </span>
    );
  }
  if (status === "watch") {
    return (
      <span
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full",
          auditToneBadgeClass("watch"),
        )}
        aria-hidden
      >
        <WarningIcon className="size-3.5" />
      </span>
    );
  }
  return (
    <span
      className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border text-xs text-muted-foreground"
      aria-hidden
    >
      —
    </span>
  );
}

function CriterionRow({
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
  const statusLabel = {
    pass: copy.criteriaPassLabel,
    watch: copy.criteriaWatchLabel,
    fail: copy.criteriaFailLabel,
    na: copy.criteriaNaLabel,
  }[criterion.status];
  const badgeTone = CRITERION_STATUS_TONE[criterion.status];

  return (
    <li className="border-t border-border pt-4 first:border-t-0 first:pt-0">
      <div className="flex items-start gap-3">
        <CriterionStatusIcon status={criterion.status} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{criterion.title}</p>
            <Badge variant="outline" className={cn(auditToneBadgeClass(badgeTone))}>
              {statusLabel}
            </Badge>
            {criterion.status !== "na" && criterion.score != null ? (
              <span className={cn("text-sm tabular-nums", auditToneTextClass(badgeTone))}>
                {criterion.score}
              </span>
            ) : null}
            <span className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
              {dimensionLabel}
            </span>
            {criterion.scored ? (
              <span className="text-xs text-muted-foreground">
                {copy.criteriaWeightLabel({ weight: criterion.weight })}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-pretty text-sm text-muted-foreground">{criterion.rubric}</p>
          {showFindings && criterion.findings.length > 0 ? (
            <div className="mt-4">
              <FindingList findings={criterion.findings} copy={copy} domainKey={domainKey} />
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function CriteriaGroup({
  heading,
  description,
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
  description?: string;
  criteria: LocalisationAuditCriterion[];
  copy: ReturnType<typeof getLocalisationAuditResultCopy>;
  showFindings: boolean;
  domainKey: string;
  dimensionLabels: Record<LocalisationAuditCriterion["dimension"], string>;
  defaultOpen: boolean;
  expandLabel?: string;
  collapseLabel?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  if (criteria.length === 0) return null;

  const list = (
    <>
      {description ? (
        <TypographyP className="mt-2 max-w-2xl" tone="subtle">
          {description}
        </TypographyP>
      ) : null}
      <ul className="mt-4 space-y-4">
        {criteria.map((criterion) => (
          <CriterionRow
            key={criterion.id}
            criterion={criterion}
            copy={copy}
            showFindings={showFindings}
            domainKey={domainKey}
            dimensionLabel={dimensionLabels[criterion.dimension]}
          />
        ))}
      </ul>
    </>
  );

  if (!expandLabel || !collapseLabel) {
    return (
      <div className="mt-10 first:mt-0">
        <h3 className="text-lg font-medium">{heading}</h3>
        {list}
      </div>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-10 first:mt-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-medium">{heading}</h3>
        <CollapsibleTrigger className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          {open ? collapseLabel : expandLabel}
          <CaretDownIcon className={cn("size-4 transition-transform", open && "rotate-180")} />
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>{list}</CollapsibleContent>
    </Collapsible>
  );
}

type GroupedCriteria = ReturnType<typeof groupLocalisationAuditCriteria>;

function AuditCriteriaList({
  grouped,
  copy,
  domainKey,
}: {
  grouped: GroupedCriteria;
  copy: ReturnType<typeof getLocalisationAuditResultCopy>;
  domainKey: string;
}) {
  const { passed, watch, failed, notApplicable, aiAssessed } = grouped;
  const dimensionLabels = {
    technical: copy.dimensionTechnicalShort,
    linguistic: copy.dimensionLinguisticShort,
    contextual: copy.dimensionContextualShort,
    visual: copy.dimensionVisualShort,
  } as const;

  return (
    <div>
      <TypographyP className="mt-4 max-w-2xl" tone="subtle">
        {copy.criteriaSummary({
          passed: passed.length,
          watch: watch.length,
          failed: failed.length,
          na: notApplicable.length,
        })}
      </TypographyP>

      <div className="mt-10">
        <CriteriaGroup
          heading={copy.criteriaNeedsAttentionHeading({ count: failed.length })}
          criteria={failed}
          copy={copy}
          showFindings
          domainKey={domainKey}
          dimensionLabels={dimensionLabels}
          defaultOpen
        />

        <CriteriaGroup
          heading={copy.criteriaWatchHeading({ count: watch.length })}
          criteria={watch}
          copy={copy}
          showFindings
          domainKey={domainKey}
          dimensionLabels={dimensionLabels}
          defaultOpen
        />
      </div>

      <CriteriaGroup
        heading={copy.criteriaPassedHeading({ count: passed.length })}
        criteria={passed}
        copy={copy}
        showFindings={false}
        domainKey={domainKey}
        dimensionLabels={dimensionLabels}
        defaultOpen={failed.length === 0 && watch.length === 0}
        expandLabel={copy.criteriaExpandPassed}
        collapseLabel={copy.criteriaCollapsePassed}
      />

      <CriteriaGroup
        heading={copy.criteriaAiAssessedHeading({ count: aiAssessed.length })}
        description={copy.criteriaAiAssessedBody}
        criteria={aiAssessed}
        copy={copy}
        showFindings
        domainKey={domainKey}
        dimensionLabels={dimensionLabels}
        defaultOpen={false}
        expandLabel={copy.criteriaExpandAiAssessed}
        collapseLabel={copy.criteriaCollapseAiAssessed}
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

function SampledPagesList({
  pages,
  copy,
  domainKey,
}: {
  pages: LocalisationAuditReport["pages"];
  copy: ReturnType<typeof getLocalisationAuditResultCopy>;
  domainKey: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TypographyH2 className="pb-0">{copy.pagesHeading}</TypographyH2>
        <CollapsibleTrigger className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          {open ? copy.pagesCollapse : copy.pagesExpand({ count: pages.length })}
          <CaretDownIcon className={cn("size-4 transition-transform", open && "rotate-180")} />
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <ul className="mt-6 divide-y divide-border text-sm">
          {pages.map((page) => {
            const href = sanitizeLocalisationAuditFindingUrl(page.url, domainKey);
            const path = pagePathLabel(page.url);
            return (
              <li key={page.url} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-pretty">
                    {page.title?.trim() || path}
                  </span>
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block break-all text-muted-foreground underline-offset-2 hover:underline"
                    >
                      {path}
                    </a>
                  ) : (
                    <span className="block break-all text-muted-foreground">{path}</span>
                  )}
                </span>
                {page.htmlLang ? (
                  <span className="text-xs text-muted-foreground">{page.htmlLang}</span>
                ) : null}
                {isSuccessfulLocalisationAuditPageStatus(page.status) ? null : (
                  <Badge variant="outline" className={auditToneBadgeClass("risk")}>
                    {copy.pagesHttpStatus({ status: page.status })}
                  </Badge>
                )}
              </li>
            );
          })}
        </ul>
      </CollapsibleContent>
    </Collapsible>
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
                {done ? <CheckIcon className="size-3.5" aria-hidden /> : null}
                {current ? (
                  <span className="size-2 rounded-full bg-foreground motion-safe:animate-pulse" />
                ) : null}
              </span>
              <p
                className={cn(
                  "mt-2 text-center text-xs text-pretty max-sm:sr-only",
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
  return findings
    .toSorted((a, b) => weight[a.severity] - weight[b.severity])
    .slice(0, FIX_FIRST_LIMIT);
}

type LocaleSource = LocalisationAuditLocaleSignal["source"];

function groupDetectedLocales(signals: LocalisationAuditLocaleSignal[]) {
  const byLocale = new Map<string, Set<LocaleSource>>();
  for (const signal of signals) {
    const key = signal.locale.trim();
    if (!key) continue;
    const sources = byLocale.get(key) ?? new Set<LocaleSource>();
    sources.add(signal.source);
    byLocale.set(key, sources);
  }
  return [...byLocale].map(([locale, sources]) => ({ locale, sources: [...sources] }));
}

function localeDisplayName(locale: string, displayLocale: string) {
  try {
    const names = new Intl.DisplayNames([displayLocale], { type: "language" });
    const name = names.of(locale);
    return name && name.toLowerCase() !== locale.toLowerCase() ? name : null;
  } catch {
    return null;
  }
}

function dedupeSampledPages(pages: LocalisationAuditReport["pages"]) {
  const seen = new Set<string>();
  return pages.filter((page) => {
    if (seen.has(page.url)) return false;
    seen.add(page.url);
    return true;
  });
}

function pagePathLabel(url: string) {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}` || "/";
  } catch {
    return url;
  }
}

function formatReportDate(value: string, locale: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  // Fixed zone keeps server and client output identical during hydration.
  return date.toLocaleDateString(locale, { dateStyle: "medium", timeZone: "UTC" });
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
  const siteLabel = (profile?.name ?? domainKey).trim() || domainKey;
  const logoAlt = `${siteLabel} logo`;

  return (
    <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/20 bg-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] backdrop-blur-sm sm:size-20">
      {showLogo ? (
        // Arbitrary audited-site logos; next/image host allowlist cannot cover them.
        <img
          src={profile!.logoUrl!}
          alt={logoAlt}
          className="size-full object-contain p-2"
          onError={() => setLogoFailed(true)}
        />
      ) : (
        <span className="font-serif text-2xl tracking-tight text-white sm:text-3xl">
          {companyMonogram(profile?.name, domainKey)}
        </span>
      )}
    </div>
  );
}

function MeshWash({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn("px-5 pt-10 pb-16 sm:px-8 sm:pt-14 lg:px-10", className)}>
      <MeshStage meshSrc={SAGE_MESH_GRADIENT_SRC} contentClassName="p-0" priority>
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
  const sectionClassName = isWorkspace
    ? "border-t border-border px-0 py-10 first:border-t-0 first:pt-0"
    : "border-t border-border px-5 py-16 sm:px-8 lg:px-10";
  const [audit, setAudit] = useState(initialAudit);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [rerunPending, setRerunPending] = useState(false);
  const [deliveryMessage, setDeliveryMessage] = useState<string | null>(null);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
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
        <TypographyP className="mt-4 max-w-2xl text-white/80" size="large">
          {copy.staleBody}
        </TypographyP>
        <p className="mt-6 text-sm text-white/80">{audit.domainKey}</p>
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
          <TypographyP className="mt-4 max-w-2xl text-white/80" size="large">
            {copy.runningBody}
          </TypographyP>
          <p className="mt-2 text-sm text-white/80">{copy.expectedDuration}</p>
          <p className="mt-6 text-sm text-white/80">{audit.domainKey}</p>
        </MeshWash>
        <section className="px-5 pb-20 sm:px-8 lg:px-10">
          <AuditProgressTrack activeIndex={activeIndex} copy={copy} />

          <div className="mt-12 max-w-md">
            <TypographyH2 className="pb-0" size="xlarge">
              {copy.emailWhenReadyHeading}
            </TypographyH2>
            <TypographyP className="mt-3" tone="subtle">
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
        <TypographyP className="mt-4 max-w-2xl text-white/80" size="large">
          {copy.failedBody}
        </TypographyP>
        <TypographyP className="mt-2 max-w-2xl text-white/80">
          {audit.errorMessage ?? copy.failedFallback}
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
        <TypographyP className="mt-4 max-w-2xl text-white/80" size="large">
          {copy.blockedBody}
        </TypographyP>
        <TypographyP className="mt-2 max-w-2xl text-white/80">{copy.blockedGuidance}</TypographyP>
        <p className="mt-5 max-w-2xl text-sm text-white/85">
          <span className="text-white/75">{copy.blockedUserAgent}: </span>
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
  const companyProfile = report?.companyProfile ?? teaser?.companyProfile ?? null;
  const displayName = companyProfile?.name?.trim() || audit.domainKey;
  const ctaBody =
    band === "high"
      ? copy.reauditBodyHigh
      : band === "mid"
        ? copy.reauditBodyMid
        : copy.reauditBodyLow;
  const freshness = audit.completedAt ?? teaser?.completedAt ?? report?.completedAt ?? null;
  const freshnessLabel = freshness ? formatReportDate(freshness, appLocale) : null;
  const credits = report?.credits ?? teaser?.credits ?? [];
  const methodologyVersion = report?.methodologyVersion ?? teaser?.methodologyVersion ?? 1;
  const coverageFactor = report?.localeCoverageFactor ?? teaser?.localeCoverageFactor ?? 1;
  const coverageReductionPercent = Math.round((1 - coverageFactor) * 100);
  const groupedCriteria = groupLocalisationAuditCriteria(
    buildLocalisationAuditCriteria(credits, allFindings, { methodologyVersion }),
  );
  const findingsUnderCriteria = new Set(
    [...groupedCriteria.failed, ...groupedCriteria.watch, ...groupedCriteria.aiAssessed].flatMap(
      (criterion) => criterion.findings.map((finding) => finding.id),
    ),
  );
  const unscoredCreditIds = new Set(groupedCriteria.aiAssessed.map((criterion) => criterion.id));
  const fixFirst = prioritizeFindings(
    allFindings.filter((finding) => !finding.creditId || !unscoredCreditIds.has(finding.creditId)),
  );
  const otherFindings = allFindings.filter((finding) => !findingsUnderCriteria.has(finding.id));
  const hasCriteria = credits.length > 0;
  const linkableFindingIds = new Set(allFindings.map((finding) => finding.id));
  const detectedLocales = groupDetectedLocales(
    report?.detectedLocales ?? teaser?.detectedLocales ?? [],
  );
  const localeSourceLabels: Record<LocaleSource, string> = {
    hreflang: copy.localeSourceHreflang,
    html_lang: copy.localeSourceHtmlLang,
    url_prefix: copy.localeSourceUrlPrefix,
    url_subdomain: copy.localeSourceUrlSubdomain,
    focus: copy.localeSourceFocus,
  };
  const sampledPages = report?.pages ? dedupeSampledPages(report.pages) : [];
  const sectionLinks = [
    { id: "fix-first", label: copy.fixFirstHeading },
    hasCriteria ? { id: "criteria", label: copy.creditsHeading } : null,
    otherFindings.length > 0
      ? {
          id: "findings",
          label: hasCriteria ? copy.otherFindingsHeading : copy.fullFindingsHeading,
        }
      : null,
    { id: "locales", label: copy.localesHeading },
    sampledPages.length > 0 ? { id: "pages", label: copy.pagesHeading } : null,
  ].filter((link): link is { id: string; label: string } => link != null);

  return (
    <>
      <MeshWash className={isWorkspace ? "px-0 pt-0 pb-8 sm:px-0 sm:pt-0 lg:px-0" : undefined}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <p className="text-xs font-medium tracking-[0.18em] text-white/80 uppercase">
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
              <ShareNetworkIcon className="size-3.5" aria-hidden />
              {copy.shareCopyLink}
            </Button>
          )}
        </div>

        <div className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-start">
          <CompanyMark profile={companyProfile} domainKey={audit.domainKey} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-serif text-3xl tracking-tight text-balance text-white sm:text-4xl lg:text-5xl">
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
            <p className="mt-2 text-sm text-white/80">{audit.domainKey}</p>
            {companyProfile?.productSummary ? (
              <p className="mt-4 max-w-2xl text-pretty text-base text-white/90 sm:text-lg">
                <span className="text-white/75">{copy.companyProductLabel}: </span>
                {companyProfile.productSummary}
              </p>
            ) : null}
            {companyProfile?.brandVoice ? (
              <p className="mt-2 max-w-2xl text-pretty text-sm text-white/85">
                <span className="text-white/75">{copy.companyBrandVoiceLabel}: </span>
                {companyProfile.brandVoice}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-10 border-t border-white/15 pt-8">
          <p className="text-sm text-white/80">{copy.scoreLabel}</p>
          <p className="mt-2 font-serif text-5xl tracking-tight text-white sm:text-6xl">
            <span className="tabular-nums">{score ?? "—"}</span>
            <span className="text-3xl text-white/75 sm:text-4xl">{copy.scoreOutOf}</span>
          </p>
          {ratingLabel ? (
            <Badge
              variant="outline"
              className="mt-4 border-white/25 bg-white/10 text-white capitalize"
            >
              {ratingLabel}
            </Badge>
          ) : null}
          <TypographyP className="mt-4 max-w-2xl text-white/80" wrapStyle="pretty" size="large">
            {interpretation}
          </TypographyP>
          {coverageReductionPercent > 0 ? (
            <p className="mt-2 max-w-2xl text-pretty text-sm text-white/75">
              {copy.scoreCoverageAdjustment({ percent: coverageReductionPercent })}
            </p>
          ) : null}
          {score != null && methodologyVersion < LOCALISATION_AUDIT_METHODOLOGY_VERSION ? (
            <p className="mt-2 max-w-2xl text-pretty text-sm text-white/75">
              {copy.scoreLegacyMethodology}
            </p>
          ) : null}
          {dimensionScores ? (
            <ul className="mt-8 grid max-w-2xl grid-cols-2 gap-6 sm:grid-cols-4">
              <li>
                <DimensionScoreCircle
                  label={copy.dimensionTechnical}
                  score={dimensionScores.technical}
                  onMesh
                />
              </li>
              <li>
                <DimensionScoreCircle
                  label={copy.dimensionLinguistic}
                  score={dimensionScores.linguistic}
                  onMesh
                />
              </li>
              <li>
                <DimensionScoreCircle
                  label={copy.dimensionContextual}
                  score={dimensionScores.contextual}
                  onMesh
                />
              </li>
              <li>
                <DimensionScoreCircle
                  label={copy.dimensionVisual}
                  score={dimensionScores.visual}
                  onMesh
                />
              </li>
            </ul>
          ) : null}
          <div className="mt-6 flex flex-wrap gap-x-8 gap-y-2 text-sm text-white/80">
            {freshnessLabel ? (
              <span>
                {copy.freshnessLabel}: {freshnessLabel}
              </span>
            ) : null}
            <span>
              {copy.scopeLabel}: {copy.scopeBody}
            </span>
            <span>
              {copy.confidenceLabel}: {copy.confidenceBody}
            </span>
          </div>
          {shareMessage ? (
            <p className="mt-4 text-sm text-white/85" aria-live="polite">
              {shareMessage}
            </p>
          ) : null}
          <TypographyP className="mt-4 max-w-2xl text-white/80">
            {copy.sampledPages({
              count: teaser?.pagesCrawled ?? report?.pagesCrawled ?? 0,
            })}{" "}
            <Link
              href={getLocalisationAuditGuideHref(locale)}
              className="font-medium text-white underline-offset-4 hover:underline"
            >
              {copy.methodologyLink}
            </Link>
          </TypographyP>
        </div>
      </MeshWash>

      {sectionLinks.length > 2 ? (
        <nav
          aria-label={copy.reportNavLabel}
          className={cn(
            "flex flex-wrap gap-x-6 gap-y-2 text-sm",
            isWorkspace ? "pb-6" : "px-5 pb-8 sm:px-8 lg:px-10",
          )}
        >
          {sectionLinks.map((link) => (
            <a
              key={link.id}
              href={`#${link.id}`}
              className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              {link.label}
            </a>
          ))}
        </nav>
      ) : null}

      {standing && !isWorkspace ? (
        <section className={sectionClassName}>
          <TypographyH2 className="pb-0">{copy.standingHeading}</TypographyH2>
          <TypographyP className="mt-4 max-w-2xl" size="large" tone="subtle">
            {copy.standingRank({ rank: standing.rank, total: standing.total })}
          </TypographyP>
          <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm text-muted-foreground">
            {standing.ahead > 0 ? (
              <span>{copy.standingAhead({ ahead: standing.ahead })}</span>
            ) : null}
            {standing.averageScore != null ? (
              <span>{copy.standingAverage({ average: standing.averageScore })}</span>
            ) : null}
          </div>
          <div className="mt-6">
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={`/${locale}/localisation-audit`} />}
            >
              {copy.standingCta}
            </Button>
          </div>
        </section>
      ) : null}

      <section id="fix-first" className={cn(sectionClassName, "scroll-mt-24")}>
        <TypographyH2 className="pb-0">{copy.fixFirstHeading}</TypographyH2>
        <div className="mt-8">
          <FixFirstList findings={fixFirst} linkableIds={linkableFindingIds} copy={copy} />
        </div>
      </section>

      {hasCriteria ? (
        <section id="criteria" className={cn(sectionClassName, "scroll-mt-24")}>
          <TypographyH2 className="pb-0">{copy.creditsHeading}</TypographyH2>
          <AuditCriteriaList grouped={groupedCriteria} copy={copy} domainKey={audit.domainKey} />
        </section>
      ) : null}

      {otherFindings.length > 0 ? (
        <section id="findings" className={cn(sectionClassName, "scroll-mt-24")}>
          <TypographyH2 className="pb-0">
            {hasCriteria ? copy.otherFindingsHeading : copy.fullFindingsHeading}
          </TypographyH2>
          {hasCriteria ? (
            <TypographyP className="mt-4 max-w-2xl" tone="subtle">
              {copy.otherFindingsBody}
            </TypographyP>
          ) : null}
          <div className="mt-8">
            <FindingList findings={otherFindings} copy={copy} domainKey={audit.domainKey} />
          </div>
        </section>
      ) : null}

      <section id="locales" className={cn(sectionClassName, "scroll-mt-24")}>
        <TypographyH2 className="pb-0">{copy.localesHeading}</TypographyH2>
        {detectedLocales.length === 0 ? (
          <TypographyP className="mt-4" tone="subtle">
            {copy.localesEmpty}
          </TypographyP>
        ) : (
          <ul className="mt-6 flex flex-wrap gap-3">
            {detectedLocales.map(({ locale: detected, sources }) => {
              const name = localeDisplayName(detected, appLocale);
              return (
                <li key={detected} className="rounded-lg border border-border px-3 py-2">
                  <p className="text-sm font-medium">{name ?? detected}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {[
                      name ? detected : null,
                      ...sources.map((source) => localeSourceLabels[source]),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {report?.linguisticNotes && report.linguisticNotes.length > 0 ? (
        <section className={sectionClassName}>
          <TypographyH2 className="pb-0">{copy.linguisticHeading}</TypographyH2>
          <ul className="mt-8 space-y-8">
            {report.linguisticNotes.map((note) => (
              <li key={note.locale}>
                <p className="text-lg font-medium">{note.locale}</p>
                <p className="mt-2 text-muted-foreground">{note.summary}</p>
                <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
                  {note.samples.map((sample) => (
                    <li key={`${note.locale}-${sample.text}`}>
                      <p className="italic">“{sample.text}”</p>
                      <p className="mt-1">{sample.note}</p>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {sampledPages.length > 0 ? (
        <section id="pages" className={cn(sectionClassName, "scroll-mt-24")}>
          <SampledPagesList pages={sampledPages} copy={copy} domainKey={audit.domainKey} />
        </section>
      ) : null}

      {isWorkspace ? null : (
        <section className={sectionClassName}>
          <TypographyH2 className="pb-0">{copy.reauditHeading}</TypographyH2>
          <TypographyP className="mt-4 max-w-2xl" tone="subtle">
            {ctaBody}
          </TypographyP>
          <div className="mt-6 flex flex-wrap gap-3">
            {showSignInCtas ? (
              audit.claimed ? (
                <Button
                  nativeButton={false}
                  render={
                    <Link href={claimDomainHref} onClick={() => trackCta("open_claimed_domain")} />
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
            <Button
              variant={showSignInCtas ? "outline" : "default"}
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
            {audit.rerunnable ? (
              <Button
                variant="ghost"
                onClick={() => restartAudit(copy.rerunError)}
                disabled={rerunPending}
              >
                {rerunPending ? copy.rerunning : copy.rerun}
              </Button>
            ) : null}
          </div>
          {!audit.rerunnable && audit.rerunAvailableAt ? (
            <p className="mt-4 text-sm text-muted-foreground">
              {copy.rerunCooldown({
                when: new Date(audit.rerunAvailableAt).toLocaleString(appLocale, {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "UTC",
                  timeZoneName: "short",
                }),
              })}
            </p>
          ) : null}

          <div className="mt-12 max-w-xl border-t border-border pt-8">
            <h3 className="text-lg font-medium">{copy.unlockHeading}</h3>
            <TypographyP className="mt-2" tone="subtle">
              {copy.unlockBody}
            </TypographyP>
            <form
              onSubmit={requestReportEmail}
              className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end"
            >
              <div className="min-w-0 flex-1 space-y-2">
                <Label htmlFor="localisation-audit-email">{copy.emailLabel}</Label>
                <Input
                  id="localisation-audit-email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder={copy.emailPlaceholder}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              <Button type="submit" variant="outline" disabled={pending}>
                {pending ? copy.unlocking : copy.unlockSubmit}
              </Button>
            </form>
            {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
            {deliveryMessage ? (
              <p className="mt-3 text-sm text-muted-foreground" aria-live="polite">
                {deliveryMessage}
              </p>
            ) : null}
          </div>
        </section>
      )}
    </>
  );
}
