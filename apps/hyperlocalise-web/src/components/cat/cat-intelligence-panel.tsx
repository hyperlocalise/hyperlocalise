"use client";

import type { ReactNode } from "react";
import { BulbIcon, CheckmarkCircle02Icon, InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { MarkdownContent } from "@/components/markdown-description-editor";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

import type { CatGlossaryTerm, CatSegmentIntelligence, CatTranslationMemoryMatch } from "./types";

function PanelSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      {children}
    </section>
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

function AgentContextSkeleton() {
  return (
    <div className="space-y-3 rounded-2xl bg-foreground/3 p-3.5">
      <div className="space-y-2">
        <Skeleton className="h-3 w-28 rounded-full bg-foreground/8" />
        <Skeleton className="h-4 w-full rounded-full bg-foreground/8" />
        <Skeleton className="h-4 w-10/12 rounded-full bg-foreground/8" />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Skeleton className="h-5 w-28 rounded-lg bg-foreground/8" />
        <Skeleton className="h-5 w-20 rounded-lg bg-foreground/8" />
        <Skeleton className="h-5 w-36 rounded-lg bg-foreground/8" />
      </div>
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
  showAgentContext = false,
}: {
  intelligence: CatSegmentIntelligence;
  isLookingUpContext?: boolean;
  showAgentContext?: boolean;
}) {
  const hasFileContext = Boolean(intelligence.productMeaning?.trim());
  const agentBadges = [
    intelligence.locationBreadcrumb,
    intelligence.componentName,
    intelligence.filePath,
  ].filter(Boolean);
  const hasAgentInsight = Boolean(intelligence.agentContext?.trim());
  const hasAgentContext = hasAgentInsight || agentBadges.length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background lg:border-l lg:border-foreground/8">
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
          <PanelSection title="Context attached in the file">
            {hasFileContext ? (
              <MarkdownContent
                value={intelligence.productMeaning ?? ""}
                contentClassName="px-0 py-0 text-sm leading-relaxed text-foreground/88"
                ariaLabel="File context"
              />
            ) : (
              <p className="text-sm leading-relaxed text-muted-foreground">
                No context is attached to this string in the source file.
              </p>
            )}
          </PanelSection>

          {showAgentContext ? (
            <PanelSection title="Context found by agent">
              {isLookingUpContext ? (
                <AgentContextSkeleton />
              ) : hasAgentContext ? (
                <div className="space-y-3">
                  {hasAgentInsight ? (
                    <InsightCard
                      label="Meaning in product"
                      icon={<HugeiconsIcon icon={InformationCircleIcon} className="size-3.5" />}
                    >
                      <div className="min-h-[1.25rem] space-y-2">
                        <MarkdownContent
                          value={intelligence.agentContext ?? ""}
                          contentClassName="min-h-[1.25rem] px-0 py-0 text-sm leading-relaxed text-foreground/88"
                          ariaLabel="Agent context"
                        />
                        {intelligence.intent ? (
                          <MarkdownContent
                            value={intelligence.intent}
                            contentClassName="min-h-[1rem] px-0 py-0 text-xs leading-relaxed text-muted-foreground"
                            ariaLabel="Translation intent"
                          />
                        ) : null}
                      </div>
                    </InsightCard>
                  ) : null}
                  {agentBadges.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {intelligence.locationBreadcrumb ? (
                        <Badge variant="outline" className="max-w-full font-normal">
                          <span className="truncate">{intelligence.locationBreadcrumb}</span>
                        </Badge>
                      ) : null}
                      {intelligence.componentName ? (
                        <Badge variant="outline" className="max-w-full font-normal">
                          <span className="truncate">{intelligence.componentName}</span>
                        </Badge>
                      ) : null}
                      {intelligence.filePath ? (
                        <Badge variant="outline" className="max-w-full font-mono font-normal">
                          <span className="truncate">{intelligence.filePath}</span>
                        </Badge>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  No repository context was found for this string.
                </p>
              )}
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
