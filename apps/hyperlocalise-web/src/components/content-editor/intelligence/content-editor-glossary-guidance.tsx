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
import { useEffect, useMemo, useState } from "react";
import { ArrowLeftIcon, BookOpenTextIcon, XIcon } from "@phosphor-icons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { contentEditorIntelligencePanelMessages } from "@/components/content-editor/shared/content-editor.messages";
import { emptyStateSourceLabel } from "@/components/content-editor/shared/empty-state-source-label";
import type { ContentEditorSegmentIntelligence } from "@/components/content-editor/shared/types";
import { DEFAULT_WORKSPACE_TEAM_SLUG } from "@/lib/teams/default-workspace-team-constants";

import { ContentEditorAddToGlossary } from "./content-editor-add-to-glossary";
import { ContentEditorGlossaryConceptCard } from "./content-editor-glossary-concept-card";
import {
  CAT_GLOSSARY_GUIDANCE_OPEN_EVENT,
  EMPTY_CAT_GLOSSARY_GUIDANCE_STATUS,
  setCatGlossaryGuidanceStatus,
} from "./content-editor-glossary-guidance-event";
import { normalizedCatGlossaryTermStatus } from "./content-editor-glossary-term-status";
import { isCatGlossaryConceptVisibleForTargetLocale } from "./content-editor-glossary-utils";
import {
  collectVisibleCatGlossaryConcepts,
  filterCatTeamGlossariesForTeam,
  groupCatGlossaryConceptsByTeam,
  resolveCatContributorTeams,
  type ContentEditorContributorTeam,
  type ContentEditorTeamGlossaryOption,
} from "./content-editor-team-glossary";

const EMPTY_CONTRIBUTOR_TEAMS: ContentEditorContributorTeam[] = [];
const EMPTY_TEAM_GLOSSARIES: ContentEditorTeamGlossaryOption[] = [];
const GLOSSARY_SKELETON_CARD_COUNT = 2;

function GlossaryGuidanceEmptyState({ sourceText }: { sourceText: string }) {
  const source = emptyStateSourceLabel(sourceText);

  return (
    <>
      <p className="mt-3 text-base font-medium text-foreground">
        {source ? (
          <FormattedMessage
            {...contentEditorIntelligencePanelMessages.glossaryGuidanceEmptyTitle}
            values={{ source }}
          />
        ) : (
          <FormattedMessage
            {...contentEditorIntelligencePanelMessages.glossaryGuidanceEmptyTitleUnnamed}
          />
        )}
      </p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        {source ? (
          <FormattedMessage
            {...contentEditorIntelligencePanelMessages.glossaryGuidanceEmptyDescription}
            values={{ source }}
          />
        ) : (
          <FormattedMessage
            {...contentEditorIntelligencePanelMessages.glossaryGuidanceEmptyDescriptionUnnamed}
          />
        )}
      </p>
    </>
  );
}

function GlossaryGuidanceSkeleton() {
  const intl = useIntl();

  return (
    <div
      role="status"
      aria-label={intl.formatMessage(
        contentEditorIntelligencePanelMessages.glossaryGuidanceLoading,
      )}
      className="space-y-3"
    >
      {Array.from({ length: GLOSSARY_SKELETON_CARD_COUNT }, (_, index) => (
        <div key={index} className="space-y-3 rounded-xl border border-border p-3.5">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-28 rounded-full bg-skeleton" />
            <Skeleton className="h-4 w-16 rounded-full bg-skeleton" />
          </div>
          <Skeleton className="h-4 w-full rounded-full bg-skeleton" />
          <Skeleton className="h-4 w-8/12 rounded-full bg-skeleton" />
        </div>
      ))}
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
      <FormattedMessage {...contentEditorIntelligencePanelMessages.addToGlossaryAction} />
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

/**
 * Glossary guidance for the current segment. Owns the floating glossary panel and publishes the
 * match status shown in the app shell footer, independent of which details tab is visible.
 */
export function ContentEditorGlossaryGuidance({
  intelligence,
  isLoading = false,
  segmentId,
  sourceText = "",
  targetText = "",
  sourceLocale,
  targetLocale,
  organizationSlug,
  projectId,
  contributorTeams = EMPTY_CONTRIBUTOR_TEAMS,
  projectTeamId,
  teamGlossaries = EMPTY_TEAM_GLOSSARIES,
  canContributeTeamGlossary = false,
  teamName,
  projectTeamSlug,
  canEditTranslations = true,
  isTranslationLocked = false,
  onGlossaryTermAdded,
}: {
  intelligence: ContentEditorSegmentIntelligence | null;
  isLoading?: boolean;
  segmentId?: string;
  sourceText?: string;
  targetText?: string;
  sourceLocale?: string;
  targetLocale?: string;
  organizationSlug?: string;
  projectId?: string;
  contributorTeams?: ContentEditorContributorTeam[];
  projectTeamId?: string;
  teamGlossaries?: ContentEditorTeamGlossaryOption[];
  canContributeTeamGlossary?: boolean;
  teamName?: string;
  projectTeamSlug?: string;
  canEditTranslations?: boolean;
  isTranslationLocked?: boolean;
  onGlossaryTermAdded?: () => void;
}) {
  const intl = useIntl();
  const [isOpen, setIsOpen] = useState(false);
  const segmentScopeKey =
    segmentId ?? `${sourceText}\0${targetText}\0${sourceLocale}\0${targetLocale}`;
  const [addingConcept, setAddingConcept] = useState<{
    teamId: string;
    segmentScopeKey: string;
  } | null>(null);
  const addingConceptTeamId =
    addingConcept && addingConcept.segmentScopeKey === segmentScopeKey && !isTranslationLocked
      ? addingConcept.teamId
      : null;
  const [createdTeamGlossaries, setCreatedTeamGlossaries] = useState<
    ContentEditorTeamGlossaryOption[]
  >([]);
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
  const rawGlossaryConcepts = intelligence?.glossaryConcepts;
  const glossaryConcepts = useMemo(
    // Concept-only guidance. Legacy flat glossaryTerms (no glossaryConcepts) are intentionally
    // not synthesized here; concordance must return concept payloads for the panel to populate.
    () =>
      (rawGlossaryConcepts ?? []).filter((concept) =>
        isCatGlossaryConceptVisibleForTargetLocale(concept, targetLocale),
      ),
    [rawGlossaryConcepts, targetLocale],
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
  const matchCount = visibleGlossaryConcepts.length;
  const notRecommendedCount = useMemo(
    () =>
      visibleGlossaryConcepts
        .flatMap((concept) => [
          ...concept.sourceTerms,
          ...(concept.translatable === false ? [] : concept.targetTerms),
        ])
        .filter((term) => normalizedCatGlossaryTermStatus(term) === "not_recommended").length,
    [visibleGlossaryConcepts],
  );
  const firstVisibleGlossaryConceptId = visibleGlossaryConcepts[0]?.id;
  const [expandedGlossaryConceptIds, setExpandedGlossaryConceptIds] = useState<Set<string>>(
    () => new Set(firstVisibleGlossaryConceptId ? [firstVisibleGlossaryConceptId] : []),
  );

  useEffect(() => {
    setExpandedGlossaryConceptIds(
      new Set(firstVisibleGlossaryConceptId ? [firstVisibleGlossaryConceptId] : []),
    );
  }, [glossaryConceptKey, firstVisibleGlossaryConceptId]);

  useEffect(() => {
    setCatGlossaryGuidanceStatus(
      isLoading
        ? { ...EMPTY_CAT_GLOSSARY_GUIDANCE_STATUS, isLoading: true }
        : { isLoading: false, matchCount, notRecommendedCount },
    );
  }, [isLoading, matchCount, notRecommendedCount]);

  useEffect(() => {
    return () => {
      setCatGlossaryGuidanceStatus(EMPTY_CAT_GLOSSARY_GUIDANCE_STATUS);
    };
  }, []);

  useEffect(() => {
    function handleOpenGlossaryGuidance() {
      setIsOpen(true);
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

  function startAddingConcept(teamId: string) {
    setAddingConcept({ teamId, segmentScopeKey });
  }

  function closePanel() {
    setAddingConcept(null);
    setIsOpen(false);
  }

  if (!isOpen) {
    return null;
  }

  const canContributeConcept =
    canEditTranslations && Boolean(sourceLocale && targetLocale) && canContributeTeamGlossary;
  const canOpenAddConcept = canContributeConcept && !isTranslationLocked;
  const hasTeamSections = orderedContributorTeams.length > 0;
  const showGlobalEmpty = !isLoading && matchCount === 0 && !hasTeamSections;

  return (
    <section
      className="fixed inset-x-2 bottom-[calc(var(--app-shell-plan-footer-height)+0.5rem)] z-50 flex h-[min(44rem,calc(100svh-var(--app-shell-plan-footer-height)-1rem))] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl shadow-black/15 sm:inset-x-auto sm:right-3 sm:w-[38rem]"
      aria-label={intl.formatMessage(contentEditorIntelligencePanelMessages.glossaryGuidance)}
      aria-busy={isLoading}
    >
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
        {addingConceptTeamId ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={intl.formatMessage(
              contentEditorIntelligencePanelMessages.addToGlossaryBack,
            )}
            onClick={() => setAddingConcept(null)}
          >
            <ArrowLeftIcon className="size-3.5" />
          </Button>
        ) : null}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h2 className="truncate text-base font-medium text-foreground">
            {addingConceptTeamId ? (
              <FormattedMessage {...contentEditorIntelligencePanelMessages.addToGlossaryTitle} />
            ) : (
              <FormattedMessage {...contentEditorIntelligencePanelMessages.glossaryGuidance} />
            )}
          </h2>
          {addingConceptTeamId ? null : isLoading ? (
            <Spinner
              className="size-3.5 text-muted-foreground"
              aria-hidden="true"
              role="presentation"
            />
          ) : matchCount > 0 ? (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-beam-100 px-1.5 text-xs font-semibold tabular-nums text-beam-900 dark:bg-beam-900/40 dark:text-beam-100">
              {matchCount}
            </span>
          ) : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={intl.formatMessage(
            contentEditorIntelligencePanelMessages.glossaryGuidanceClose,
          )}
          onClick={closePanel}
        >
          <XIcon className="size-3.5" />
        </Button>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 p-4">
          {addingConceptTeamId &&
          canOpenAddConcept &&
          addingConceptTeam &&
          sourceLocale &&
          targetLocale ? (
            <ContentEditorAddToGlossary
              key={`${addingConceptTeamId}\0${segmentScopeKey}`}
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
                setAddingConcept(null);
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
                  {...contentEditorIntelligencePanelMessages.glossaryGuidanceDescription}
                />
              </p>
              {isLoading ? (
                <GlossaryGuidanceSkeleton />
              ) : showGlobalEmpty ? (
                <div className="flex min-h-56 flex-col items-center justify-center rounded-xl bg-muted/30 px-6 text-center">
                  <BookOpenTextIcon className="size-7 text-muted-foreground" aria-hidden="true" />
                  <GlossaryGuidanceEmptyState sourceText={sourceText} />
                </div>
              ) : (
                <>
                  {orgGlossaryConcepts.length > 0 ? (
                    <div className="space-y-3">
                      {orgGlossaryConcepts.map((concept) => (
                        <ContentEditorGlossaryConceptCard
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
                          filterCatTeamGlossariesForTeam(resolvedTeamGlossaries, team.id).length >
                          0;

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
                                      {...contentEditorIntelligencePanelMessages.addToGlossaryEmpty}
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
                                          contentEditorIntelligencePanelMessages.addToGlossaryLocked,
                                        )
                                      : undefined
                                  }
                                  onClick={() => startAddingConcept(team.id)}
                                />
                              ) : null}
                            </div>
                            {teamConcepts.length > 0 ? (
                              <div className="space-y-3">
                                {teamConcepts.map((concept) => (
                                  <ContentEditorGlossaryConceptCard
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
                                  {...contentEditorIntelligencePanelMessages.addToGlossaryTeamEmpty}
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
  );
}
