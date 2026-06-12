"use client";

import type { ReactNode } from "react";
import { BulbIcon, CheckmarkCircle02Icon, InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { MarkdownContent } from "@/components/markdown-description-editor";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";

import type { CatGlossaryTerm, CatSegmentIntelligence, CatTranslationMemoryMatch } from "./types";

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

function TranslationMemoryRow({ match }: { match: CatTranslationMemoryMatch }) {
  return (
    <li className="space-y-2 px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full border border-dew-500/25 bg-dew-500/10 px-2 py-0.5 text-[11px] font-medium text-dew-100">
          {match.matchPercent}% match
        </span>
        {match.contextLabel ? (
          <span className="min-w-0 truncate text-xs text-muted-foreground">
            {match.contextLabel}
          </span>
        ) : null}
      </div>
      <div className="space-y-1">
        <p className="text-pretty text-xs leading-relaxed text-muted-foreground">
          {match.sourceText}
        </p>
        <p className="text-pretty text-sm leading-relaxed text-foreground/88">{match.targetText}</p>
      </div>
    </li>
  );
}

export function CatIntelligencePanel({
  intelligence,
  isLookingUpContext = false,
}: {
  intelligence: CatSegmentIntelligence;
  isLookingUpContext?: boolean;
}) {
  const contextChips = [
    intelligence.locationBreadcrumb,
    intelligence.componentName,
    intelligence.filePath,
  ].filter(Boolean);
  const productMeaning =
    intelligence.productMeaning ?? intelligence.intent ?? "No product context provided.";
  const showIntent =
    Boolean(intelligence.productMeaning && intelligence.intent) && !isLookingUpContext;

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
                {isLookingUpContext ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Spinner className="size-4" />
                    <span>Looking up repository context…</span>
                  </div>
                ) : (
                  <>
                    <MarkdownContent
                      value={productMeaning}
                      contentClassName="min-h-0 px-0 py-0 text-sm leading-relaxed text-foreground/88"
                      ariaLabel="Product context"
                    />
                    {showIntent ? (
                      <MarkdownContent
                        value={intelligence.intent ?? ""}
                        className="mt-2"
                        contentClassName="min-h-0 px-0 py-0 text-xs leading-relaxed text-muted-foreground"
                        ariaLabel="Translation intent"
                      />
                    ) : null}
                  </>
                )}
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

          {intelligence.translationMemoryMatches &&
          intelligence.translationMemoryMatches.length > 0 ? (
            <PanelSection title="Translation memory">
              <div className="overflow-hidden rounded-2xl bg-foreground/3">
                <ul className="divide-y divide-foreground/8">
                  {intelligence.translationMemoryMatches.map((match) => (
                    <TranslationMemoryRow key={match.id} match={match} />
                  ))}
                </ul>
              </div>
            </PanelSection>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
}
