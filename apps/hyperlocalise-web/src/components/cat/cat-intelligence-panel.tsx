"use client";

import { useState, type ReactNode } from "react";
import { BulbIcon, CheckmarkCircle02Icon, InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { MarkdownContent } from "@/components/markdown-description-editor/markdown-description-editor";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/primitives/cn";

import { catIntelligencePanelMessages } from "./cat.messages";
import { requiresLowMatchConfirmation } from "./tm-match-quality";
import type {
  CatGlossaryTerm,
  CatSegmentIntelligence,
  CatTmMatchKind,
  CatTranslationMemoryMatch,
} from "./types";

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

function ConcordanceSkeleton() {
  return (
    <div className="space-y-3 rounded-2xl bg-foreground/3 p-3.5">
      <Skeleton className="h-4 w-32 rounded-full bg-foreground/8" />
      <Skeleton className="h-4 w-full rounded-full bg-foreground/8" />
      <Skeleton className="h-4 w-10/12 rounded-full bg-foreground/8" />
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
  const intl = useIntl();

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
            aria-label={intl.formatMessage(catIntelligencePanelMessages.approvedAria)}
          />
        ) : null}
      </span>
    </li>
  );
}

function tmMatchBadgeTone(matchKind: CatTmMatchKind | undefined) {
  switch (matchKind) {
    case "exact":
    case "context":
      return "border-grove-300/25 bg-grove-300/10 text-grove-300";
    default:
      return "border-bud-500/25 bg-bud-500/10 text-bud-300";
  }
}

function tmMatchBadgeLabel(match: CatTranslationMemoryMatch, intl: ReturnType<typeof useIntl>) {
  switch (match.matchKind) {
    case "exact":
      return intl.formatMessage(catIntelligencePanelMessages.matchKindExact);
    case "context":
      return intl.formatMessage(catIntelligencePanelMessages.matchKindContext);
    case "fuzzy":
      return intl.formatMessage(catIntelligencePanelMessages.matchKindFuzzy);
    default:
      return intl.formatMessage(catIntelligencePanelMessages.matchPercent, {
        matchPercent: match.matchPercent,
      });
  }
}

function TranslationMemoryRow({
  match,
  onUse,
}: {
  match: CatTranslationMemoryMatch;
  onUse?: (match: CatTranslationMemoryMatch) => void;
}) {
  const intl = useIntl();

  return (
    <li className="space-y-2 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-[11px] font-medium tabular-nums",
              tmMatchBadgeTone(match.matchKind),
            )}
          >
            {tmMatchBadgeLabel(match, intl)}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {match.contextLabel ? (
            <span className="max-w-28 truncate text-xs text-muted-foreground">
              {match.contextLabel}
            </span>
          ) : null}
          {onUse ? (
            <Button variant="ghost" size="sm" onClick={() => onUse(match)}>
              <FormattedMessage {...catIntelligencePanelMessages.useTmMatch} />
            </Button>
          ) : null}
        </div>
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
  isConcordanceLoading = false,
  showAgentContext = false,
  canEditTranslations = true,
  onUseTmMatch,
}: {
  intelligence: CatSegmentIntelligence;
  isLookingUpContext?: boolean;
  isConcordanceLoading?: boolean;
  showAgentContext?: boolean;
  canEditTranslations?: boolean;
  onUseTmMatch?: (match: CatTranslationMemoryMatch) => void;
}) {
  const intl = useIntl();
  const [pendingLowMatch, setPendingLowMatch] = useState<CatTranslationMemoryMatch | null>(null);
  const hasFileContext = Boolean(intelligence.productMeaning?.trim());
  const agentBadges = [
    intelligence.locationBreadcrumb,
    intelligence.componentName,
    intelligence.filePath,
  ].filter(Boolean);
  const hasAgentInsight = Boolean(intelligence.agentContext?.trim());
  const hasAgentContext = hasAgentInsight || agentBadges.length > 0;

  function handleUseTmMatch(match: CatTranslationMemoryMatch) {
    if (!onUseTmMatch) {
      return;
    }

    if (requiresLowMatchConfirmation(match.matchPercent)) {
      setPendingLowMatch(match);
      return;
    }

    onUseTmMatch(match);
  }

  function confirmLowMatchApply() {
    if (pendingLowMatch && onUseTmMatch) {
      onUseTmMatch(pendingLowMatch);
    }
    setPendingLowMatch(null);
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background lg:border-l lg:border-foreground/8">
      <div className="border-b border-foreground/8 px-4 py-3">
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={BulbIcon} className="size-4 text-bud-300" />
          <h2 className="text-sm font-semibold text-foreground">
            <FormattedMessage {...catIntelligencePanelMessages.panelTitle} />
          </h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          <FormattedMessage {...catIntelligencePanelMessages.panelDescription} />
        </p>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-5 p-4">
          <PanelSection title={intl.formatMessage(catIntelligencePanelMessages.fileContextTitle)}>
            {hasFileContext ? (
              <MarkdownContent
                value={intelligence.productMeaning ?? ""}
                contentClassName="px-0 py-0 text-sm leading-relaxed text-foreground/88"
                ariaLabel={intl.formatMessage(catIntelligencePanelMessages.fileContextAria)}
              />
            ) : (
              <p className="text-sm leading-relaxed text-muted-foreground">
                <FormattedMessage {...catIntelligencePanelMessages.noFileContext} />
              </p>
            )}
          </PanelSection>

          {showAgentContext ? (
            <PanelSection
              title={intl.formatMessage(catIntelligencePanelMessages.agentContextTitle)}
            >
              {isLookingUpContext ? (
                <AgentContextSkeleton />
              ) : hasAgentContext ? (
                <div className="space-y-3">
                  {hasAgentInsight ? (
                    <InsightCard
                      label={intl.formatMessage(catIntelligencePanelMessages.meaningInProduct)}
                      icon={<HugeiconsIcon icon={InformationCircleIcon} className="size-3.5" />}
                    >
                      <div className="min-h-[1.25rem] space-y-2">
                        <MarkdownContent
                          value={intelligence.agentContext ?? ""}
                          contentClassName="min-h-[1.25rem] px-0 py-0 text-sm leading-relaxed text-foreground/88"
                          ariaLabel={intl.formatMessage(
                            catIntelligencePanelMessages.agentContextAria,
                          )}
                        />
                        {intelligence.intent ? (
                          <MarkdownContent
                            value={intelligence.intent}
                            contentClassName="min-h-[1rem] px-0 py-0 text-xs leading-relaxed text-muted-foreground"
                            ariaLabel={intl.formatMessage(
                              catIntelligencePanelMessages.translationIntentAria,
                            )}
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
                  <FormattedMessage {...catIntelligencePanelMessages.noRepositoryContext} />
                </p>
              )}
            </PanelSection>
          ) : null}

          {isConcordanceLoading ? (
            <>
              <PanelSection
                title={intl.formatMessage(catIntelligencePanelMessages.glossaryGuidance)}
              >
                <ConcordanceSkeleton />
              </PanelSection>
              <PanelSection
                title={intl.formatMessage(catIntelligencePanelMessages.translationMemory)}
              >
                <ConcordanceSkeleton />
              </PanelSection>
            </>
          ) : null}

          {!isConcordanceLoading && intelligence.glossaryTerms.length > 0 ? (
            <PanelSection title={intl.formatMessage(catIntelligencePanelMessages.glossaryGuidance)}>
              <div className="overflow-hidden rounded-2xl bg-foreground/3">
                <ul className="divide-y divide-foreground/8">
                  {intelligence.glossaryTerms.map((term) => (
                    <GlossaryTermRow key={term.id} term={term} />
                  ))}
                </ul>
              </div>
            </PanelSection>
          ) : null}

          {!isConcordanceLoading &&
          intelligence.translationMemoryMatches &&
          intelligence.translationMemoryMatches.length > 0 ? (
            <PanelSection
              title={intl.formatMessage(catIntelligencePanelMessages.translationMemory)}
            >
              <div className="overflow-hidden rounded-2xl bg-foreground/3">
                <ul className="divide-y divide-foreground/8">
                  {intelligence.translationMemoryMatches.map((match) => (
                    <TranslationMemoryRow
                      key={match.id}
                      match={match}
                      onUse={canEditTranslations && onUseTmMatch ? handleUseTmMatch : undefined}
                    />
                  ))}
                </ul>
              </div>
            </PanelSection>
          ) : null}
        </div>
      </ScrollArea>

      <AlertDialog
        open={pendingLowMatch !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingLowMatch(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <FormattedMessage {...catIntelligencePanelMessages.lowMatchConfirmTitle} />
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingLowMatch ? (
                <FormattedMessage
                  {...catIntelligencePanelMessages.lowMatchConfirmDescription}
                  values={{ matchPercent: pendingLowMatch.matchPercent }}
                />
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <FormattedMessage {...catIntelligencePanelMessages.cancel} />
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmLowMatchApply}>
              <FormattedMessage {...catIntelligencePanelMessages.lowMatchConfirmAction} />
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
