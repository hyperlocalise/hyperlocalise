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
import Link from "next/link";
import { CheckIcon } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import { REQUEST_DEMO_URL } from "@/components/marketing/request-demo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TypographyH1, TypographyH2, TypographyP } from "@/components/ui/typography";
import { clientAnalytics } from "@/lib/analytics/client";
import { LOCALISATION_AUDIT_ANALYTICS_EVENTS, scoreBand } from "@/lib/analytics/events";
import {
  formatDimensionScore,
  scoreTone,
  severityTone,
  type LocalisationAuditTone,
} from "@/lib/localisation-audit/score-tone";
import type { LocalisationAuditStanding } from "@/lib/localisation-audit/store";
import type {
  LocalisationAuditFinding,
  LocalisationAuditProgressStage,
  LocalisationAuditReport,
  LocalisationAuditTeaser,
} from "@/lib/localisation-audit/types";
import { cn } from "@/lib/primitives/cn";

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
  errorCode: string | null;
  errorMessage?: string | null;
  completedAt?: string | null;
};

type LocalisationAuditResultProps = {
  locale: string;
  domainSlug: string;
  initialAudit: AuditPayload;
  standing: LocalisationAuditStanding | null;
};

const PROGRESS_STAGES = ["queued", "preparing", "crawling", "analyzing", "scoring"] as const;

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

function ScoreValue({
  score,
  className,
}: {
  score: number | null | undefined;
  className?: string;
}) {
  if (score == null) {
    return <span className={cn("tabular-nums text-muted-foreground", className)}>—</span>;
  }
  return (
    <span className={cn("tabular-nums", auditToneTextClass(scoreTone(score)), className)}>
      {score}
    </span>
  );
}

function DimensionScoreCircle({ label, score }: { label: string; score: number | null }) {
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
      <span className="text-center text-pretty text-sm text-muted-foreground">{label}</span>
    </div>
  );
}

function looksLikeMarkup(value: string) {
  return value.includes("<") && value.includes(">");
}

function FindingDetail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-3">
      <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function FindingList({
  findings,
  copy,
}: {
  findings: LocalisationAuditFinding[];
  copy: ReturnType<typeof getLocalisationAuditResultCopy>;
}) {
  if (findings.length === 0) {
    return <p className="text-muted-foreground">No findings in this section.</p>;
  }

  return (
    <ul className="space-y-6">
      {findings.map((finding) => {
        const tone = severityTone(finding.severity);
        const evidenceLooksLikeMarkup =
          finding.evidence != null && looksLikeMarkup(finding.evidence);
        return (
          <li key={finding.id} className="border-t border-border pt-6 first:border-t-0 first:pt-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={cn("capitalize", auditToneBadgeClass(tone))}>
                {finding.severity}
              </Badge>
              <span className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
                {finding.category}
                {finding.confidence != null ? ` · ${finding.confidence}% confidence` : ""}
              </span>
            </div>
            <p className="mt-2 text-lg font-medium">{finding.title}</p>
            <p className="mt-1 text-pretty text-muted-foreground">{finding.summary}</p>
            {finding.where || finding.url ? (
              <FindingDetail label={copy.findingWhereLabel}>
                {finding.where ? <p className="text-sm">{finding.where}</p> : null}
                {finding.url ? (
                  <a
                    href={finding.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 block break-all text-sm text-muted-foreground underline underline-offset-2"
                  >
                    {finding.url}
                  </a>
                ) : null}
              </FindingDetail>
            ) : null}
            {finding.evidence ? (
              <FindingDetail label={copy.findingEvidenceLabel}>
                <p
                  className={cn(
                    "whitespace-pre-wrap text-sm text-muted-foreground",
                    evidenceLooksLikeMarkup ? "font-mono" : "italic",
                  )}
                >
                  {evidenceLooksLikeMarkup ? finding.evidence : `“${finding.evidence}”`}
                </p>
              </FindingDetail>
            ) : null}
            {finding.advice ? (
              <FindingDetail label={copy.findingAdviceLabel}>
                <p className="text-pretty text-sm">{finding.advice}</p>
              </FindingDetail>
            ) : null}
          </li>
        );
      })}
    </ul>
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
          {formatCopy(copy.progressStepOf, { current: currentStep, total })}
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

function formatCopy(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

export function LocalisationAuditResult({
  locale,
  domainSlug,
  initialAudit,
  standing,
}: LocalisationAuditResultProps) {
  const copy = getLocalisationAuditResultCopy(locale);
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
    if (audit.status === "succeeded" || audit.status === "failed") {
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
        setError(body?.message ?? "Could not request the report email.");
        return;
      }
      if (body?.audit) setAudit(body.audit);
      setDeliveryMessage(
        body?.delivery?.message ??
          (audit.status === "succeeded" ? copy.unlockQueued : copy.emailWhenReadyQueued),
      );
    } catch {
      setError("Could not request the report email.");
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
      <section className="px-5 pt-16 pb-20 sm:px-8 sm:pt-20 lg:px-10">
        <TypographyH1>{copy.staleTitle}</TypographyH1>
        <TypographyP className="mt-4 max-w-2xl text-lg text-muted-foreground">
          {copy.staleBody}
        </TypographyP>
        <p className="mt-6 text-sm text-muted-foreground">{audit.domainKey}</p>
        {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
        <Button
          className="mt-8"
          onClick={() => restartAudit("Could not retry the audit.")}
          disabled={rerunPending}
        >
          {rerunPending ? copy.retrying : copy.retry}
        </Button>
      </section>
    );
  }

  if (audit.status === "queued" || audit.status === "running") {
    const activeIndex = stageIndex(audit.progressStage);
    return (
      <section className="px-5 pt-16 pb-20 sm:px-8 sm:pt-20 lg:px-10">
        <TypographyH1>{copy.runningTitle}</TypographyH1>
        <TypographyP className="mt-4 max-w-2xl text-lg text-muted-foreground">
          {copy.runningBody}
        </TypographyP>
        <p className="mt-2 text-sm text-muted-foreground">{copy.expectedDuration}</p>
        <p className="mt-6 text-sm text-muted-foreground">{audit.domainKey}</p>

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
    );
  }

  if (audit.status === "failed") {
    return (
      <section className="px-5 pt-16 pb-20 sm:px-8 sm:pt-20 lg:px-10">
        <TypographyH1>{copy.failedTitle}</TypographyH1>
        <TypographyP className="mt-4 max-w-2xl text-lg text-muted-foreground">
          {copy.failedBody}
        </TypographyP>
        <TypographyP className="mt-2 max-w-2xl text-muted-foreground">
          {audit.errorMessage ?? audit.errorCode ?? "The audit could not finish for this domain."}
        </TypographyP>
        {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
        <Button
          className="mt-8"
          onClick={() => restartAudit("Could not retry the audit.")}
          disabled={rerunPending}
        >
          {rerunPending ? copy.retrying : copy.retry}
        </Button>
      </section>
    );
  }

  const teaser = audit.teaser;
  const report = audit.unlocked ? audit.report : null;
  const score = audit.score ?? teaser?.score ?? null;
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
  const dimensionScores = teaser?.dimensionScores ?? report?.dimensionScores;
  const fixFirst = prioritizeFindings(teaser?.headlineFindings ?? report?.findings ?? []);
  const headlineFindings = teaser?.headlineFindings ?? [];
  const totalFindings = report?.findings.length ?? teaser?.findingsCount ?? headlineFindings.length;
  const lockedFindingCount = Math.max(0, totalFindings - headlineFindings.length);
  const ctaBody =
    band === "high"
      ? copy.reauditBodyHigh
      : band === "mid"
        ? copy.reauditBodyMid
        : copy.reauditBodyLow;
  const freshness = audit.completedAt ?? teaser?.completedAt ?? null;

  return (
    <>
      <section className="px-5 pt-16 pb-12 sm:px-8 sm:pt-20 lg:px-10">
        <p className="text-sm text-muted-foreground">{audit.domainKey}</p>
        <TypographyH1 className="mt-3 text-balance">
          {copy.scoreLabel}: <ScoreValue score={score} />
          <span className="text-muted-foreground">{copy.scoreOutOf}</span>
        </TypographyH1>
        {ratingLabel ? (
          <Badge variant="outline" className={cn("mt-4", auditToneBadgeClass(scoreTone(score)))}>
            {ratingLabel}
          </Badge>
        ) : null}
        <TypographyP className="mt-4 max-w-2xl text-pretty text-lg text-muted-foreground">
          {interpretation}
        </TypographyP>
        {dimensionScores ? (
          <ul className="mt-8 grid max-w-2xl grid-cols-2 gap-6 sm:grid-cols-4">
            <li>
              <DimensionScoreCircle
                label={copy.dimensionTechnical}
                score={dimensionScores.technical}
              />
            </li>
            <li>
              <DimensionScoreCircle
                label={copy.dimensionLinguistic}
                score={dimensionScores.linguistic}
              />
            </li>
            <li>
              <DimensionScoreCircle
                label={copy.dimensionContextual}
                score={dimensionScores.contextual}
              />
            </li>
            <li>
              <DimensionScoreCircle label={copy.dimensionVisual} score={dimensionScores.visual} />
            </li>
          </ul>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-x-8 gap-y-2 text-sm text-muted-foreground">
          {freshness ? (
            <span>
              {copy.freshnessLabel}: {new Date(freshness).toLocaleDateString()}
            </span>
          ) : null}
          <span>
            {copy.scopeLabel}: {copy.scopeBody}
          </span>
          <span>
            {copy.confidenceLabel}: {copy.confidenceBody}
          </span>
        </div>
        <TypographyP className="mt-4 max-w-2xl text-muted-foreground">
          Sampled {teaser?.pagesCrawled ?? report?.pagesCrawled ?? 0} pages across technical,
          linguistic, contextual, and visual localisation credits.{" "}
          <Link
            href={getLocalisationAuditGuideHref()}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            {copy.methodologyLink}
          </Link>
        </TypographyP>
      </section>

      {standing ? (
        <section className="border-t border-border px-5 py-16 sm:px-8 lg:px-10">
          <TypographyH2 className="pb-0">{copy.standingHeading}</TypographyH2>
          <TypographyP className="mt-4 max-w-2xl text-lg text-muted-foreground">
            {formatCopy(copy.standingRank, { rank: standing.rank, total: standing.total })}
          </TypographyP>
          <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm text-muted-foreground">
            <span>{formatCopy(copy.standingPercentile, { percentile: standing.percentile })}</span>
            {standing.averageScore != null ? (
              <span>{formatCopy(copy.standingAverage, { average: standing.averageScore })}</span>
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

      <section className="border-t border-border px-5 py-16 sm:px-8 lg:px-10">
        <TypographyH2 className="pb-0">{copy.fixFirstHeading}</TypographyH2>
        <div className="mt-8">
          <FindingList findings={fixFirst} copy={copy} />
        </div>
      </section>

      <section className="border-t border-border px-5 py-16 sm:px-8 lg:px-10">
        <TypographyH2 className="pb-0">{copy.localesHeading}</TypographyH2>
        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
          {(teaser?.detectedLocales ?? report?.detectedLocales ?? []).map((localeSignal) => (
            <span key={`${localeSignal.locale}-${localeSignal.source}`}>
              {localeSignal.locale}{" "}
              <span className="text-muted-foreground/70">({localeSignal.source})</span>
            </span>
          ))}
        </div>
      </section>

      <section className="border-t border-border px-5 py-16 sm:px-8 lg:px-10">
        <TypographyH2 className="pb-0">{copy.findingsHeading}</TypographyH2>
        <div className="mt-8">
          <FindingList findings={headlineFindings} copy={copy} />
        </div>
      </section>

      {!audit.unlocked ? (
        <section className="border-t border-border px-5 py-16 sm:px-8 lg:px-10">
          <TypographyH2 className="pb-0">{copy.unlockHeading}</TypographyH2>
          <TypographyP className="mt-4 max-w-2xl text-muted-foreground">
            {copy.unlockBody}
          </TypographyP>
          {lockedFindingCount > 0 ? (
            <TypographyP className="mt-3 max-w-2xl font-medium text-foreground">
              {formatCopy(copy.unlockLockedCount, { count: lockedFindingCount })}
            </TypographyP>
          ) : null}
          <form onSubmit={requestReportEmail} className="mt-8 max-w-md space-y-4">
            <div className="space-y-2">
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
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {deliveryMessage ? (
              <p className="text-sm text-muted-foreground">{deliveryMessage}</p>
            ) : null}
            <Button type="submit" disabled={pending}>
              {pending ? copy.unlocking : copy.unlockSubmit}
            </Button>
          </form>
        </section>
      ) : null}

      <section className="border-t border-border px-5 py-16 sm:px-8 lg:px-10">
        <TypographyH2 className="pb-0">{copy.shareHeading}</TypographyH2>
        <TypographyP className="mt-4 max-w-2xl text-muted-foreground">{copy.shareBody}</TypographyP>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" onClick={copyShareLink}>
            {copy.shareCopyLink}
          </Button>
          {shareMessage ? <p className="text-sm text-muted-foreground">{shareMessage}</p> : null}
        </div>
      </section>

      {report ? (
        <>
          <section className="border-t border-border px-5 py-16 sm:px-8 lg:px-10">
            <TypographyH2 className="pb-0">{copy.fullFindingsHeading}</TypographyH2>
            <div className="mt-8">
              <FindingList findings={report.findings} copy={copy} />
            </div>
          </section>

          {report.credits && report.credits.length > 0 ? (
            <section className="border-t border-border px-5 py-16 sm:px-8 lg:px-10">
              <TypographyH2 className="pb-0">{copy.creditsHeading}</TypographyH2>
              <ul className="mt-8 space-y-3 text-sm">
                {report.credits.map((credit) => (
                  <li
                    key={credit.id}
                    className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-border pt-3 first:border-t-0 first:pt-0"
                  >
                    <span>
                      {credit.id}
                      <span className="text-muted-foreground"> · {credit.dimension}</span>
                    </span>
                    <span className="tabular-nums">
                      {credit.method === "na" || credit.score == null ? (
                        <span className="text-muted-foreground">N/A</span>
                      ) : (
                        <ScoreValue score={credit.score} />
                      )}
                      {credit.method !== "na" ? (
                        <span className="text-muted-foreground"> · {credit.method}</span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {report.linguisticNotes.length > 0 ? (
            <section className="border-t border-border px-5 py-16 sm:px-8 lg:px-10">
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

          <section className="border-t border-border px-5 py-16 sm:px-8 lg:px-10">
            <TypographyH2 className="pb-0">{copy.pagesHeading}</TypographyH2>
            <ul className="mt-8 space-y-3 text-sm text-muted-foreground">
              {report.pages.map((page) => (
                <li key={page.url} className="break-all">
                  {page.status} · {page.url}
                  {page.htmlLang ? ` · lang=${page.htmlLang}` : ""}
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}

      <section className="border-t border-border px-5 py-16 sm:px-8 lg:px-10">
        <TypographyH2 className="pb-0">{copy.reauditHeading}</TypographyH2>
        <TypographyP className="mt-4 max-w-2xl text-muted-foreground">{ctaBody}</TypographyP>
        <div className="mt-6 flex flex-wrap gap-3">
          {audit.rerunnable ? (
            <Button
              onClick={() => restartAudit("Could not re-run the audit.")}
              disabled={rerunPending}
            >
              {rerunPending ? copy.rerunning : copy.rerun}
            </Button>
          ) : null}
          <Button
            nativeButton={false}
            render={<Link href="/auth/sign-in" onClick={() => trackCta("create_workspace")} />}
          >
            {band === "low" ? copy.createWorkspace : copy.deeperAudit}
          </Button>
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
          <p className="mt-4 text-sm text-muted-foreground">
            {formatCopy(copy.rerunCooldown, {
              when: new Date(audit.rerunAvailableAt).toLocaleString(locale, {
                dateStyle: "medium",
                timeStyle: "short",
              }),
            })}
          </p>
        ) : null}
      </section>
    </>
  );
}
