"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License 1.1,
 * use of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import {
  ArrowClockwiseIcon,
  CaretDownIcon,
  CheckIcon,
  CopyIcon,
  EraserIcon,
  InfoIcon,
  LockSimpleIcon,
  SparkleIcon,
} from "@phosphor-icons/react";
import { observer } from "mobx-react-lite";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import { UpgradePlanButton } from "@/components/billing/upgrade-plan-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useIsMac } from "@/hooks/use-is-mac";
import { useAiFeaturesUpgradeHref } from "@/lib/billing/ai-features-upgrade-href";
import type { CatGroupVariant } from "@/lib/go-svc/go-svc-cat-groups.types";
import { cn } from "@/lib/primitives/cn";
import { contentEditorEditorPanelMessages } from "@/components/content-editor/shared/content-editor.messages";
import type {
  ContentEditorSegment,
  ContentEditorSegmentIntelligence,
} from "@/components/content-editor/shared/types";

import { ContentEditorEditorShortcutKbd } from "../editor/content-editor-editor-shortcut-kbd";
import { ContentEditorTargetEditor } from "../editor/content-editor-target-editor";
import { MultilingualDrafts } from "../multilingual/content-editor-multilingual-drafts";
import { GenerateAiSuggestionButton } from "../side-by-side/content-editor-side-by-side-ai-suggestion";
import { ContentEditorSideBySideInlineQa } from "../side-by-side/content-editor-side-by-side-inline-qa";
import {
  qaHighlightTokens,
  replacesQaTermAsWholeWord,
} from "../side-by-side/content-editor-side-by-side-qa";
import { useOptionalCatWorkspace } from "../workspace/content-editor-workspace-context";
import {
  ContentEditorGroupVariants,
  type ContentEditorGroupVariant,
  type ContentEditorGroupVariantsPorts,
} from "./content-editor-group-variants-store";
import { useContentEditorGrouping } from "./content-editor-grouping-context";
import { groupMessages as m } from "./content-editor-groups.messages";
import {
  useContentEditorGroupVariants,
  useHasGroupTranslationVariants,
} from "./use-content-editor-group-variants";

const VISIBLE_OCCURRENCE_KEYS = 3;
const SKELETON_VARIANT_COUNT = 2;

/** The row's AI recommendation; the source is identical, so one suggestion fits every translation. */
export type ContentEditorGroupVariantsAi = {
  intelligence: ContentEditorSegmentIntelligence;
  isLoading: boolean;
  error?: string;
  onGenerateAiRecommendation?: () => void;
};

/**
 * Shows one target input per distinct translation when the identical strings behind a
 * grouped row disagree. Otherwise renders `children`, the layout's normal target input,
 * which saves to every occurrence.
 */
export function ContentEditorGroupVariantsGate({
  segment,
  locale,
  ai,
  actions,
  children,
  className,
}: {
  segment: ContentEditorSegment;
  locale: string;
  ai?: ContentEditorGroupVariantsAi;
  /** Row-level controls (e.g. the string menu) shown at the end of the variants header. */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const divergent = useHasGroupTranslationVariants(segment, locale);
  if (!divergent) return children;
  return (
    <GroupVariantsContent
      segment={segment}
      locale={locale}
      ai={ai}
      actions={actions}
      className={className}
    >
      {children}
    </GroupVariantsContent>
  );
}

/**
 * Multilingual cells are one line tall, so a divergent cell shows a summary and opens its
 * translations in a popover while the cell is active.
 */
export function ContentEditorGroupVariantsCell({
  segment,
  locale,
  active,
  onActivate,
  onClose,
}: {
  segment: ContentEditorSegment;
  locale: string;
  active: boolean;
  onActivate: () => void;
  onClose: () => void;
}) {
  return (
    <Popover
      open={active}
      onOpenChange={(open) => {
        if (open) onActivate();
        else onClose();
      }}
    >
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-full w-full justify-start rounded-none px-3 font-normal text-xs"
          />
        }
      >
        <ContentEditorDifferentTranslationsBadge />
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-[min(32rem,70vh)] w-[28rem] overflow-y-auto">
        <GroupVariantsContent segment={segment} locale={locale}>
          {null}
        </GroupVariantsContent>
      </PopoverContent>
    </Popover>
  );
}

export function ContentEditorDifferentTranslationsBadge({ className }: { className?: string }) {
  return (
    <Badge variant="warning" className={cn("h-5 px-1.5 font-normal text-[0.625rem]", className)}>
      <FormattedMessage {...m.differentTranslations} />
    </Badge>
  );
}

function GroupVariantsContent({
  segment,
  locale,
  ai,
  actions,
  className,
  children,
}: {
  segment: ContentEditorSegment;
  locale: string;
  ai?: ContentEditorGroupVariantsAi;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const workspace = useOptionalCatWorkspace();
  const variants = useContentEditorGroupVariants({ segment, locale });
  const hideSingleTarget =
    variants.isPending || variants.isError || (variants.data?.length ?? 0) > 1;

  useEffect(() => {
    if (!workspace) return;
    return () => {
      workspace.groupVariants.dropHeld(segment.id, locale);
    };
  }, [workspace, segment.id, locale]);

  useEffect(() => {
    if (!workspace) return;
    if (hideSingleTarget) {
      return workspace.groupVariants.expect(segment.id, locale);
    }
    const held = workspace.groupVariants.takeHeldText(segment.id, locale);
    if (held) workspace.setTargetText(segment.id, held);
  }, [workspace, hideSingleTarget, segment.id, locale]);

  if (variants.isPending) {
    return <GroupVariantsSkeleton className={className} />;
  }
  if (variants.isError) {
    return (
      <div className={cn("flex flex-wrap items-center gap-2 text-sm", className)}>
        <span className="text-destructive">
          <FormattedMessage {...m.loadFailed} />
        </span>
        <Button type="button" variant="outline" size="sm" onClick={() => void variants.refetch()}>
          <FormattedMessage {...m.retry} />
        </Button>
      </div>
    );
  }
  // The queue summary can be stale after another save; trust the fresh variant list.
  if (variants.data.length <= 1) return children;
  return (
    <ContentEditorGroupVariantList
      key={`${segment.id}:${locale}`}
      className={className}
      segment={segment}
      locale={locale}
      variants={variants.data}
      ai={ai}
      actions={actions}
    />
  );
}

/** Mirrors the loaded list's structure so the row does not jump when variants arrive. */
function GroupVariantsSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2", className)} aria-busy>
      <div className="flex min-h-8 items-center">
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="divide-y divide-border rounded-lg border border-border">
        {Array.from({ length: SKELETON_VARIANT_COUNT }, (_, index) => (
          <div key={index} className="space-y-2 p-2.5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-44" />
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-8 w-40" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Mount with a `key` per row and locale; the group model is bound to both. */
export const ContentEditorGroupVariantList = observer(function ContentEditorGroupVariantList({
  segment,
  locale,
  variants,
  ai,
  actions,
  className,
}: {
  segment: ContentEditorSegment;
  locale: string;
  variants: CatGroupVariant[];
  ai?: ContentEditorGroupVariantsAi;
  actions?: ReactNode;
  className?: string;
}) {
  const intl = useIntl();
  const workspace = useOptionalCatWorkspace();
  const grouping = useContentEditorGrouping();
  const ports: ContentEditorGroupVariantsPorts = {
    canEdit: Boolean(grouping?.canEdit),
    saveVariant: grouping?.saveVariant,
    services: workspace?.groupVariants.services,
    saveFailedMessage: intl.formatMessage(m.saveFailed),
  };
  const [group] = useState(
    () =>
      new ContentEditorGroupVariants({
        segment,
        locale,
        projectId: grouping?.projectId ?? "",
        variants,
        drafts: workspace?.multilingualDrafts ?? new MultilingualDrafts(),
        ports,
      }),
  );

  useEffect(() => {
    group.setPorts(ports);
  });
  useEffect(() => {
    group.sync(variants);
    group.attach();
    return () => group.release();
  }, [group, variants]);
  useEffect(() => workspace?.groupVariants.register(group), [workspace, group]);

  const hint = intl.formatMessage(m.variantsHint);

  return (
    <TooltipProvider>
      <div className={cn("flex flex-col gap-2", className)}>
        <div className="flex min-h-8 items-center gap-1">
          <p className="font-medium text-sm">
            <FormattedMessage {...m.variantsHeading} values={{ count: group.variants.length }} />
          </p>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="text-muted-foreground"
                  aria-label={hint}
                />
              }
            >
              <InfoIcon className="size-3.5" aria-hidden />
            </TooltipTrigger>
            <TooltipContent className="max-w-64">{hint}</TooltipContent>
          </Tooltip>
          <div className="ms-auto flex items-center gap-0.5">
            {ai ? <GroupVariantsAiTrigger group={group} ai={ai} /> : null}
            {actions}
          </div>
        </div>
        {ai ? <GroupVariantsAiSuggestion group={group} ai={ai} /> : null}
        {group.applyError ? <p className="text-destructive text-xs">{group.applyError}</p> : null}
        <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-background">
          {group.variants.map((variant) => (
            <VariantEditor key={variant.id} group={group} variant={variant} />
          ))}
        </div>
      </div>
    </TooltipProvider>
  );
});

/** Header control; matches the single-target sparkle so grouped rows don't reserve a card. */
const GroupVariantsAiTrigger = observer(function GroupVariantsAiTrigger({
  group,
  ai,
}: {
  group: ContentEditorGroupVariants;
  ai: ContentEditorGroupVariantsAi;
}) {
  const upgradeHref = useAiFeaturesUpgradeHref();
  if (upgradeHref) {
    return (
      <UpgradePlanButton
        organizationSlug={upgradeHref.organizationSlug}
        variant="ghost"
        size="xs"
      />
    );
  }
  const hasSuggestion = Boolean(ai.intelligence.aiSuggestion?.trim());
  if (hasSuggestion || ai.isLoading || ai.error || !group.canEdit) return null;
  if (!ai.onGenerateAiRecommendation) return null;
  return <GenerateAiSuggestionButton onClick={ai.onGenerateAiRecommendation} />;
});

const GroupVariantsAiSuggestion = observer(function GroupVariantsAiSuggestion({
  group,
  ai,
}: {
  group: ContentEditorGroupVariants;
  ai: ContentEditorGroupVariantsAi;
}) {
  const intl = useIntl();
  const upgradeHref = useAiFeaturesUpgradeHref();
  const suggestion = ai.intelligence.aiSuggestion?.trim() ?? "";
  if (upgradeHref || (!suggestion && !ai.isLoading && !ai.error)) return null;

  const hasEditableVariant = group.variants.some((variant) => variant.canEdit);
  const onRegenerate = group.canEdit ? ai.onGenerateAiRecommendation : undefined;
  const regenerateLabel = intl.formatMessage(contentEditorEditorPanelMessages.regenerate);

  return (
    <aside
      aria-label={intl.formatMessage(contentEditorEditorPanelMessages.aiRecommendation)}
      aria-busy={ai.isLoading}
      className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-muted/50 px-2.5 py-1.5"
    >
      <div className="flex min-w-24 flex-1 items-start gap-2">
        {ai.isLoading && !suggestion ? (
          <Spinner className="mt-0.5 size-3.5 shrink-0" />
        ) : (
          <SparkleIcon className="mt-0.5 size-3.5 shrink-0 text-grove-900" aria-hidden />
        )}
        {ai.error ? (
          <p className="line-clamp-1 text-destructive text-xs">{ai.error}</p>
        ) : suggestion ? (
          <p className="line-clamp-2 text-pretty text-xs">{suggestion}</p>
        ) : (
          <p className="text-muted-foreground text-xs">
            <FormattedMessage {...contentEditorEditorPanelMessages.generatingAiSuggestion} />
          </p>
        )}
      </div>
      <div className="ms-auto flex shrink-0 items-center gap-0.5">
        {suggestion && !ai.error && hasEditableVariant ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={ai.isLoading || !group.canApplyTextToAll}
              onClick={() => void group.applyTextToAll(suggestion)}
            >
              {group.isApplyingToAll ? (
                <Spinner className="size-3" />
              ) : (
                <CheckIcon className="size-3" aria-hidden />
              )}
              <FormattedMessage {...m.applySuggestionToAll} />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    disabled={ai.isLoading || group.isApplyingToAll}
                  />
                }
              >
                <FormattedMessage {...m.useInVariant} />
                <CaretDownIcon className="size-3" aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuGroup>
                  {group.variants.map((variant) => (
                    <DropdownMenuItem
                      key={variant.id}
                      disabled={!variant.canEdit || variant.pending}
                      onClick={() => group.useTextIn(variant.id, suggestion)}
                    >
                      <span className="truncate">
                        <FormattedMessage
                          {...m.useInVariantItem}
                          values={{
                            text: variant.savedText || intl.formatMessage(m.untranslated),
                            count: variant.variant.occurrences.length,
                          }}
                        />
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : null}
        {onRegenerate && (suggestion || ai.error) ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  disabled={ai.isLoading}
                  onClick={onRegenerate}
                  aria-label={regenerateLabel}
                />
              }
            >
              {ai.isLoading ? (
                <Spinner className="size-3" />
              ) : (
                <ArrowClockwiseIcon className="size-3.5" aria-hidden />
              )}
            </TooltipTrigger>
            <TooltipContent>{regenerateLabel}</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
    </aside>
  );
});

const VariantEditor = observer(function VariantEditor({
  group,
  variant,
}: {
  group: ContentEditorGroupVariants;
  variant: ContentEditorGroupVariant;
}) {
  const intl = useIntl();
  const isMac = useIsMac();
  const { segment } = group;
  const { occurrences } = variant.variant;
  const unlockedCount = variant.unlocked.length;
  const hidden = occurrences.length - VISIBLE_OCCURRENCE_KEYS;
  const firstIssue = variant.isCheckingFormat ? undefined : variant.qaIssues[0];
  const text = variant.text;
  const highlightTokens = useMemo(() => qaHighlightTokens(firstIssue, text), [firstIssue, text]);
  const showInlineQa = variant.isCheckingFormat || variant.qaIssues.length > 0;
  const occurrencesLabel = intl.formatMessage(m.occurrences, { count: occurrences.length });
  const lockedLabel = intl.formatMessage(m.locked);

  return (
    <div
      role="group"
      aria-label={occurrencesLabel}
      className={cn(
        "space-y-2 p-2.5 transition-colors",
        group.focusedVariantId === variant.id && "bg-muted/40",
      )}
      onFocus={() => group.focus(variant.id)}
      onKeyDown={(event) => {
        if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return;
        // Keeps the row-level ⌘↵ handler from approving the grouped row's single target.
        event.preventDefault();
        event.stopPropagation();
        void variant.approve();
      }}
    >
      <div className="flex min-h-6 items-center gap-1.5 text-xs">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <span className="font-medium">{occurrencesLabel}</span>
          {!variant.variant.text ? (
            <Badge variant="outline">
              <FormattedMessage {...m.untranslated} />
            </Badge>
          ) : variant.variant.isApproved ? (
            <Badge variant="secondary">
              <FormattedMessage {...m.approved} />
            </Badge>
          ) : null}
          {unlockedCount === 0 ? <Badge variant="warning">{lockedLabel}</Badge> : null}
        </div>
        {variant.canEdit ? (
          <div className="flex shrink-0 items-center">
            <VariantIconButton
              label={intl.formatMessage(contentEditorEditorPanelMessages.copySource)}
              disabled={variant.pending}
              onClick={() => variant.copySource()}
            >
              <CopyIcon className="size-3.5" aria-hidden />
            </VariantIconButton>
            <VariantIconButton
              label={intl.formatMessage(contentEditorEditorPanelMessages.clearTarget)}
              disabled={variant.pending || text.length === 0}
              onClick={() => variant.clear()}
            >
              <EraserIcon className="size-3.5" aria-hidden />
            </VariantIconButton>
          </div>
        ) : null}
      </div>
      <ul className="space-y-0.5 text-muted-foreground text-xs">
        {occurrences.slice(0, VISIBLE_OCCURRENCE_KEYS).map((occurrence) => (
          <li key={occurrence.id} className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-mono text-foreground/80">{occurrence.key}</span>
            <span className="truncate">{occurrence.sourcePath}</span>
            {occurrence.isLocked && unlockedCount > 0 ? (
              <LockSimpleIcon className="size-3 shrink-0" aria-label={lockedLabel} />
            ) : null}
          </li>
        ))}
        {hidden > 0 ? (
          <li>
            <FormattedMessage {...m.moreOccurrences} values={{ count: hidden }} />
          </li>
        ) : null}
      </ul>
      <ContentEditorTargetEditor
        sourceText={segment.sourceText}
        value={text}
        maxLength={variant.editorMaxLength}
        compact
        disabled={!variant.canEdit || variant.pending}
        ariaLabel={occurrencesLabel}
        highlightTokens={highlightTokens}
        highlightStatus={firstIssue?.status === "fail" ? "fail" : "warn"}
        highlightWholeTerm={replacesQaTermAsWholeWord(firstIssue)}
        onChange={(value) => variant.change(value)}
      />
      {showInlineQa ? (
        <ContentEditorSideBySideInlineQa
          formatChecks={variant.formatChecks}
          isLoading={variant.isCheckingFormat}
          targetText={text}
          onFix={variant.canEdit && !variant.pending ? (value) => variant.change(value) : undefined}
        />
      ) : null}
      {variant.displayError ? (
        <p className="text-destructive text-xs">{variant.displayError}</p>
      ) : null}
      {variant.canEdit ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            disabled={!variant.canApprove}
            onClick={() => void variant.approve()}
          >
            {variant.pendingAction === "approve" ? (
              <Spinner className="size-3.5 text-primary-foreground" />
            ) : null}
            <FormattedMessage {...m.approve} />
            <ContentEditorEditorShortcutKbd
              shortcut="approve"
              isMac={isMac}
              className="bg-primary-foreground/15 text-primary-foreground"
            />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!variant.canSave}
            onClick={() => void variant.saveDraft()}
          >
            {variant.pendingAction === "save" ? <Spinner className="size-3" /> : null}
            <FormattedMessage {...m.saveDraft} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ms-auto"
            disabled={!variant.canApplyToAll}
            onClick={() => void variant.applyToAll()}
          >
            {variant.pendingAction === "all" ? <Spinner className="size-3" /> : null}
            <FormattedMessage {...m.applyToAll} />
          </Button>
        </div>
      ) : null}
    </div>
  );
});

function VariantIconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            disabled={disabled}
            onClick={onClick}
            aria-label={label}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
