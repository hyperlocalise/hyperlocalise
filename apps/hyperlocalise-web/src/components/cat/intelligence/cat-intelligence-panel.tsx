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
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft01Icon,
  BookOpenTextIcon,
  BulbIcon,
  Cancel01Icon,
  RefreshIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { formatInternalMarkupForDisplay } from "@/components/cat/message-format/cat-internal-markup";
import { MarkdownContent } from "@/components/markdown-editor/markdown-editor";
import { CatSegmentMaxLengthEditor } from "@/components/cat/segment/cat-segment-max-length-editor";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/primitives/cn";
import { DEFAULT_WORKSPACE_TEAM_SLUG } from "@/lib/teams/default-workspace-team-constants";

import {
  catEditorPanelMessages,
  catIntelligencePanelMessages,
} from "@/components/cat/shared/cat.messages";
import type {
  CatSegmentIntelligence,
  CatTmMatchKind,
  CatTranslationMemoryMatch,
} from "@/components/cat/shared/types";

import { normalizedCatGlossaryTermStatus } from "./cat-glossary-term-status";
import { CatAddToGlossary } from "./cat-add-to-glossary";
import { CatGlossaryConceptCard } from "./cat-glossary-concept-card";
import { isCatGlossaryConceptVisibleForTargetLocale } from "./cat-glossary-utils";
import {
  collectVisibleCatGlossaryConcepts,
  filterCatTeamGlossariesForTeam,
  groupCatGlossaryConceptsByTeam,
  resolveCatContributorTeams,
  type CatContributorTeam,
  type CatTeamGlossaryOption,
} from "./cat-team-glossary";
import {
  CAT_GLOSSARY_GUIDANCE_OPEN_EVENT,
  setCatGlossaryGuidanceStatus,
} from "./cat-glossary-guidance-event";
import { requiresLowMatchConfirmation } from "./tm-match-quality";
import { CatVisualContextPanel } from "./cat-visual-context-panel";

function PanelSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

const intelligenceMutedPanelClassName = "overflow-hidden rounded-2xl bg-muted px-3.5 py-3";

function ConcordanceSkeleton() {
  return (
    <div className="space-y-3 rounded-2xl bg-muted p-3.5">
      <Skeleton className="h-4 w-32 rounded-full bg-skeleton" />
      <Skeleton className="h-4 w-full rounded-full bg-skeleton" />
      <Skeleton className="h-4 w-10/12 rounded-full bg-skeleton" />
    </div>
  );
}

function AgentContextSkeleton() {
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Skeleton className="h-3 w-28 rounded-full bg-skeleton" />
        <Skeleton className="h-4 w-full rounded-full bg-skeleton" />
        <Skeleton className="h-4 w-10/12 rounded-full bg-skeleton" />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Skeleton className="h-5 w-28 rounded-lg bg-skeleton" />
        <Skeleton className="h-5 w-20 rounded-lg bg-skeleton" />
        <Skeleton className="h-5 w-36 rounded-lg bg-skeleton" />
      </div>
    </div>
  );
}

function AddConceptButton({
  disabled,
  disabledReason,
  onClick,
}: {
  disabled: boolean;
  disabledReason?: string;
  onClick: () => void;
}) {
  const button = (
    <Button type="button" size="sm" className="shrink-0" disabled={disabled} onClick={onClick}>
      <FormattedMessage {...catIntelligencePanelMessages.addToGlossaryAction} />
    </Button>
  );

  if (!disabled || !disabledReason) {
    return button;
  }

  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex" />}>{button}</TooltipTrigger>
      <TooltipContent>{disabledReason}</TooltipContent>
    </Tooltip>
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
          {formatInternalMarkupForDisplay(match.sourceText)}
        </p>
        <p className="text-pretty text-sm leading-relaxed text-foreground">
          {formatInternalMarkupForDisplay(match.targetText)}
        </p>
      </div>
    </li>
  );
}

export function CatIntelligencePanel({
  intelligence,
  segmentId,
  sourceText = "",
  targetText = "",
  sourceLocale,
  targetLocale,
  organizationSlug,
  projectId,
  contributorTeams = [],
  projectTeamId,
  teamGlossaries = [],
  canContributeTeamGlossary = false,
  teamName,
  projectTeamSlug,
  isLookingUpContext = false,
  isConcordanceLoading = false,
  isVisualContextLoading = false,
  showAgentContext = false,
  showVisualContext = false,
  showMaxLengthEditor = false,
  isMaxLengthSaving = false,
  canEditTranslations = true,
  isTranslationLocked = false,
  canLookupFreshContext = true,
  onRefreshContext,
  onUseTmMatch,
  onSetMaxLength,
  onGlossaryTermAdded,
}: {
  intelligence: CatSegmentIntelligence;
  segmentId?: string;
  sourceText?: string;
  targetText?: string;
  sourceLocale?: string;
  targetLocale?: string;
  organizationSlug?: string;
  projectId?: string;
  contributorTeams?: CatContributorTeam[];
  projectTeamId?: string;
  teamGlossaries?: CatTeamGlossaryOption[];
  canContributeTeamGlossary?: boolean;
  teamName?: string;
  projectTeamSlug?: string;
  isLookingUpContext?: boolean;
  isConcordanceLoading?: boolean;
  isVisualContextLoading?: boolean;
  showAgentContext?: boolean;
  showVisualContext?: boolean;
  showMaxLengthEditor?: boolean;
  isMaxLengthSaving?: boolean;
  canEditTranslations?: boolean;
  isTranslationLocked?: boolean;
  canLookupFreshContext?: boolean;
  onRefreshContext?: () => void;
  onUseTmMatch?: (match: CatTranslationMemoryMatch) => void;
  onSetMaxLength?: (maxLength: number | null) => void | Promise<void>;
  onGlossaryTermAdded?: () => void;
}) {
  const intl = useIntl();
  const [pendingLowMatch, setPendingLowMatch] = useState<CatTranslationMemoryMatch | null>(null);
  const [isGlossaryPanelOpen, setIsGlossaryPanelOpen] = useState(false);
  const [addingConceptTeamId, setAddingConceptTeamId] = useState<string | null>(null);
  const [createdTeamGlossaries, setCreatedTeamGlossaries] = useState<CatTeamGlossaryOption[]>([]);
  const resolvedTeamGlossaries = useMemo(() => {
    const seen = new Set(teamGlossaries.map((glossary) => glossary.id));
    return [
      ...teamGlossaries,
      ...createdTeamGlossaries.filter((glossary) => !seen.has(glossary.id)),
    ];
  }, [createdTeamGlossaries, teamGlossaries]);
  const resolvedContributorTeams = useMemo(
    () =>
      resolveCatContributorTeams({
        contributorTeams,
        projectTeamId,
        projectTeamName: teamName,
        projectTeamSlug,
      }),
    [contributorTeams, projectTeamId, projectTeamSlug, teamName],
  );
  const teamGlossaryIds = useMemo(
    () => new Set(resolvedTeamGlossaries.map((glossary) => glossary.id)),
    [resolvedTeamGlossaries],
  );
  const glossaryTeamById = useMemo(
    () => new Map(resolvedTeamGlossaries.map((glossary) => [glossary.id, glossary.teamId])),
    [resolvedTeamGlossaries],
  );
  const contributorTeamIds = useMemo(
    () => new Set(resolvedContributorTeams.map((team) => team.id)),
    [resolvedContributorTeams],
  );
  const glossaryConcepts = useMemo(
    // Concept-only guidance. Legacy flat glossaryTerms (no glossaryConcepts) are intentionally
    // not synthesized here; concordance must return concept payloads for the panel to populate.
    () =>
      (intelligence.glossaryConcepts ?? []).filter((concept) =>
        isCatGlossaryConceptVisibleForTargetLocale(concept, targetLocale),
      ),
    [intelligence.glossaryConcepts, targetLocale],
  );
  const ungroupedTeamIds = useMemo(
    () =>
      projectTeamId && projectTeamSlug === DEFAULT_WORKSPACE_TEAM_SLUG
        ? new Set([projectTeamId])
        : new Set<string>(),
    [projectTeamId, projectTeamSlug],
  );
  const { orgConceptIds, conceptsByTeamId } = useMemo(
    () =>
      groupCatGlossaryConceptsByTeam({
        concepts: glossaryConcepts,
        teamGlossaryIds,
        glossaryTeamById,
        contributorTeamIds,
        ungroupedTeamIds,
      }),
    [contributorTeamIds, glossaryConcepts, glossaryTeamById, teamGlossaryIds, ungroupedTeamIds],
  );
  const orgGlossaryConcepts = useMemo(
    () => glossaryConcepts.filter((concept) => orgConceptIds.has(concept.id)),
    [glossaryConcepts, orgConceptIds],
  );
  const visibleGlossaryConcepts = useMemo(
    () => collectVisibleCatGlossaryConcepts(orgGlossaryConcepts, conceptsByTeamId),
    [conceptsByTeamId, orgGlossaryConcepts],
  );
  const orderedContributorTeams = useMemo(() => {
    if (!projectTeamId) {
      return resolvedContributorTeams;
    }

    const projectTeamIndex = resolvedContributorTeams.findIndex(
      (team) => team.id === projectTeamId,
    );
    if (projectTeamIndex <= 0) {
      return resolvedContributorTeams;
    }

    const teams = [...resolvedContributorTeams];
    const [projectTeam] = teams.splice(projectTeamIndex, 1);
    return [projectTeam, ...teams];
  }, [projectTeamId, resolvedContributorTeams]);
  const addingConceptTeam = orderedContributorTeams.find((team) => team.id === addingConceptTeamId);
  const glossaryConceptKey = visibleGlossaryConcepts.map((concept) => concept.id).join("\u0000");
  const glossaryGuidanceStatus = useMemo(() => {
    const terms = visibleGlossaryConcepts.flatMap((concept) => [
      ...concept.sourceTerms,
      ...(concept.translatable === false ? [] : concept.targetTerms),
    ]);

    return {
      matchCount: visibleGlossaryConcepts.length,
      preferredCount: terms.filter((term) => normalizedCatGlossaryTermStatus(term) === "preferred")
        .length,
      notRecommendedCount: terms.filter(
        (term) => normalizedCatGlossaryTermStatus(term) === "not_recommended",
      ).length,
    };
  }, [visibleGlossaryConcepts]);
  const [expandedGlossaryConceptIds, setExpandedGlossaryConceptIds] = useState<Set<string>>(
    () => new Set(visibleGlossaryConcepts[0] ? [visibleGlossaryConcepts[0].id] : []),
  );

  useEffect(() => {
    setExpandedGlossaryConceptIds(
      new Set(visibleGlossaryConcepts[0] ? [visibleGlossaryConcepts[0].id] : []),
    );
  }, [glossaryConceptKey, visibleGlossaryConcepts]);

  useEffect(() => {
    setCatGlossaryGuidanceStatus(
      isConcordanceLoading
        ? { preferredCount: 0, notRecommendedCount: 0, matchCount: 0 }
        : glossaryGuidanceStatus,
    );

    return () => {
      setCatGlossaryGuidanceStatus({ preferredCount: 0, notRecommendedCount: 0, matchCount: 0 });
    };
  }, [glossaryConceptKey, glossaryGuidanceStatus, isConcordanceLoading]);

  useEffect(() => {
    if (isTranslationLocked) {
      setAddingConceptTeamId(null);
    }
  }, [isTranslationLocked]);

  useEffect(() => {
    function handleOpenGlossaryGuidance() {
      setIsGlossaryPanelOpen(true);
    }

    window.addEventListener(CAT_GLOSSARY_GUIDANCE_OPEN_EVENT, handleOpenGlossaryGuidance);
    return () => {
      window.removeEventListener(CAT_GLOSSARY_GUIDANCE_OPEN_EVENT, handleOpenGlossaryGuidance);
    };
  }, []);

  function toggleGlossaryConcept(conceptId: string) {
    setExpandedGlossaryConceptIds((current) => {
      const next = new Set(current);
      if (next.has(conceptId)) next.delete(conceptId);
      else next.add(conceptId);
      return next;
    });
  }
  const hasFileContext = Boolean(intelligence.productMeaning?.trim());
  const agentBadges = [
    intelligence.locationBreadcrumb,
    intelligence.componentName,
    intelligence.filePath,
  ].filter(Boolean);
  const hasAgentInsight = Boolean(intelligence.agentContext?.trim());
  const hasAttemptedAgentLookup = intelligence.agentContext !== undefined;
  const hasAgentContext = hasAgentInsight || agentBadges.length > 0;
  const canRefreshAgentContext =
    hasAttemptedAgentLookup && canLookupFreshContext && onRefreshContext;

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

  function closeGlossaryPanel() {
    setAddingConceptTeamId(null);
    setIsGlossaryPanelOpen(false);
  }

  const canContributeConcept =
    canEditTranslations && Boolean(sourceLocale && targetLocale) && canContributeTeamGlossary;
  const canOpenAddConcept = canContributeConcept && !isTranslationLocked;
  const hasTeamSections = orderedContributorTeams.length > 0;
  const showGlobalEmpty =
    !isConcordanceLoading && visibleGlossaryConcepts.length === 0 && !hasTeamSections;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background lg:border-l lg:border-border">
      <div className="border-b border-border px-4 py-3">
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
          <CatVisualContextPanel
            visualContext={intelligence.visualContext}
            isLoading={isVisualContextLoading}
            showPanel={showVisualContext}
          />

          {showMaxLengthEditor ? (
            <PanelSection title={intl.formatMessage(catIntelligencePanelMessages.maxLengthTitle)}>
              <div className={intelligenceMutedPanelClassName}>
                <CatSegmentMaxLengthEditor
                  maxLength={intelligence.maxLength}
                  canEdit={canEditTranslations && !isTranslationLocked && Boolean(onSetMaxLength)}
                  isSaving={isMaxLengthSaving}
                  onSave={onSetMaxLength ?? (async () => undefined)}
                />
              </div>
            </PanelSection>
          ) : null}

          <PanelSection title={intl.formatMessage(catIntelligencePanelMessages.fileContextTitle)}>
            <div className={intelligenceMutedPanelClassName}>
              {hasFileContext ? (
                <MarkdownContent
                  value={intelligence.productMeaning ?? ""}
                  contentClassName="px-0 py-0 text-sm leading-relaxed text-foreground"
                  ariaLabel={intl.formatMessage(catIntelligencePanelMessages.fileContextAria)}
                />
              ) : (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  <FormattedMessage {...catIntelligencePanelMessages.noFileContext} />
                </p>
              )}
            </div>
          </PanelSection>

          {showAgentContext ? (
            <PanelSection
              title={intl.formatMessage(catIntelligencePanelMessages.agentContextTitle)}
              action={
                canRefreshAgentContext ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="-mr-2 size-8 p-0 text-muted-foreground hover:text-foreground"
                    onClick={onRefreshContext}
                    disabled={isLookingUpContext}
                    title={intl.formatMessage(catEditorPanelMessages.refreshContextTitle)}
                    aria-label={intl.formatMessage(catEditorPanelMessages.refreshContextTitle)}
                  >
                    <HugeiconsIcon icon={RefreshIcon} className="size-4" strokeWidth={1.8} />
                  </Button>
                ) : null
              }
            >
              <div className={intelligenceMutedPanelClassName}>
                {isLookingUpContext ? (
                  <AgentContextSkeleton />
                ) : hasAgentContext ? (
                  <div className="space-y-3">
                    {hasAgentInsight ? (
                      <div className="min-h-[1.25rem] space-y-2">
                        <MarkdownContent
                          value={intelligence.agentContext ?? ""}
                          contentClassName="min-h-[1.25rem] px-0 py-0 text-sm leading-relaxed text-foreground"
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
              </div>
            </PanelSection>
          ) : null}

          {isConcordanceLoading ? (
            <>
              <PanelSection
                title={intl.formatMessage(catIntelligencePanelMessages.translationMemory)}
              >
                <ConcordanceSkeleton />
              </PanelSection>
            </>
          ) : null}

          {!isConcordanceLoading &&
          intelligence.translationMemoryMatches &&
          intelligence.translationMemoryMatches.length > 0 ? (
            <PanelSection
              title={intl.formatMessage(catIntelligencePanelMessages.translationMemory)}
            >
              <div className="overflow-hidden rounded-2xl bg-muted">
                <ul className="divide-y divide-border">
                  {intelligence.translationMemoryMatches.map((match) => (
                    <TranslationMemoryRow
                      key={match.id}
                      match={match}
                      onUse={
                        canEditTranslations && !isTranslationLocked && onUseTmMatch
                          ? handleUseTmMatch
                          : undefined
                      }
                    />
                  ))}
                </ul>
              </div>
            </PanelSection>
          ) : null}
        </div>
      </ScrollArea>

      {isGlossaryPanelOpen ? (
        <section
          className="fixed inset-x-2 bottom-[calc(var(--app-shell-plan-footer-height)+0.5rem)] z-50 flex h-[min(44rem,calc(100svh-var(--app-shell-plan-footer-height)-1rem))] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl shadow-black/15 sm:inset-x-auto sm:right-3 sm:w-[38rem]"
          aria-label={intl.formatMessage(catIntelligencePanelMessages.glossaryGuidance)}
        >
          <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
            {addingConceptTeamId ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={intl.formatMessage(catIntelligencePanelMessages.addToGlossaryBack)}
                onClick={() => setAddingConceptTeamId(null)}
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} className="size-3.5" />
              </Button>
            ) : null}
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-base font-medium text-foreground">
                {addingConceptTeamId ? (
                  <FormattedMessage {...catIntelligencePanelMessages.addToGlossaryTitle} />
                ) : (
                  <FormattedMessage {...catIntelligencePanelMessages.glossaryGuidance} />
                )}
              </h2>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={intl.formatMessage(catIntelligencePanelMessages.glossaryGuidanceClose)}
              onClick={closeGlossaryPanel}
            >
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3.5" />
            </Button>
          </header>

          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-3 p-4">
              {addingConceptTeamId &&
              canOpenAddConcept &&
              addingConceptTeam &&
              sourceLocale &&
              targetLocale ? (
                <CatAddToGlossary
                  key={`${addingConceptTeamId}\0${
                    segmentId ?? `${sourceText}\0${targetText}\0${sourceLocale}\0${targetLocale}`
                  }`}
                  organizationSlug={organizationSlug}
                  projectId={projectId}
                  teamId={addingConceptTeam.id}
                  teamName={addingConceptTeam.name}
                  sourceLocale={sourceLocale}
                  targetLocale={targetLocale}
                  sourceTerm={sourceText}
                  targetTerm={targetText}
                  teamGlossaries={resolvedTeamGlossaries}
                  canContribute={canContributeTeamGlossary}
                  showTitle={false}
                  onAdded={() => {
                    setAddingConceptTeamId(null);
                    onGlossaryTermAdded?.();
                  }}
                  onTeamGlossaryCreated={(glossary) => {
                    setCreatedTeamGlossaries((current) =>
                      current.some((item) => item.id === glossary.id)
                        ? current
                        : [...current, glossary],
                    );
                  }}
                />
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    <FormattedMessage
                      {...catIntelligencePanelMessages.glossaryGuidanceDescription}
                    />
                  </p>
                  {isConcordanceLoading ? (
                    <ConcordanceSkeleton />
                  ) : showGlobalEmpty ? (
                    <div className="flex min-h-56 flex-col items-center justify-center rounded-xl bg-muted/30 px-6 text-center">
                      <HugeiconsIcon
                        icon={BookOpenTextIcon}
                        className="size-7 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <p className="mt-3 text-base font-medium text-foreground">
                        <FormattedMessage
                          {...catIntelligencePanelMessages.glossaryGuidanceEmptyTitle}
                        />
                      </p>
                      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                        <FormattedMessage
                          {...catIntelligencePanelMessages.glossaryGuidanceEmptyDescription}
                        />
                      </p>
                    </div>
                  ) : (
                    <>
                      {orgGlossaryConcepts.length > 0 ? (
                        <div className="space-y-3">
                          {orgGlossaryConcepts.map((concept) => (
                            <CatGlossaryConceptCard
                              key={concept.id}
                              concept={concept}
                              expanded={expandedGlossaryConceptIds.has(concept.id)}
                              onToggle={() => toggleGlossaryConcept(concept.id)}
                            />
                          ))}
                        </div>
                      ) : null}
                      {hasTeamSections ? (
                        <div className="space-y-4">
                          {orderedContributorTeams.map((team) => {
                            const teamConcepts = conceptsByTeamId.get(team.id) ?? [];
                            const hasAttachedGlossary =
                              filterCatTeamGlossariesForTeam(resolvedTeamGlossaries, team.id)
                                .length > 0;

                            return (
                              <section key={team.id} className="space-y-3">
                                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                                  <div className="min-w-0 flex-1">
                                    {team.name ? (
                                      <h3 className="text-sm font-medium text-foreground">
                                        {team.name}
                                      </h3>
                                    ) : null}
                                    {hasAttachedGlossary ? null : (
                                      <p className="text-xs text-muted-foreground">
                                        <FormattedMessage
                                          {...catIntelligencePanelMessages.addToGlossaryEmpty}
                                        />
                                      </p>
                                    )}
                                  </div>
                                  {canContributeConcept ? (
                                    <AddConceptButton
                                      disabled={isTranslationLocked}
                                      disabledReason={
                                        isTranslationLocked
                                          ? intl.formatMessage(
                                              catIntelligencePanelMessages.addToGlossaryLocked,
                                            )
                                          : undefined
                                      }
                                      onClick={() => setAddingConceptTeamId(team.id)}
                                    />
                                  ) : null}
                                </div>
                                {teamConcepts.length > 0 ? (
                                  <div className="space-y-3">
                                    {teamConcepts.map((concept) => (
                                      <CatGlossaryConceptCard
                                        key={concept.id}
                                        concept={concept}
                                        teamName={team.name || undefined}
                                        expanded={expandedGlossaryConceptIds.has(concept.id)}
                                        onToggle={() => toggleGlossaryConcept(concept.id)}
                                      />
                                    ))}
                                  </div>
                                ) : (
                                  <p className="rounded-xl border border-border bg-muted/20 px-3 py-2.5 text-sm text-muted-foreground">
                                    <FormattedMessage
                                      {...catIntelligencePanelMessages.addToGlossaryTeamEmpty}
                                      values={{ teamName: team.name }}
                                    />
                                  </p>
                                )}
                              </section>
                            );
                          })}
                        </div>
                      ) : null}
                    </>
                  )}
                </>
              )}
            </div>
          </ScrollArea>
        </section>
      ) : null}

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
