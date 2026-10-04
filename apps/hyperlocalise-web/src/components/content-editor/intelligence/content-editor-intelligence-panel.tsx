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
import { createElement, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeftIcon,
  BookOpenTextIcon,
  LightbulbIcon,
  XIcon,
  DatabaseIcon,
  FileIcon,
  ArrowClockwiseIcon,
  ListMagnifyingGlassIcon,
  TextTIcon,
  type Icon,
} from "@phosphor-icons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { formatInternalMarkupForDisplay } from "@/components/content-editor/message-format/content-editor-internal-markup";
import { MarkdownContent } from "@/components/markdown-editor/markdown-editor";
import { ContentEditorSegmentMaxLengthEditor } from "@/components/content-editor/segment/content-editor-segment-max-length-editor";
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
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ContentEditorEditorShortcutKbd } from "@/components/content-editor/editor/content-editor-editor-shortcut-kbd";
import { contentEditorFindContextMessages } from "@/components/content-editor/shared/content-editor-chrome.messages";
import { useIsMac } from "@/hooks/use-is-mac";
import { cn } from "@/lib/primitives/cn";
import { countRunes } from "@/lib/qa/count-runes";
import { DEFAULT_WORKSPACE_TEAM_SLUG } from "@/lib/teams/default-workspace-team-constants";

import {
  contentEditorEditorPanelMessages,
  contentEditorIntelligencePanelMessages,
} from "@/components/content-editor/shared/content-editor.messages";
import { emptyStateSourceLabel } from "@/components/content-editor/shared/empty-state-source-label";
import type {
  ContentEditorSegmentIntelligence,
  ContentEditorTmMatchKind,
  ContentEditorTranslationMemoryMatch,
} from "@/components/content-editor/shared/types";

import { normalizedCatGlossaryTermStatus } from "./content-editor-glossary-term-status";
import { ContentEditorAddToGlossary } from "./content-editor-add-to-glossary";
import { ContentEditorGlossaryConceptCard } from "./content-editor-glossary-concept-card";
import { isCatGlossaryConceptVisibleForTargetLocale } from "./content-editor-glossary-utils";
import {
  collectVisibleCatGlossaryConcepts,
  filterCatTeamGlossariesForTeam,
  groupCatGlossaryConceptsByTeam,
  resolveCatContributorTeams,
  type ContentEditorContributorTeam,
  type ContentEditorTeamGlossaryOption,
} from "./content-editor-team-glossary";
import {
  CAT_GLOSSARY_GUIDANCE_OPEN_EVENT,
  EMPTY_CAT_GLOSSARY_GUIDANCE_STATUS,
  setCatGlossaryGuidanceStatus,
} from "./content-editor-glossary-guidance-event";
import { requiresLowMatchConfirmation } from "./tm-match-quality";
import { ContentEditorLottieContextPanel } from "./content-editor-lottie-context-panel";
import {
  ContentEditorExpandableContent,
  ContentEditorShowLessButton,
  ContentEditorShowMoreFade,
} from "./content-editor-show-more-fade";
import { ContentEditorVisualContextPanel } from "./content-editor-visual-context-panel";

const EMPTY_CONTRIBUTOR_TEAMS: ContentEditorContributorTeam[] = [];
const EMPTY_TEAM_GLOSSARIES: ContentEditorTeamGlossaryOption[] = [];

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

function PanelSection({
  title,
  icon,
  action,
  badge,
  padded = true,
  children,
}: {
  title: string;
  icon?: Icon;
  action?: ReactNode;
  badge?: ReactNode;
  padded?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-background">
      <div className="flex items-center gap-2 border-b border-border px-3.5 py-2.5">
        {icon
          ? createElement(icon, { className: "size-3.5 shrink-0 text-muted-foreground" })
          : null}
        <h3 className="min-w-0 flex-1 text-sm font-medium text-foreground">{title}</h3>
        {badge}
        {action}
      </div>
      <div className={padded ? "px-3.5 py-3" : undefined}>{children}</div>
    </section>
  );
}

function ConcordanceSkeleton() {
  return (
    <div className="space-y-3 p-3.5">
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

function tmMatchBadgeTone(matchKind: ContentEditorTmMatchKind | undefined) {
  switch (matchKind) {
    case "exact":
    case "context":
      return "border-grove-700/40 bg-grove-100 text-grove-900";
    default:
      return "border-beam-700/40 bg-beam-100 text-beam-900";
  }
}

function tmMatchBadgeLabel(
  match: ContentEditorTranslationMemoryMatch,
  intl: ReturnType<typeof useIntl>,
) {
  switch (match.matchKind) {
    case "exact":
      return intl.formatMessage(contentEditorIntelligencePanelMessages.matchKindExact);
    case "context":
      return intl.formatMessage(contentEditorIntelligencePanelMessages.matchKindContext);
    case "fuzzy":
      return intl.formatMessage(contentEditorIntelligencePanelMessages.matchKindFuzzy);
    default:
      return intl.formatMessage(contentEditorIntelligencePanelMessages.matchPercent, {
        matchPercent: match.matchPercent,
      });
  }
}

function TranslationMemoryRow({
  match,
  onUse,
}: {
  match: ContentEditorTranslationMemoryMatch;
  onUse?: (match: ContentEditorTranslationMemoryMatch) => void;
}) {
  const intl = useIntl();

  return (
    <li className="space-y-2 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums",
              tmMatchBadgeTone(match.matchKind),
            )}
          >
            {tmMatchBadgeLabel(match, intl)}
          </span>
          {match.contextLabel ? (
            <span className="max-w-36 truncate text-xs text-subtle-foreground">
              {match.contextLabel}
            </span>
          ) : null}
        </div>
        {onUse ? (
          <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={() => onUse(match)}>
            <FormattedMessage {...contentEditorIntelligencePanelMessages.useTmMatch} />
          </Button>
        ) : null}
      </div>
      <div className="space-y-1">
        <p className="text-pretty text-sm leading-relaxed text-foreground">
          {formatInternalMarkupForDisplay(match.targetText)}
        </p>
        <p className="text-pretty text-xs leading-relaxed text-subtle-foreground">
          {formatInternalMarkupForDisplay(match.sourceText)}
        </p>
      </div>
    </li>
  );
}

const TM_COLLAPSED_MATCH_COUNT = 2;

function TranslationMemoryMatchList({
  matches,
  onUse,
}: {
  matches: ContentEditorTranslationMemoryMatch[];
  onUse?: (match: ContentEditorTranslationMemoryMatch) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hiddenCount = matches.length - TM_COLLAPSED_MATCH_COUNT;
  const canCollapse = hiddenCount > 0;
  const visibleMatches =
    canCollapse && !isExpanded ? matches.slice(0, TM_COLLAPSED_MATCH_COUNT) : matches;
  const peekMatch = canCollapse && !isExpanded ? matches[TM_COLLAPSED_MATCH_COUNT] : undefined;

  return (
    <>
      <ul className="divide-y divide-border">
        {visibleMatches.map((match) => (
          <TranslationMemoryRow key={match.id} match={match} onUse={onUse} />
        ))}
      </ul>
      {peekMatch ? (
        <div className="relative h-20 overflow-hidden border-t border-border">
          <ul aria-hidden inert className="pointer-events-none select-none">
            <TranslationMemoryRow match={peekMatch} />
          </ul>
          <ContentEditorShowMoreFade
            className="inset-y-0 h-auto pb-2.5"
            label={
              <FormattedMessage
                {...contentEditorIntelligencePanelMessages.translationMemoryShowMore}
                values={{ count: hiddenCount }}
              />
            }
            onClick={() => setIsExpanded(true)}
          />
        </div>
      ) : null}
      {canCollapse && isExpanded ? (
        <ContentEditorShowLessButton
          className="border-t border-border py-2"
          label={
            <FormattedMessage
              {...contentEditorIntelligencePanelMessages.translationMemoryShowLess}
            />
          }
          onClick={() => setIsExpanded(false)}
        />
      ) : null}
    </>
  );
}

export function ContentEditorIntelligencePanel({
  intelligence,
  segmentId,
  segmentKey,
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
  embedded = false,
  onRefreshContext,
  onUseTmMatch,
  onSetMaxLength,
  onGlossaryTermAdded,
  canTriggerFindContext = false,
  onFindContext,
  scrollToTm = false,
}: {
  intelligence: ContentEditorSegmentIntelligence;
  segmentId?: string;
  segmentKey?: string;
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
  embedded?: boolean;
  onRefreshContext?: () => void;
  onUseTmMatch?: (match: ContentEditorTranslationMemoryMatch) => void;
  onSetMaxLength?: (maxLength: number | null) => void | Promise<void>;
  onGlossaryTermAdded?: () => void;
  /** False while another action is in flight or lookup is unavailable. */
  canTriggerFindContext?: boolean;
  /** Renders the Find context button in the panel header when provided. */
  onFindContext?: () => void;
  /**
   * When true, the panel scrolls to the Translation Memory section on mount.
   * Enabled in Translator persona so TM matches are immediately visible.
   */
  scrollToTm?: boolean;
}) {
  const intl = useIntl();
  const isMac = useIsMac();
  const [pendingLowMatch, setPendingLowMatch] =
    useState<ContentEditorTranslationMemoryMatch | null>(null);
  const [isGlossaryPanelOpen, setIsGlossaryPanelOpen] = useState(false);
  const [addingConceptTeamId, setAddingConceptTeamId] = useState<string | null>(null);
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
  const firstVisibleGlossaryConceptId = visibleGlossaryConcepts[0]?.id;
  const [expandedGlossaryConceptIds, setExpandedGlossaryConceptIds] = useState<Set<string>>(
    () => new Set(firstVisibleGlossaryConceptId ? [firstVisibleGlossaryConceptId] : []),
  );

  useEffect(() => {
    setExpandedGlossaryConceptIds(
      new Set(firstVisibleGlossaryConceptId ? [firstVisibleGlossaryConceptId] : []),
    );
  }, [glossaryConceptKey, firstVisibleGlossaryConceptId]);

  const { matchCount, preferredCount, notRecommendedCount } = glossaryGuidanceStatus;
  useEffect(() => {
    setCatGlossaryGuidanceStatus(
      isConcordanceLoading
        ? EMPTY_CAT_GLOSSARY_GUIDANCE_STATUS
        : { matchCount, preferredCount, notRecommendedCount },
    );

    return () => {
      setCatGlossaryGuidanceStatus(EMPTY_CAT_GLOSSARY_GUIDANCE_STATUS);
    };
  }, [isConcordanceLoading, matchCount, preferredCount, notRecommendedCount]);

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

  /**
   * Ref attached to the Translation Memory section element. When scrollToTm is
   * true the panel scrolls it into view so the TM matches are immediately
   * visible in Translator persona without any manual scrolling.
   */
  const tmSectionRef = useRef<HTMLDivElement>(null);
  const lastScrolledSegmentIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!scrollToTm) {
      lastScrolledSegmentIdRef.current = null;
      return;
    }
    const currentSegmentKey = segmentId ?? "__default__";
    if (lastScrolledSegmentIdRef.current === currentSegmentKey) {
      return;
    }
    const el = tmSectionRef.current;
    if (!el) {
      return;
    }
    // Use "nearest" so the panel container does not jump if TM is already visible.
    el.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
    lastScrolledSegmentIdRef.current = currentSegmentKey;
  }, [scrollToTm, segmentId, isConcordanceLoading, intelligence.translationMemoryMatches]);

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
  const isRefreshMode = hasAttemptedAgentLookup && Boolean(onRefreshContext);

  function handleUseTmMatch(match: ContentEditorTranslationMemoryMatch) {
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

  const canEditMaxLength = canEditTranslations && !isTranslationLocked && Boolean(onSetMaxLength);

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col bg-background",
        embedded ? "" : "lg:border-l lg:border-border",
      )}
    >
      <div className={cn("px-4 py-3", embedded ? "pt-3" : "border-b border-border")}>
        <div className="flex items-center gap-2">
          <LightbulbIcon className="size-4 text-beam-700" />
          <h2 className="min-w-0 flex-1 text-sm font-semibold text-foreground">
            <FormattedMessage {...contentEditorIntelligencePanelMessages.panelTitle} />
          </h2>
        </div>
        {embedded ? null : (
          <p className="mt-1 text-xs text-subtle-foreground">
            <FormattedMessage {...contentEditorIntelligencePanelMessages.panelDescription} />
          </p>
        )}
        {onFindContext ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3 w-full justify-center"
            onClick={isRefreshMode ? onRefreshContext : onFindContext}
            disabled={!canTriggerFindContext}
            title={intl.formatMessage(
              isRefreshMode
                ? contentEditorEditorPanelMessages.refreshContextTitle
                : canLookupFreshContext
                  ? contentEditorEditorPanelMessages.findContextTitle
                  : contentEditorEditorPanelMessages.findContextUnavailableTitle,
            )}
          >
            {isLookingUpContext ? (
              <>
                <Spinner className="size-3.5" />
                <FormattedMessage {...contentEditorEditorPanelMessages.findingContext} />
              </>
            ) : isRefreshMode ? (
              <>
                <ArrowClockwiseIcon className="size-3.5" />
                <FormattedMessage {...contentEditorFindContextMessages.refreshContext} />
              </>
            ) : (
              <>
                <ListMagnifyingGlassIcon className="size-3.5" />
                <FormattedMessage {...contentEditorEditorPanelMessages.findContext} />
                <ContentEditorEditorShortcutKbd shortcut="findContext" isMac={isMac} />
              </>
            )}
          </Button>
        ) : null}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 p-4">
          <PanelSection
            title={intl.formatMessage(contentEditorIntelligencePanelMessages.fileContextTitle)}
            icon={FileIcon}
          >
            {hasFileContext ? (
              <ContentEditorExpandableContent key={segmentId ?? segmentKey ?? "__default__"}>
                <MarkdownContent
                  value={intelligence.productMeaning ?? ""}
                  contentClassName="px-0 py-0 text-sm leading-relaxed text-foreground"
                  ariaLabel={intl.formatMessage(
                    contentEditorIntelligencePanelMessages.fileContextAria,
                  )}
                />
              </ContentEditorExpandableContent>
            ) : (
              <p className="text-sm leading-relaxed text-subtle-foreground">
                <FormattedMessage {...contentEditorIntelligencePanelMessages.noFileContext} />
              </p>
            )}
          </PanelSection>

          {isConcordanceLoading ? (
            <div ref={tmSectionRef}>
              <PanelSection
                title={intl.formatMessage(contentEditorIntelligencePanelMessages.translationMemory)}
                icon={DatabaseIcon}
                padded={false}
              >
                <ConcordanceSkeleton />
              </PanelSection>
            </div>
          ) : null}

          {!isConcordanceLoading &&
          intelligence.translationMemoryMatches &&
          intelligence.translationMemoryMatches.length > 0 ? (
            <div ref={tmSectionRef}>
              <PanelSection
                title={intl.formatMessage(contentEditorIntelligencePanelMessages.translationMemory)}
                icon={DatabaseIcon}
                padded={false}
                badge={
                  <Badge variant="success" className="h-5 px-1.5 text-[10px] font-medium">
                    {intl.formatMessage(
                      contentEditorIntelligencePanelMessages.translationMemoryMatchCount,
                      { count: intelligence.translationMemoryMatches.length },
                    )}
                  </Badge>
                }
              >
                <TranslationMemoryMatchList
                  key={segmentId ?? segmentKey ?? "__default__"}
                  matches={intelligence.translationMemoryMatches}
                  onUse={
                    canEditTranslations && !isTranslationLocked && onUseTmMatch
                      ? handleUseTmMatch
                      : undefined
                  }
                />
              </PanelSection>
            </div>
          ) : null}

          <ContentEditorVisualContextPanel
            visualContext={intelligence.visualContext}
            isLoading={isVisualContextLoading}
            showPanel={showVisualContext}
          />

          <ContentEditorLottieContextPanel activeSegmentKey={segmentKey} />

          {showMaxLengthEditor ? (
            <PanelSection
              title={intl.formatMessage(contentEditorIntelligencePanelMessages.maxLengthTitle)}
              icon={TextTIcon}
            >
              <ContentEditorSegmentMaxLengthEditor
                maxLength={intelligence.maxLength}
                canEdit={canEditMaxLength}
                isSaving={isMaxLengthSaving}
                characterCount={countRunes(targetText)}
                onSave={async (maxLength) => {
                  await (onSetMaxLength ?? (async () => undefined))(maxLength);
                }}
              />
            </PanelSection>
          ) : null}

          {showAgentContext ? (
            <PanelSection
              title={intl.formatMessage(contentEditorIntelligencePanelMessages.agentContextTitle)}
              icon={ListMagnifyingGlassIcon}
            >
              {isLookingUpContext ? (
                <AgentContextSkeleton />
              ) : hasAgentContext ? (
                <ContentEditorExpandableContent key={segmentId ?? segmentKey ?? "__default__"}>
                  <div className="space-y-3">
                    {hasAgentInsight ? (
                      <div className="min-h-[1.25rem] space-y-2">
                        <MarkdownContent
                          value={intelligence.agentContext ?? ""}
                          contentClassName="min-h-[1.25rem] px-0 py-0 text-sm leading-relaxed text-foreground"
                          ariaLabel={intl.formatMessage(
                            contentEditorIntelligencePanelMessages.agentContextAria,
                          )}
                        />
                        {intelligence.intent ? (
                          <MarkdownContent
                            value={intelligence.intent}
                            contentClassName="min-h-[1rem] px-0 py-0 text-xs leading-relaxed text-muted-foreground"
                            ariaLabel={intl.formatMessage(
                              contentEditorIntelligencePanelMessages.translationIntentAria,
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
                </ContentEditorExpandableContent>
              ) : (
                <p className="text-sm leading-relaxed text-subtle-foreground">
                  <FormattedMessage
                    {...contentEditorIntelligencePanelMessages.noRepositoryContext}
                  />
                </p>
              )}
            </PanelSection>
          ) : null}
        </div>
      </ScrollArea>

      {isGlossaryPanelOpen ? (
        <section
          className="fixed inset-x-2 bottom-[calc(var(--app-shell-plan-footer-height)+0.5rem)] z-50 flex h-[min(44rem,calc(100svh-var(--app-shell-plan-footer-height)-1rem))] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl shadow-black/15 sm:inset-x-auto sm:right-3 sm:w-[38rem]"
          aria-label={intl.formatMessage(contentEditorIntelligencePanelMessages.glossaryGuidance)}
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
                onClick={() => setAddingConceptTeamId(null)}
              >
                <ArrowLeftIcon className="size-3.5" />
              </Button>
            ) : null}
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-base font-medium text-foreground">
                {addingConceptTeamId ? (
                  <FormattedMessage
                    {...contentEditorIntelligencePanelMessages.addToGlossaryTitle}
                  />
                ) : (
                  <FormattedMessage {...contentEditorIntelligencePanelMessages.glossaryGuidance} />
                )}
              </h2>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={intl.formatMessage(
                contentEditorIntelligencePanelMessages.glossaryGuidanceClose,
              )}
              onClick={closeGlossaryPanel}
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
                      {...contentEditorIntelligencePanelMessages.glossaryGuidanceDescription}
                    />
                  </p>
                  {isConcordanceLoading ? (
                    <ConcordanceSkeleton />
                  ) : showGlobalEmpty ? (
                    <div className="flex min-h-56 flex-col items-center justify-center rounded-xl bg-muted/30 px-6 text-center">
                      <BookOpenTextIcon
                        className="size-7 text-muted-foreground"
                        aria-hidden="true"
                      />
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
                                      onClick={() => setAddingConceptTeamId(team.id)}
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
              <FormattedMessage {...contentEditorIntelligencePanelMessages.lowMatchConfirmTitle} />
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingLowMatch ? (
                <FormattedMessage
                  {...contentEditorIntelligencePanelMessages.lowMatchConfirmDescription}
                  values={{ matchPercent: pendingLowMatch.matchPercent }}
                />
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <FormattedMessage {...contentEditorIntelligencePanelMessages.cancel} />
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmLowMatchApply}>
              <FormattedMessage {...contentEditorIntelligencePanelMessages.lowMatchConfirmAction} />
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
