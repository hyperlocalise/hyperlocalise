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
  ArrowRightIcon,
  ArrowSquareOutIcon,
  CaretDownIcon,
  ShareNetworkIcon,
} from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { TypographyH2, TypographyP } from "@/components/ui/typography";
import { LOCALISATION_AUDIT_METHODOLOGY_VERSION } from "@/lib/localisation-audit/credits/catalog";
import {
  buildLocalisationAuditCriteria,
  groupLocalisationAuditCriteria,
} from "@/lib/localisation-audit/criteria";
import { sanitizeLocalisationAuditFindingUrl } from "@/lib/localisation-audit/finding-url";
import { isSuccessfulLocalisationAuditPageStatus } from "@/lib/localisation-audit/report-coverage";
import {
  composeLocalisationAuditScore,
  describeLocalisationAuditScoringModel,
  LOCALISATION_AUDIT_DIMENSIONS,
  rankCriteriaByGain,
} from "@/lib/localisation-audit/score-composition";
import { scoreTone, severityTone } from "@/lib/localisation-audit/score-tone";
import type { LocalisationAuditStanding } from "@/lib/localisation-audit/store";
import type {
  LocalisationAuditCompanyProfile,
  LocalisationAuditFinding,
  LocalisationAuditLocaleSignal,
  LocalisationAuditReport,
  LocalisationAuditTeaser,
} from "@/lib/localisation-audit/types";
import { cn } from "@/lib/primitives/cn";

import {
  checkAnchorId,
  dimensionLabels,
  findingAnchorId,
  FindingList,
  formatPoints,
  LocalisationAuditChecks,
} from "./localisation-audit-checks";
import { formatReportDate, formatRerunAvailableAt } from "./localisation-audit-format-date";
import {
  getLocalisationAuditGuideHref,
  getLocalisationAuditPageCopy,
  interpretScore,
  interpretScoreCtaBand,
  type LocalisationAuditResultCopy,
} from "./localisation-audit-page-content";
import { LocalisationAuditResultErrorBoundary } from "./localisation-audit-result-error-boundary";
import { LocalisationAuditScoreBreakdown } from "./localisation-audit-score-breakdown";
import {
  AnimatedNumber,
  MeterBar,
  ScoreBandScale,
  ScoreRing,
} from "./localisation-audit-score-visuals";
import { LocalisationAuditThresholdLegend } from "./localisation-audit-scoring-explainer";
import { auditToneBadgeClass, auditToneTextClass } from "./localisation-audit-tone";

const FIX_FIRST_LIMIT = 3;
const SEVERITY_ORDER = { critical: 0, high: 1, warning: 1, medium: 2, low: 3, info: 4 } as const;
const PERCENT = 100;

type LocaleSource = LocalisationAuditLocaleSignal["source"];

export type LocalisationAuditReportAudit = {
  id: string;
  domainKey: string;
  score: number | null;
  teaser: LocalisationAuditTeaser | null;
  report: LocalisationAuditReport | null;
  rerunnable?: boolean;
  rerunAvailableAt?: string | null;
  claimed?: boolean;
  completedAt?: string | null;
};

export type LocalisationAuditReportActions = {
  onShare: () => void;
  shareMessage: string | null;
  onRerun: () => void;
  rerunPending: boolean;
  error: string | null;
  onTrackCta: (cta: string) => void;
  emailForm: ReactNode;
};

function IsolatedReportSection({
  section,
  children,
  resetKeys,
}: {
  section: string;
  children: ReactNode;
  resetKeys?: unknown[];
}) {
  return (
    <LocalisationAuditResultErrorBoundary scope="section" section={section} resetKeys={resetKeys}>
      {children}
    </LocalisationAuditResultErrorBoundary>
  );
}

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

function companyMonogram(name: string | null | undefined, domainKey: string) {
  const letter = (name ?? domainKey).trim().charAt(0).toUpperCase();
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

  return (
    <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-background shadow-xs sm:size-16">
      {showLogo ? (
        // Arbitrary audited-site logos; next/image host allowlist cannot cover them.
        <img
          src={profile!.logoUrl!}
          alt={`${siteLabel} logo`}
          referrerPolicy="no-referrer"
          className="size-full object-contain p-2"
          onError={() => setLogoFailed(true)}
        />
      ) : (
        <span className="font-serif text-2xl tracking-tight">
          {companyMonogram(profile?.name, domainKey)}
        </span>
      )}
    </div>
  );
}

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-border bg-background p-5 sm:p-6", className)}>
      {children}
    </div>
  );
}

function SectionHeading({ title, subcopy }: { title: string; subcopy?: string }) {
  return (
    <>
      <TypographyH2 className="pb-0">{title}</TypographyH2>
      {subcopy ? (
        <TypographyP className="mt-2 max-w-2xl" tone="subtle">
          {subcopy}
        </TypographyP>
      ) : null}
    </>
  );
}

/** Highlights the section currently in view in the sticky report nav. */
function useActiveSection(ids: string[]) {
  const [active, setActive] = useState<string | null>(null);
  const key = ids.join("|");

  useEffect(() => {
    const elements = key
      .split("|")
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => element != null);
    if (elements.length === 0 || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .toSorted((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-20% 0px -70% 0px" },
    );
    for (const element of elements) observer.observe(element);
    return () => observer.disconnect();
  }, [key]);

  return active;
}

function SectionNav({
  links,
  label,
  isWorkspace,
}: {
  links: Array<{ id: string; label: string }>;
  label: string;
  isWorkspace: boolean;
}) {
  const active = useActiveSection(links.map((link) => link.id));
  return (
    <nav
      aria-label={label}
      className={cn(
        "sticky top-0 z-20 -mx-5 border-b border-border bg-background/85 backdrop-blur-md sm:-mx-8 lg:-mx-10",
        isWorkspace && "mx-0 sm:mx-0 lg:mx-0",
      )}
    >
      <ul className="flex gap-1 overflow-x-auto px-5 py-2 text-sm sm:px-8 lg:px-10">
        {links.map((link) => (
          <li key={link.id} className="shrink-0">
            <a
              href={`#${link.id}`}
              aria-current={active === link.id ? "location" : undefined}
              className={cn(
                "relative block rounded-full px-3 py-1.5 transition-colors",
                active === link.id
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {active === link.id ? (
                <motion.span
                  layoutId="audit-report-nav-active"
                  className="absolute inset-0 rounded-full bg-muted"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              ) : null}
              <span className="relative">{link.label}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-border p-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-serif text-2xl tracking-tight sm:text-3xl">{children}</dd>
    </div>
  );
}

export function LocalisationAuditReportView({
  audit,
  standing,
  copy,
  locale,
  appLocale,
  isWorkspace,
  showSignInCtas,
  claimDomainHref,
  demoHref,
  leaderboardHref,
  actions,
}: {
  audit: LocalisationAuditReportAudit;
  standing: LocalisationAuditStanding | null;
  copy: LocalisationAuditResultCopy;
  locale: string;
  appLocale: string;
  isWorkspace: boolean;
  showSignInCtas: boolean;
  claimDomainHref: string;
  demoHref: string;
  leaderboardHref: string;
  actions: LocalisationAuditReportActions;
}) {
  const reduceMotion = useReducedMotion();
  const pageCopy = getLocalisationAuditPageCopy(locale);
  const labels = dimensionLabels(copy);
  const { teaser, report } = audit;

  const score = audit.score ?? teaser?.score ?? report?.score ?? null;
  const rating = interpretScore(score);
  const band = interpretScoreCtaBand(rating);
  const interpretation = {
    excellent: copy.scoreInterpretationExcellent,
    good: copy.scoreInterpretationGood,
    "needs-improvement": copy.scoreInterpretationNeedsImprovement,
    poor: copy.scoreInterpretationPoor,
    critical: copy.scoreInterpretationCritical,
    unknown: null,
  }[rating];
  const ratingLabel = {
    excellent: copy.scoreRatingExcellent,
    good: copy.scoreRatingGood,
    "needs-improvement": copy.scoreRatingNeedsImprovement,
    poor: copy.scoreRatingPoor,
    critical: copy.scoreRatingCritical,
    unknown: null,
  }[rating];
  const ctaBody =
    band === "high"
      ? copy.reauditBodyHigh
      : band === "mid"
        ? copy.reauditBodyMid
        : copy.reauditBodyLow;

  const dimensionScores = report?.dimensionScores ?? teaser?.dimensionScores;
  const allFindings = report?.findings ?? teaser?.headlineFindings ?? [];
  const companyProfile = report?.companyProfile ?? teaser?.companyProfile ?? null;
  const displayName = companyProfile?.name?.trim() || audit.domainKey;
  const freshness = audit.completedAt ?? teaser?.completedAt ?? report?.completedAt ?? null;
  const freshnessLabel = freshness ? formatReportDate(freshness, appLocale) : null;
  const credits = report?.credits ?? teaser?.credits ?? [];
  const methodologyVersion = report?.methodologyVersion ?? teaser?.methodologyVersion ?? 1;
  const coverageFactor = report?.localeCoverageFactor ?? teaser?.localeCoverageFactor ?? 1;
  const coverageReductionPercent = Math.round((1 - coverageFactor) * PERCENT);
  const pagesCrawled = teaser?.pagesCrawled ?? report?.pagesCrawled ?? 0;

  const criteria = buildLocalisationAuditCriteria(credits, allFindings, { methodologyVersion });
  const grouped = groupLocalisationAuditCriteria(criteria);
  const hasCriteria = criteria.length > 0;
  const composition = composeLocalisationAuditScore(criteria, {
    coverageFactor,
    reportedScore: score,
  });
  const explainable = composition?.matchesReportedScore === true;
  const findingsUnderCriteria = new Set(criteria.flatMap((item) => item.findings.map((f) => f.id)));
  const otherFindings = allFindings.filter((finding) => !findingsUnderCriteria.has(finding.id));
  const fixFirst = composition
    ? rankCriteriaByGain(criteria, composition).slice(0, FIX_FIRST_LIMIT)
    : [];
  const fallbackFindings: LocalisationAuditFinding[] =
    fixFirst.length === 0
      ? allFindings
          .toSorted((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
          .slice(0, FIX_FIRST_LIMIT)
      : [];

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
  const scoredChecks = grouped.passed.length + grouped.watch.length + grouped.failed.length;
  const rerunWhen =
    !audit.rerunnable && audit.rerunAvailableAt
      ? formatRerunAvailableAt(audit.rerunAvailableAt, appLocale)
      : null;

  const sectionLinks = [
    { id: "fix-first", label: copy.fixFirstHeading },
    hasCriteria ? { id: "score-breakdown", label: copy.breakdownHeading } : null,
    hasCriteria ? { id: "criteria", label: copy.creditsHeading } : null,
    otherFindings.length > 0
      ? {
          id: "findings",
          label: hasCriteria ? copy.otherFindingsHeading : copy.fullFindingsHeading,
        }
      : null,
    { id: "locales", label: copy.localesHeading },
    isWorkspace ? null : { id: "next-step", label: copy.reauditHeading },
  ].filter((link): link is { id: string; label: string } => link != null);

  const scoringSteps = [
    { title: pageCopy.scoringStepMeasureTitle, body: pageCopy.scoringStepMeasureBody },
    {
      title: pageCopy.scoringStepWeightTitle,
      body: pageCopy.scoringStepWeightBody({
        max: describeLocalisationAuditScoringModel().maxWeight,
      }),
    },
    { title: pageCopy.scoringStepCoverageTitle, body: pageCopy.scoringStepCoverageBody },
  ];

  const sectionClassName = "scroll-mt-16 border-t border-border py-12 sm:py-16";

  return (
    <div className={cn(isWorkspace ? "px-0" : "px-5 sm:px-8 lg:px-10")}>
      <IsolatedReportSection section="hero" resetKeys={[audit.id, displayName, score]}>
        <header
          className={cn(
            "flex flex-col gap-6 sm:flex-row sm:items-start",
            isWorkspace ? "pb-8" : "pt-10 pb-8 sm:pt-14",
          )}
        >
          <CompanyMark profile={companyProfile} domainKey={audit.domainKey} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
              {copy.companyReportEyebrow}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <h1 className="font-serif text-3xl tracking-tight text-balance sm:text-4xl lg:text-5xl">
                {displayName}
              </h1>
              {companyProfile?.industry ? (
                <Badge variant="outline" className="capitalize">
                  {companyProfile.industry}
                </Badge>
              ) : null}
            </div>
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span>{audit.domainKey}</span>
              {freshnessLabel ? (
                <span>
                  {copy.freshnessLabel}: {freshnessLabel}
                </span>
              ) : null}
            </p>
            {companyProfile?.productSummary ? (
              <p className="mt-3 max-w-2xl text-pretty text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{copy.companyProductLabel}: </span>
                {companyProfile.productSummary}
              </p>
            ) : null}
          </div>
          {isWorkspace ? null : (
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={actions.onShare}>
                <ShareNetworkIcon className="size-3.5" aria-hidden />
                {copy.shareCopyLink}
              </Button>
              {audit.rerunnable ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={actions.onRerun}
                  disabled={actions.rerunPending}
                >
                  <ArrowClockwiseIcon className="size-3.5" aria-hidden />
                  {actions.rerunPending ? copy.rerunning : copy.rerun}
                </Button>
              ) : null}
            </div>
          )}
        </header>
        {actions.shareMessage ? (
          <p className="-mt-4 pb-4 text-sm text-muted-foreground" aria-live="polite">
            {actions.shareMessage}
          </p>
        ) : null}
        {actions.error ? <p className="pb-4 text-sm text-destructive">{actions.error}</p> : null}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <Card>
            <p className="text-sm font-medium">{copy.scoreLabel}</p>
            <div className="mt-4 flex flex-col items-center gap-5 sm:flex-row sm:items-center">
              <ScoreRing
                score={score}
                label={`${copy.scoreLabel}: ${score ?? "—"}${copy.scoreOutOf}`}
              />
              <div className="min-w-0 text-center sm:text-start">
                {ratingLabel ? (
                  <Badge
                    variant="outline"
                    className={cn("capitalize", auditToneBadgeClass(scoreTone(score)))}
                  >
                    {ratingLabel}
                  </Badge>
                ) : null}
                {interpretation ? (
                  <p className="mt-3 text-pretty text-base sm:text-lg">{interpretation}</p>
                ) : null}
              </div>
            </div>
            <ScoreBandScale score={score} label={copy.scoreBandsLabel} className="mt-6" />
            <div className="mt-4 space-y-1.5 text-sm text-muted-foreground">
              {coverageReductionPercent > 0 ? (
                <p className="text-pretty">
                  {copy.scoreCoverageAdjustment({ percent: coverageReductionPercent })}
                </p>
              ) : null}
              {score != null && methodologyVersion < LOCALISATION_AUDIT_METHODOLOGY_VERSION ? (
                <p className="text-pretty">{copy.scoreLegacyMethodology}</p>
              ) : null}
              <p className="text-pretty">
                {copy.sampledPages({ count: pagesCrawled })}{" "}
                <a
                  href={hasCriteria ? "#score-breakdown" : getLocalisationAuditGuideHref(locale)}
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                >
                  {copy.methodologyLink}
                </a>
              </p>
            </div>
          </Card>

          <Card>
            <p className="text-sm font-medium">{copy.dimensionsHeading}</p>
            <ul className="mt-5 space-y-5">
              {LOCALISATION_AUDIT_DIMENSIONS.map((dimension, index) => {
                const dimensionScore = dimensionScores?.[dimension] ?? null;
                const parts = composition?.dimensions.find((item) => item.dimension === dimension);
                const tone = scoreTone(dimensionScore);
                const share = parts ? Math.round(parts.weightShare * PERCENT) : null;
                const summary =
                  !parts || parts.scoredChecks === 0
                    ? dimensionScore == null
                      ? copy.dimensionNotMeasured
                      : null
                    : parts.failed === 0 && parts.watch === 0
                      ? copy.dimensionAllPassed
                      : [
                          parts.failed > 0 ? copy.dimensionToFix({ count: parts.failed }) : null,
                          parts.watch > 0 ? copy.dimensionToWatch({ count: parts.watch }) : null,
                        ]
                          .filter(Boolean)
                          .join(" · ");
                return (
                  <li key={dimension}>
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="min-w-0 text-sm font-medium">
                        {labels[dimension]}
                        {share != null && share > 0 ? (
                          <span className="ms-2 text-xs font-normal text-muted-foreground">
                            {copy.dimensionShare({ percent: share })}
                          </span>
                        ) : null}
                      </p>
                      <p
                        className={cn(
                          "text-lg font-semibold tabular-nums",
                          auditToneTextClass(tone),
                        )}
                      >
                        {dimensionScore == null ? "N/A" : <AnimatedNumber value={dimensionScore} />}
                      </p>
                    </div>
                    <MeterBar
                      value={dimensionScore ?? 0}
                      tone={tone}
                      delay={index * 0.1}
                      className="mt-2"
                    />
                    {summary ? (
                      <p className="mt-1.5 text-xs text-muted-foreground">{summary}</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {hasCriteria ? (
            <Stat label={copy.overviewChecksPassed}>
              {copy.overviewChecksValue({ passed: grouped.passed.length, total: scoredChecks })}
            </Stat>
          ) : null}
          {hasCriteria ? (
            <Stat label={copy.overviewToFix}>
              <span className={grouped.failed.length > 0 ? auditToneTextClass("risk") : undefined}>
                <AnimatedNumber value={grouped.failed.length} />
              </span>
            </Stat>
          ) : null}
          <Stat label={copy.overviewLanguages}>
            <AnimatedNumber value={detectedLocales.length} />
          </Stat>
          {standing && !isWorkspace ? (
            <Stat label={copy.overviewRank}>
              <Link href={leaderboardHref} className="underline-offset-4 hover:underline">
                {copy.overviewRankValue({ rank: standing.rank, total: standing.total })}
              </Link>
            </Stat>
          ) : (
            <Stat label={copy.overviewPages}>
              <AnimatedNumber value={pagesCrawled} />
            </Stat>
          )}
        </dl>
      </IsolatedReportSection>

      <div className="mt-10">
        <SectionNav links={sectionLinks} label={copy.reportNavLabel} isWorkspace={isWorkspace} />
      </div>

      <IsolatedReportSection section="fix-first" resetKeys={[audit.id, fixFirst.length]}>
        <section id="fix-first" className={cn(sectionClassName, "border-t-0")}>
          <SectionHeading
            title={copy.fixFirstHeading}
            subcopy={fixFirst.length > 0 ? copy.fixFirstSubcopy : undefined}
          />
          {fixFirst.length > 0 ? (
            <ol className="mt-8 grid gap-4 md:grid-cols-3">
              {fixFirst.map(({ criterion, gain }, index) => {
                const lead = criterion.findings[0];
                return (
                  <motion.li
                    key={criterion.id}
                    initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-40px" }}
                    transition={{ duration: 0.4, delay: reduceMotion ? 0 : index * 0.08 }}
                    className="flex flex-col rounded-2xl border border-border p-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-serif text-2xl leading-none text-muted-foreground tabular-nums">
                        {index + 1}
                      </span>
                      <div className="text-end">
                        <p
                          className={cn(
                            "font-serif text-3xl leading-none tracking-tight tabular-nums",
                            auditToneTextClass("safe"),
                          )}
                        >
                          {copy.fixFirstGain({ points: formatPoints(gain, locale) })}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {copy.fixFirstGainLabel}
                        </p>
                      </div>
                    </div>
                    <p className="mt-5 text-xs text-muted-foreground">
                      {labels[criterion.dimension]}
                    </p>
                    <p className="mt-1 font-medium text-pretty">{criterion.title}</p>
                    <p className="mt-2 flex-1 text-pretty text-sm text-muted-foreground">
                      {lead?.advice ?? lead?.summary ?? criterion.rubric}
                    </p>
                    <a
                      href={`#${checkAnchorId(criterion.id)}`}
                      className="mt-4 inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
                    >
                      {copy.fixFirstViewCheck}
                      <ArrowRightIcon className="size-3.5 rtl:rotate-180" aria-hidden />
                    </a>
                  </motion.li>
                );
              })}
            </ol>
          ) : fallbackFindings.length > 0 ? (
            <ol className="mt-8 space-y-4">
              {fallbackFindings.map((finding, index) => (
                <li key={finding.id} className="flex min-w-0 gap-4">
                  <span className="font-serif text-2xl leading-none text-muted-foreground tabular-nums">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className={cn(
                          "capitalize",
                          auditToneBadgeClass(severityTone(finding.severity)),
                        )}
                      >
                        {finding.severity}
                      </Badge>
                      <p className="font-medium text-pretty">{finding.title}</p>
                    </div>
                    <p className="mt-1 text-pretty text-muted-foreground">{finding.summary}</p>
                    <a
                      href={`#${findingAnchorId(finding)}`}
                      className="mt-1.5 inline-block text-sm font-medium underline-offset-4 hover:underline"
                    >
                      {copy.fixFirstSeeDetails}
                    </a>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-6 text-muted-foreground">{copy.noFindings}</p>
          )}
        </section>
      </IsolatedReportSection>

      {hasCriteria ? (
        <IsolatedReportSection section="breakdown" resetKeys={[audit.id, score]}>
          <section id="score-breakdown" className={sectionClassName}>
            <SectionHeading title={copy.breakdownHeading} subcopy={copy.breakdownSubcopy} />
            {composition && explainable ? (
              <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
                <Card>
                  <LocalisationAuditScoreBreakdown
                    composition={composition}
                    dimensionScores={dimensionScores}
                    copy={copy}
                    locale={locale}
                  />
                </Card>
                <div className="space-y-4">
                  <ol className="space-y-3">
                    {scoringSteps.map((step, index) => (
                      <li key={step.title} className="flex gap-3">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-medium text-background tabular-nums">
                          {index + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{step.title}</p>
                          <p className="mt-0.5 text-pretty text-sm text-muted-foreground">
                            {step.body}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                  <Link
                    href={getLocalisationAuditGuideHref(locale)}
                    className="inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
                  >
                    {copy.methodologyLink}
                    <ArrowSquareOutIcon className="size-3.5" aria-hidden />
                  </Link>
                </div>
              </div>
            ) : (
              <p className="mt-6 max-w-2xl rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground">
                {copy.breakdownMismatch}
              </p>
            )}
            <p className="mt-10 text-sm font-medium">{pageCopy.thresholdsHeading}</p>
            <LocalisationAuditThresholdLegend copy={pageCopy} className="mt-4" />
          </section>
        </IsolatedReportSection>
      ) : null}

      {hasCriteria ? (
        <IsolatedReportSection section="criteria" resetKeys={[audit.id, credits.length]}>
          <section id="criteria" className={sectionClassName}>
            <SectionHeading title={copy.creditsHeading} />
            <LocalisationAuditChecks
              criteria={criteria}
              gainByCriterion={explainable ? composition?.gainByCriterion : undefined}
              copy={copy}
              locale={locale}
              domainKey={audit.domainKey}
            />
          </section>
        </IsolatedReportSection>
      ) : null}

      {otherFindings.length > 0 ? (
        <IsolatedReportSection section="findings" resetKeys={[audit.id, otherFindings.length]}>
          <section id="findings" className={sectionClassName}>
            <SectionHeading
              title={hasCriteria ? copy.otherFindingsHeading : copy.fullFindingsHeading}
              subcopy={hasCriteria ? copy.otherFindingsBody : undefined}
            />
            <div className="mt-8">
              <FindingList findings={otherFindings} copy={copy} domainKey={audit.domainKey} />
            </div>
          </section>
        </IsolatedReportSection>
      ) : null}

      <IsolatedReportSection section="locales" resetKeys={[audit.id, detectedLocales.length]}>
        <section id="locales" className={sectionClassName}>
          <SectionHeading title={copy.localesHeading} />
          {detectedLocales.length === 0 ? (
            <TypographyP className="mt-4" tone="subtle">
              {copy.localesEmpty}
            </TypographyP>
          ) : (
            <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {detectedLocales.map(({ locale: detected, sources }) => {
                const name = localeDisplayName(detected, appLocale);
                return (
                  <li key={detected} className="rounded-xl border border-border p-4">
                    <p className="font-medium">{name ?? detected}</p>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">{detected}</p>
                    <ul className="mt-3 flex flex-wrap gap-1.5">
                      {sources.map((source) => (
                        <li
                          key={source}
                          className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                        >
                          {localeSourceLabels[source]}
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
          )}

          {report?.linguisticNotes && report.linguisticNotes.length > 0 ? (
            <div className="mt-12">
              <h3 className="font-medium">{copy.linguisticHeading}</h3>
              <ul className="mt-4 grid gap-4 md:grid-cols-2">
                {report.linguisticNotes.map((note) => (
                  <li key={note.locale} className="rounded-xl border border-border p-5">
                    <p className="font-mono text-sm font-medium">{note.locale}</p>
                    <p className="mt-2 text-pretty text-sm text-muted-foreground">{note.summary}</p>
                    <ul className="mt-4 space-y-3 text-sm">
                      {note.samples.map((sample) => (
                        <li
                          key={`${note.locale}-${sample.text}`}
                          className="border-s-2 border-border ps-3"
                        >
                          <p className="italic">“{sample.text}”</p>
                          <p className="mt-1 text-muted-foreground">{sample.note}</p>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {sampledPages.length > 0 ? (
            <SampledPages pages={sampledPages} copy={copy} domainKey={audit.domainKey} />
          ) : null}
        </section>
      </IsolatedReportSection>

      {isWorkspace ? null : (
        <IsolatedReportSection
          section="cta"
          resetKeys={[audit.rerunnable, audit.rerunAvailableAt, showSignInCtas]}
        >
          <section id="next-step" className={cn(sectionClassName, "pb-20")}>
            <div className="grid gap-8 rounded-3xl bg-muted/40 p-6 sm:p-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
              <div>
                <SectionHeading title={copy.reauditHeading} subcopy={ctaBody} />
                <div className="mt-6 flex flex-wrap gap-3">
                  {showSignInCtas ? (
                    <Link
                      href={
                        audit.claimed
                          ? claimDomainHref
                          : `/auth/sign-in?returnTo=${encodeURIComponent(claimDomainHref)}`
                      }
                      onClick={() =>
                        actions.onTrackCta(audit.claimed ? "open_claimed_domain" : "claim_domain")
                      }
                      className={buttonVariants({ size: "lg" })}
                    >
                      {audit.claimed ? copy.openInWorkspace : copy.claimDomain}
                    </Link>
                  ) : null}
                  <a
                    href={demoHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => actions.onTrackCta("book_review")}
                    className={buttonVariants({
                      size: "lg",
                      variant: showSignInCtas ? "outline" : "default",
                    })}
                  >
                    {copy.bookReview}
                  </a>
                </div>
                {rerunWhen ? (
                  <p className="mt-4 text-sm text-muted-foreground">
                    {copy.rerunCooldown({ when: rerunWhen })}
                  </p>
                ) : null}
              </div>
              <div className="rounded-2xl border border-border bg-background p-5">
                <p className="font-medium">{copy.emailSummaryHeading}</p>
                <TypographyP className="mt-1 text-sm" tone="subtle">
                  {copy.unlockBody}
                </TypographyP>
                <div className="mt-4">{actions.emailForm}</div>
              </div>
            </div>
          </section>
        </IsolatedReportSection>
      )}
    </div>
  );
}

function SampledPages({
  pages,
  copy,
  domainKey,
}: {
  pages: LocalisationAuditReport["pages"];
  copy: LocalisationAuditResultCopy;
  domainKey: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="pages" className="scroll-mt-16 font-medium">
          {copy.pagesHeading}
        </h3>
        <CollapsibleTrigger className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          {open ? copy.pagesCollapse : copy.pagesExpand({ count: pages.length })}
          <CaretDownIcon className={cn("size-4 transition-transform", open && "rotate-180")} />
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <ul className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border text-sm">
          {pages.map((page) => {
            const href = sanitizeLocalisationAuditFindingUrl(page.url, domainKey);
            const path = pagePathLabel(page.url);
            return (
              <li
                key={page.url}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3"
              >
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
                  <span className="font-mono text-xs text-muted-foreground">{page.htmlLang}</span>
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
