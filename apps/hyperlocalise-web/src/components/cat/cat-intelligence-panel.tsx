"use client";

import type { ReactNode } from "react";
import { BulbIcon, CheckmarkCircle02Icon, InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/primitives/cn";

import { catToneClass, riskLevelTone, segmentStatusLabel, segmentStatusTone } from "./cat-tone";
import type {
  CatGlossaryTerm,
  CatQaRisk,
  CatRiskLevel,
  CatSegmentIntelligence,
  CatSegmentStatus,
} from "./types";

function PanelSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function ContextChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex min-w-0 max-w-full items-center rounded-md border border-foreground/8 bg-background px-2 py-1 font-mono text-[11px] text-foreground/68">
      <span className="truncate">{children}</span>
    </span>
  );
}

function ToneBadge({
  tone,
  children,
}: {
  tone: ReturnType<typeof riskLevelTone>;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        catToneClass(tone),
      )}
    >
      {children}
    </span>
  );
}

function InsightCard({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-foreground/3 p-3.5">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <span className="flex size-6 items-center justify-center rounded-full bg-background text-foreground/70">
          {icon}
        </span>
        {label}
      </div>
      {children}
    </div>
  );
}

function riskLevelLabel(level: CatRiskLevel) {
  switch (level) {
    case "good":
      return "Good";
    case "low":
      return "Low";
    case "medium":
      return "Medium";
    case "high":
      return "High";
    default:
      return level;
  }
}

function GlossaryTermRow({ term }: { term: CatGlossaryTerm }) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-3 py-2.5">
      <span className="min-w-0 truncate text-sm text-foreground/86">{term.source}</span>
      <span className="text-xs text-muted-foreground">→</span>
      <span className="inline-flex min-w-0 items-center justify-end gap-1.5 text-right text-sm font-medium text-foreground/92">
        <span className="truncate">{term.target}</span>
        {term.approved ? (
          <HugeiconsIcon
            icon={CheckmarkCircle02Icon}
            className="size-3.5 shrink-0 text-grove-300"
            aria-label="Approved"
          />
        ) : null}
      </span>
    </li>
  );
}

function QaRiskRow({ risk }: { risk: CatQaRisk }) {
  return (
    <li className="flex items-center justify-between gap-3 px-3 py-2.5">
      <span className="min-w-0 text-sm text-foreground/86">{risk.label}</span>
      <ToneBadge tone={riskLevelTone(risk.level)}>{riskLevelLabel(risk.level)}</ToneBadge>
    </li>
  );
}

export function CatIntelligencePanel({
  intelligence,
  segmentStatus,
}: {
  intelligence: CatSegmentIntelligence;
  segmentStatus: CatSegmentStatus;
}) {
  const contextChips = [
    intelligence.locationBreadcrumb,
    intelligence.componentName,
    intelligence.filePath,
  ].filter(Boolean);
  const hasReviewSignal =
    Boolean(intelligence.reviewReason) ||
    Boolean(intelligence.reviewRisk) ||
    Boolean(intelligence.reviewerPreference) ||
    Boolean(intelligence.constraints) ||
    typeof intelligence.relatedStringCount === "number";

  return (
    <div className="flex h-full min-h-0 flex-col border-l border-foreground/8 bg-background">
      <div className="border-b border-foreground/8 px-4 py-3">
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={BulbIcon} className="size-4 text-bud-300" />
          <h2 className="text-sm font-semibold text-foreground">Translation Intelligence</h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Context and terminology for this string.
        </p>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-5 p-4">
          <PanelSection title="Decision context">
            <div className="space-y-3">
              <InsightCard
                label="Meaning in product"
                icon={<HugeiconsIcon icon={InformationCircleIcon} className="size-3.5" />}
              >
                <p className="text-pretty text-sm leading-relaxed text-foreground/88">
                  {intelligence.productMeaning ??
                    intelligence.intent ??
                    "No product context provided."}
                </p>
                {intelligence.productMeaning && intelligence.intent ? (
                  <p className="mt-2 text-pretty text-xs leading-relaxed text-muted-foreground">
                    {intelligence.intent}
                  </p>
                ) : null}
              </InsightCard>

              {contextChips.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {intelligence.locationBreadcrumb ? (
                    <ContextChip>{intelligence.locationBreadcrumb}</ContextChip>
                  ) : null}
                  {intelligence.componentName ? (
                    <ContextChip>{intelligence.componentName}</ContextChip>
                  ) : null}
                  {intelligence.filePath ? (
                    <ContextChip>{intelligence.filePath}</ContextChip>
                  ) : null}
                </div>
              ) : null}
            </div>
          </PanelSection>

          <PanelSection title="Review signal">
            <div className="space-y-3">
              <InsightCard
                label="Current status"
                icon={<HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-3.5" />}
              >
                <ToneBadge tone={segmentStatusTone(segmentStatus)}>
                  {segmentStatusLabel(segmentStatus)}
                </ToneBadge>
              </InsightCard>

              {hasReviewSignal ? (
                <div className="space-y-2 rounded-2xl bg-foreground/3 p-3.5">
                  {intelligence.reviewRisk ? (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-medium text-muted-foreground">Risk level</span>
                      <ToneBadge tone={riskLevelTone(intelligence.reviewRisk)}>
                        {riskLevelLabel(intelligence.reviewRisk)}
                      </ToneBadge>
                    </div>
                  ) : null}
                  {intelligence.reviewReason ? (
                    <p className="text-pretty text-sm leading-relaxed text-foreground/88">
                      {intelligence.reviewReason}
                    </p>
                  ) : null}
                  {intelligence.reviewerPreference ? (
                    <p className="text-pretty text-xs leading-relaxed text-muted-foreground">
                      <span className="font-medium text-foreground/70">Preference:</span>{" "}
                      {intelligence.reviewerPreference}
                    </p>
                  ) : null}
                  {intelligence.constraints ? (
                    <p className="text-pretty text-xs leading-relaxed text-muted-foreground">
                      <span className="font-medium text-foreground/70">Constraints:</span>{" "}
                      {intelligence.constraints}
                    </p>
                  ) : null}
                  {typeof intelligence.relatedStringCount === "number" ? (
                    <p className="text-xs text-muted-foreground">
                      {intelligence.relatedStringCount} related strings available.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </PanelSection>

          {intelligence.qaRisks.length > 0 ? (
            <PanelSection title="QA risks">
              <div className="overflow-hidden rounded-2xl bg-foreground/3">
                <ul className="divide-y divide-foreground/8">
                  {intelligence.qaRisks.map((risk) => (
                    <QaRiskRow key={risk.id} risk={risk} />
                  ))}
                </ul>
              </div>
            </PanelSection>
          ) : null}

          {intelligence.glossaryTerms.length > 0 ? (
            <PanelSection title="Glossary guidance">
              <div className="overflow-hidden rounded-2xl bg-foreground/3">
                <ul className="divide-y divide-foreground/8">
                  {intelligence.glossaryTerms.map((term) => (
                    <GlossaryTermRow key={term.id} term={term} />
                  ))}
                </ul>
              </div>
            </PanelSection>
          ) : null}

          {intelligence.githubEvidence && intelligence.githubEvidence.length > 0 ? (
            <PanelSection title="GitHub evidence">
              <div className="space-y-2">
                {intelligence.githubEvidence.map((evidence) => (
                  <a
                    key={evidence.href}
                    href={evidence.href}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-2xl border border-foreground/8 bg-foreground/3 px-3.5 py-3 text-sm text-foreground/88 transition-colors hover:bg-foreground/5"
                  >
                    {evidence.label}
                  </a>
                ))}
              </div>
            </PanelSection>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
}
