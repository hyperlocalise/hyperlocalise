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
import { CaretDownIcon, CheckIcon, SparkleIcon, WarningIcon, XIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { TypographyP } from "@/components/ui/typography";
import {
  groupLocalisationAuditCriteria,
  type LocalisationAuditCriterion,
} from "@/lib/localisation-audit/criteria";
import { sanitizeLocalisationAuditFindingUrl } from "@/lib/localisation-audit/finding-url";
import { severityTone } from "@/lib/localisation-audit/score-tone";
import type {
  LocalisationAuditDimension,
  LocalisationAuditFinding,
} from "@/lib/localisation-audit/types";
import { LOCALISATION_AUDIT_DIMENSIONS } from "@/lib/localisation-audit/score-composition";
import { cn } from "@/lib/primitives/cn";

import type { LocalisationAuditResultCopy } from "./localisation-audit-page-content";
import {
  auditToneBadgeClass,
  auditToneTextClass,
  CRITERION_STATUS_TONE,
} from "./localisation-audit-tone";

const EVIDENCE_PREVIEW_CHARS = 280;
/** Gains below this read as noise and are not labelled. */
const MIN_LABELLED_POINTS = 0.05;
const CHECK_ANCHOR_PREFIX = "check-";

export function checkAnchorId(criterionId: string) {
  return `${CHECK_ANCHOR_PREFIX}${criterionId}`;
}

export function findingAnchorId(finding: LocalisationAuditFinding) {
  return `finding-${finding.id}`;
}

export function formatPoints(value: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}

export function dimensionLabels(copy: LocalisationAuditResultCopy) {
  return {
    technical: copy.dimensionTechnical,
    linguistic: copy.dimensionLinguistic,
    contextual: copy.dimensionContextual,
    visual: copy.dimensionVisual,
  } as const satisfies Record<LocalisationAuditDimension, string>;
}

export function CriterionStatusIcon({ status }: { status: LocalisationAuditCriterion["status"] }) {
  const tone = CRITERION_STATUS_TONE[status];
  const Icon =
    status === "pass"
      ? CheckIcon
      : status === "fail"
        ? XIcon
        : status === "watch"
          ? WarningIcon
          : null;
  return (
    <span
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-full",
        Icon ? auditToneBadgeClass(tone) : "border border-border text-xs text-muted-foreground",
      )}
      aria-hidden
    >
      {Icon ? <Icon className="size-3.5" weight="bold" /> : "—"}
    </span>
  );
}

function FindingEvidence({
  evidence,
  copy,
}: {
  evidence: string;
  copy: LocalisationAuditResultCopy;
}) {
  const [expanded, setExpanded] = useState(false);
  const clipped = evidence.length > EVIDENCE_PREVIEW_CHARS && !expanded;

  return (
    <>
      <p className="min-w-0 rounded-md bg-muted/50 p-3 font-mono text-xs wrap-break-word whitespace-pre-wrap text-muted-foreground">
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

function FindingDetail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-1 min-w-0">{children}</div>
    </div>
  );
}

export function FindingList({
  findings,
  copy,
  domainKey,
}: {
  findings: LocalisationAuditFinding[];
  copy: LocalisationAuditResultCopy;
  domainKey: string;
}) {
  if (findings.length === 0) {
    return <p className="text-sm text-muted-foreground">{copy.checkNoFindings}</p>;
  }

  return (
    <ul className="min-w-0 space-y-3">
      {findings.map((finding) => {
        const findingHref = sanitizeLocalisationAuditFindingUrl(finding.url, domainKey);
        return (
          <li
            key={finding.id}
            id={findingAnchorId(finding)}
            className="min-w-0 scroll-mt-24 rounded-xl border border-border bg-background p-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className={cn("capitalize", auditToneBadgeClass(severityTone(finding.severity)))}
              >
                {finding.severity}
              </Badge>
              {finding.confidence != null ? (
                <span className="text-xs text-muted-foreground">
                  {copy.findingConfidence({ confidence: finding.confidence })}
                </span>
              ) : null}
            </div>
            <p className="mt-2 font-medium text-pretty">{finding.title}</p>
            <p className="mt-1 text-pretty text-sm text-muted-foreground">{finding.summary}</p>
            <div className="mt-3 grid gap-3">
              {finding.advice ? (
                <FindingDetail label={copy.findingAdviceLabel}>
                  <p className="text-pretty text-sm wrap-break-word">{finding.advice}</p>
                </FindingDetail>
              ) : null}
              {finding.where || findingHref ? (
                <FindingDetail label={copy.findingWhereLabel}>
                  {finding.where ? (
                    <p className="text-sm wrap-break-word">{finding.where}</p>
                  ) : null}
                  {findingHref ? (
                    <a
                      href={findingHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-0.5 block break-all text-sm text-muted-foreground underline underline-offset-2"
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
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function CheckRow({
  criterion,
  cost,
  open,
  onToggle,
  copy,
  locale,
  domainKey,
  dimensionLabel,
}: {
  criterion: LocalisationAuditCriterion;
  cost: number | undefined;
  open: boolean;
  onToggle: () => void;
  copy: LocalisationAuditResultCopy;
  locale: string;
  domainKey: string;
  dimensionLabel: string;
}) {
  const reduceMotion = useReducedMotion();
  const tone = CRITERION_STATUS_TONE[criterion.status];
  const panelId = `${checkAnchorId(criterion.id)}-panel`;
  const statusLabel = {
    pass: copy.criteriaPassLabel,
    watch: copy.criteriaWatchLabel,
    fail: copy.criteriaFailLabel,
    na: copy.criteriaNaLabel,
  }[criterion.status];

  return (
    <li id={checkAnchorId(criterion.id)} className="scroll-mt-24">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-start transition-colors hover:bg-muted/40"
      >
        <CriterionStatusIcon status={criterion.status} />
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-pretty">{criterion.title}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span>{dimensionLabel}</span>
            <span className="sr-only">{statusLabel}</span>
            {criterion.scored ? null : (
              <span className="inline-flex items-center gap-1">
                <SparkleIcon className="size-3" aria-hidden />
                {copy.checkAiBadge}
              </span>
            )}
          </span>
        </span>
        {cost != null && cost >= MIN_LABELLED_POINTS ? (
          <span
            className={cn("shrink-0 text-sm font-medium tabular-nums", auditToneTextClass(tone))}
          >
            {copy.checkCost({ points: formatPoints(cost, locale) })}
          </span>
        ) : null}
        {criterion.status !== "na" && criterion.score != null ? (
          <span
            className={cn(
              "w-10 shrink-0 rounded-md border px-1.5 py-0.5 text-center text-sm font-semibold tabular-nums",
              auditToneBadgeClass(tone),
            )}
          >
            {criterion.score}
          </span>
        ) : null}
        <CaretDownIcon
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            id={panelId}
            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.25, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="space-y-4 px-4 pb-5 sm:ps-13">
              <div>
                <p className="text-xs font-medium text-muted-foreground">{copy.checkRubricLabel}</p>
                <p className="mt-1 text-pretty text-sm">{criterion.rubric}</p>
              </div>
              <FindingList findings={criterion.findings} copy={copy} domainKey={domainKey} />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </li>
  );
}

function CheckGroup({
  heading,
  description,
  criteria,
  defaultOpen,
  collapsible,
  expandLabel,
  collapseLabel,
  renderRow,
}: {
  heading: string;
  description?: string;
  criteria: LocalisationAuditCriterion[];
  defaultOpen: boolean;
  collapsible: boolean;
  expandLabel?: string;
  collapseLabel?: string;
  renderRow: (criterion: LocalisationAuditCriterion) => React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (criteria.length === 0) return null;

  const list = (
    <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border">
      {criteria.map(renderRow)}
    </ul>
  );

  if (!collapsible) {
    return (
      <div className="mt-8 first:mt-0">
        <h3 className="font-medium">{heading}</h3>
        {description ? (
          <TypographyP className="mt-1 max-w-2xl text-sm" tone="subtle">
            {description}
          </TypographyP>
        ) : null}
        {list}
      </div>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-8 first:mt-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-medium">{heading}</h3>
        <CollapsibleTrigger className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          {open ? collapseLabel : expandLabel}
          <CaretDownIcon className={cn("size-4 transition-transform", open && "rotate-180")} />
        </CollapsibleTrigger>
      </div>
      {description ? (
        <TypographyP className="mt-1 max-w-2xl text-sm" tone="subtle">
          {description}
        </TypographyP>
      ) : null}
      <CollapsibleContent>{list}</CollapsibleContent>
    </Collapsible>
  );
}

type DimensionFilter = LocalisationAuditDimension | "all";

export function LocalisationAuditChecks({
  criteria,
  gainByCriterion,
  copy,
  locale,
  domainKey,
}: {
  criteria: LocalisationAuditCriterion[];
  gainByCriterion: ReadonlyMap<string, number> | undefined;
  copy: LocalisationAuditResultCopy;
  locale: string;
  domainKey: string;
}) {
  const [filter, setFilter] = useState<DimensionFilter>("all");
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(() => new Set());
  const labels = dimensionLabels(copy);

  // Fix-first cards and shared links point at #check-<id>; open that row.
  useEffect(() => {
    function openFromHash() {
      const hash = window.location.hash.slice(1);
      if (!hash.startsWith(CHECK_ANCHOR_PREFIX)) return;
      const id = hash.slice(CHECK_ANCHOR_PREFIX.length);
      if (!criteria.some((criterion) => criterion.id === id)) return;
      setFilter("all");
      setOpenIds((current) => new Set(current).add(id));
      window.requestAnimationFrame(() => {
        document.getElementById(hash)?.scrollIntoView({ block: "start" });
      });
    }
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, [criteria]);

  const visible =
    filter === "all" ? criteria : criteria.filter((item) => item.dimension === filter);
  const grouped = groupLocalisationAuditCriteria(visible);
  const byCost = (items: LocalisationAuditCriterion[]) =>
    items.toSorted((a, b) => (gainByCriterion?.get(b.id) ?? 0) - (gainByCriterion?.get(a.id) ?? 0));
  const allGrouped = groupLocalisationAuditCriteria(criteria);

  const renderRow = (criterion: LocalisationAuditCriterion) => (
    <CheckRow
      key={criterion.id}
      criterion={criterion}
      cost={gainByCriterion?.get(criterion.id)}
      open={openIds.has(criterion.id)}
      onToggle={() =>
        setOpenIds((current) => {
          const next = new Set(current);
          if (next.has(criterion.id)) next.delete(criterion.id);
          else next.add(criterion.id);
          return next;
        })
      }
      copy={copy}
      locale={locale}
      domainKey={domainKey}
      dimensionLabel={labels[criterion.dimension]}
    />
  );

  const filters: DimensionFilter[] = [
    "all",
    ...LOCALISATION_AUDIT_DIMENSIONS.filter((dimension) =>
      criteria.some((criterion) => criterion.dimension === dimension),
    ),
  ];

  return (
    <div>
      <TypographyP className="mt-2 max-w-2xl" tone="subtle">
        {copy.criteriaSummary({
          passed: allGrouped.passed.length,
          watch: allGrouped.watch.length,
          failed: allGrouped.failed.length,
          na: allGrouped.notApplicable.length,
        })}
      </TypographyP>

      <div
        role="group"
        aria-label={copy.checksFilterLabel}
        className="mt-6 flex gap-1.5 overflow-x-auto pb-1"
      >
        {filters.map((value) => {
          const active = value === filter;
          const count =
            value === "all"
              ? criteria.length
              : criteria.filter((criterion) => criterion.dimension === value).length;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(value)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
                active
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {value === "all" ? copy.checksFilterAll : labels[value]}
              <span className={cn("tabular-nums", active ? "opacity-70" : "opacity-60")}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-8" key={filter}>
        <CheckGroup
          heading={copy.criteriaNeedsAttentionHeading({ count: grouped.failed.length })}
          criteria={byCost(grouped.failed)}
          defaultOpen
          collapsible={false}
          renderRow={renderRow}
        />
        <CheckGroup
          heading={copy.criteriaWatchHeading({ count: grouped.watch.length })}
          criteria={byCost(grouped.watch)}
          defaultOpen
          collapsible={false}
          renderRow={renderRow}
        />
        <CheckGroup
          heading={copy.criteriaPassedHeading({ count: grouped.passed.length })}
          criteria={grouped.passed}
          defaultOpen={grouped.failed.length === 0 && grouped.watch.length === 0}
          collapsible
          expandLabel={copy.criteriaExpandPassed}
          collapseLabel={copy.criteriaCollapsePassed}
          renderRow={renderRow}
        />
        <CheckGroup
          heading={copy.criteriaAiAssessedHeading({ count: grouped.aiAssessed.length })}
          description={copy.criteriaAiAssessedBody}
          criteria={grouped.aiAssessed}
          defaultOpen={false}
          collapsible
          expandLabel={copy.criteriaExpandAiAssessed}
          collapseLabel={copy.criteriaCollapseAiAssessed}
          renderRow={renderRow}
        />
        <CheckGroup
          heading={copy.criteriaNotApplicableHeading({ count: grouped.notApplicable.length })}
          criteria={grouped.notApplicable}
          defaultOpen={false}
          collapsible
          expandLabel={copy.criteriaExpandNa}
          collapseLabel={copy.criteriaCollapseNa}
          renderRow={renderRow}
        />
      </div>
    </div>
  );
}
