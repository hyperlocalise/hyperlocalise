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
  createContext,
  createElement,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { ContentEditorSectionErrorBoundary } from "@/components/content-editor/workspace/content-editor-section-error-boundary";
import {
  LightbulbIcon,
  DatabaseIcon,
  FileIcon,
  ArrowClockwiseIcon,
  ListMagnifyingGlassIcon,
  TextTIcon,
  type Icon,
} from "@phosphor-icons/react";
import { useHotkeys } from "react-hotkeys-hook";
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
import { ContentEditorEditorShortcutKbd } from "@/components/content-editor/editor/content-editor-editor-shortcut-kbd";
import {
  getCatShortcutHotkey,
  type ContentEditorShortcutId,
} from "@/components/content-editor/editor/content-editor-keyboard-shortcuts";
import { ContentEditorShortcutHint } from "@/components/content-editor/editor/content-editor-shortcut-hints";
import { contentEditorFindContextMessages } from "@/components/content-editor/shared/content-editor-chrome.messages";
import { useIsMac } from "@/hooks/use-is-mac";
import { cn } from "@/lib/primitives/cn";
import { countRunes } from "@/lib/qa/count-runes";

import {
  contentEditorEditorPanelMessages,
  contentEditorIntelligencePanelMessages,
} from "@/components/content-editor/shared/content-editor.messages";
import { isContentEditorAssetContentKind } from "@/components/content-editor/shared/content-editor-content-kind";
import type {
  ContentEditorContentKind,
  ContentEditorSegmentIntelligence,
  ContentEditorTmMatchKind,
  ContentEditorTranslationMemoryMatch,
} from "@/components/content-editor/shared/types";

import { ContentEditorEditTmSegmentButton } from "./content-editor-edit-tm-segment";
import { requiresLowMatchConfirmation } from "./tm-match-quality";
import { ContentEditorLottieContextPanel } from "./content-editor-lottie-context-panel";
import {
  ContentEditorExpandableContent,
  ContentEditorShowLessButton,
  ContentEditorShowMoreFade,
} from "./content-editor-show-more-fade";
import { ContentEditorUnicodePanel } from "./content-editor-unicode-panel";
import { ContentEditorVisualContextPanel } from "./content-editor-visual-context-panel";

const PanelSectionResetKeyContext = createContext<string | null>(null);

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
  const resetKey = useContext(PanelSectionResetKeyContext);
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
      <div className={padded ? "px-3.5 py-3" : undefined}>
        <ContentEditorSectionErrorBoundary
          section={`intelligence.${title}`}
          className={padded ? undefined : "m-3"}
          resetKeys={[resetKey]}
        >
          {children}
        </ContentEditorSectionErrorBoundary>
      </div>
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
  useShortcut,
  organizationSlug,
  projectId,
  sourceLocale,
  onTmSegmentMutated,
}: {
  match: ContentEditorTranslationMemoryMatch;
  onUse?: (match: ContentEditorTranslationMemoryMatch) => void;
  useShortcut?: ContentEditorShortcutId;
  organizationSlug?: string;
  projectId?: string;
  sourceLocale?: string;
  onTmSegmentMutated?: () => void;
}) {
  const intl = useIntl();
  const canOpenEditor = Boolean(
    match.canEdit && match.segmentRef && organizationSlug && projectId && sourceLocale,
  );

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
        <div className="flex shrink-0 items-center gap-1">
          {canOpenEditor && organizationSlug && projectId && sourceLocale ? (
            <ContentEditorEditTmSegmentButton
              match={match}
              organizationSlug={organizationSlug}
              projectId={projectId}
              sourceLocale={sourceLocale}
              onMutated={onTmSegmentMutated}
            />
          ) : null}
          {onUse ? (
            <Button
              variant="outline"
              size="sm"
              className="relative h-8 shrink-0"
              onClick={() => onUse(match)}
            >
              <FormattedMessage {...contentEditorIntelligencePanelMessages.useTmMatch} />
              {useShortcut ? <ContentEditorShortcutHint shortcut={useShortcut} /> : null}
            </Button>
          ) : null}
        </div>
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
const TM_MATCH_SHORTCUTS = ["useSuggestion1", "useSuggestion2", "useSuggestion3"] as const;
const TM_MATCH_SHORTCUT_DIGITS = ["Digit1", "Digit2", "Digit3"];

function TranslationMemoryMatchList({
  matches,
  onUse,
  organizationSlug,
  projectId,
  sourceLocale,
  onTmSegmentMutated,
}: {
  matches: ContentEditorTranslationMemoryMatch[];
  onUse?: (match: ContentEditorTranslationMemoryMatch) => void;
  organizationSlug?: string;
  projectId?: string;
  sourceLocale?: string;
  onTmSegmentMutated?: () => void;
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
        {visibleMatches.map((match, index) => (
          <TranslationMemoryRow
            key={match.id}
            match={match}
            onUse={onUse}
            useShortcut={onUse ? TM_MATCH_SHORTCUTS[index] : undefined}
            organizationSlug={organizationSlug}
            projectId={projectId}
            sourceLocale={sourceLocale}
            onTmSegmentMutated={onTmSegmentMutated}
          />
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
  contentKind,
  targetText = "",
  sourceLocale,
  organizationSlug,
  projectId,
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
  onTmSegmentMutated,
  canTriggerFindContext = false,
  onFindContext,
  scrollToTm = false,
  canUploadVisualContext = false,
  isUploadingVisualContext = false,
  onUploadVisualContext,
  onInsertCharacter,
}: {
  intelligence: ContentEditorSegmentIntelligence;
  segmentId?: string;
  segmentKey?: string;
  contentKind?: ContentEditorContentKind;
  targetText?: string;
  sourceLocale?: string;
  organizationSlug?: string;
  projectId?: string;
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
  onTmSegmentMutated?: () => void;
  /** False while another action is in flight or lookup is unavailable. */
  canTriggerFindContext?: boolean;
  /** Renders the Find context button in the panel header when provided. */
  onFindContext?: () => void;
  /**
   * When true, the panel scrolls to the Translation Memory section on mount.
   * Enabled in Translator persona so TM matches are immediately visible.
   */
  scrollToTm?: boolean;
  canUploadVisualContext?: boolean;
  isUploadingVisualContext?: boolean;
  onUploadVisualContext?: (file: File) => void | Promise<void>;
  onInsertCharacter?: (character: string) => void;
}) {
  const intl = useIntl();
  const isMac = useIsMac();
  const [pendingLowMatch, setPendingLowMatch] =
    useState<ContentEditorTranslationMemoryMatch | null>(null);
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

  const canUseTmMatchShortcuts =
    canEditTranslations &&
    !isTranslationLocked &&
    Boolean(onUseTmMatch) &&
    !isConcordanceLoading &&
    pendingLowMatch === null;
  const tmMatches = intelligence.translationMemoryMatches;
  useHotkeys(
    TM_MATCH_SHORTCUTS.map((shortcut) => getCatShortcutHotkey(shortcut)).join(", "),
    (event) => {
      const index = TM_MATCH_SHORTCUT_DIGITS.indexOf(event.code);
      const match = index >= 0 ? tmMatches?.[index] : undefined;
      if (match) {
        handleUseTmMatch(match);
      }
    },
    {
      enabled: canUseTmMatchShortcuts && Boolean(tmMatches?.length),
      enableOnFormTags: false,
      enableOnContentEditable: true,
      preventDefault: true,
    },
    [canUseTmMatchShortcuts, tmMatches, handleUseTmMatch],
  );

  function confirmLowMatchApply() {
    if (pendingLowMatch && onUseTmMatch) {
      onUseTmMatch(pendingLowMatch);
    }
    setPendingLowMatch(null);
  }

  const canEditMaxLength = canEditTranslations && !isTranslationLocked && Boolean(onSetMaxLength);
  const sectionResetKey = segmentId ?? segmentKey ?? null;

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
        <PanelSectionResetKeyContext.Provider value={sectionResetKey}>
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
                  title={intl.formatMessage(
                    contentEditorIntelligencePanelMessages.translationMemory,
                  )}
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
                  title={intl.formatMessage(
                    contentEditorIntelligencePanelMessages.translationMemory,
                  )}
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
                    organizationSlug={
                      canEditTranslations && !isTranslationLocked ? organizationSlug : undefined
                    }
                    projectId={canEditTranslations && !isTranslationLocked ? projectId : undefined}
                    sourceLocale={
                      canEditTranslations && !isTranslationLocked ? sourceLocale : undefined
                    }
                    onTmSegmentMutated={onTmSegmentMutated}
                    onUse={
                      canEditTranslations && !isTranslationLocked && onUseTmMatch
                        ? handleUseTmMatch
                        : undefined
                    }
                  />
                </PanelSection>
              </div>
            ) : null}

            <ContentEditorSectionErrorBoundary
              section="intelligence.visualContext"
              resetKeys={[sectionResetKey]}
            >
              <ContentEditorVisualContextPanel
                visualContext={intelligence.visualContext}
                isLoading={isVisualContextLoading}
                showPanel={showVisualContext}
                canUpload={canUploadVisualContext && !isTranslationLocked}
                isUploading={isUploadingVisualContext}
                onUpload={onUploadVisualContext}
              />
            </ContentEditorSectionErrorBoundary>

            <ContentEditorSectionErrorBoundary
              section="intelligence.lottieContext"
              resetKeys={[sectionResetKey]}
            >
              <ContentEditorLottieContextPanel activeSegmentKey={segmentKey} />
            </ContentEditorSectionErrorBoundary>

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

            {embedded || isContentEditorAssetContentKind(contentKind) ? null : (
              <ContentEditorUnicodePanel
                canInsert={canEditTranslations && !isTranslationLocked}
                onInsertCharacter={onInsertCharacter}
              />
            )}
          </div>
        </PanelSectionResetKeyContext.Provider>
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
