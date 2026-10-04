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
import { ArrowDown01Icon, Copy01Icon, EraserIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { observer } from "mobx-react-lite";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { FormattedMessage, useIntl } from "react-intl";

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
import { useIsMac } from "@/hooks/use-is-mac";
import type { CatGroupVariant } from "@/lib/go-svc/go-svc-cat-groups.types";
import { cn } from "@/lib/primitives/cn";
import { contentEditorEditorPanelMessages } from "@/components/content-editor/shared/content-editor.messages";
import type {
  ContentEditorSegment,
  ContentEditorSegmentIntelligence,
} from "@/components/content-editor/shared/types";

import { ContentEditorEditorAiRecommendation } from "../editor/content-editor-editor-ai-recommendation";
import { ContentEditorEditorShortcutKbd } from "../editor/content-editor-editor-shortcut-kbd";
import { ContentEditorTargetEditor } from "../editor/content-editor-target-editor";
import { MultilingualDrafts } from "../multilingual/content-editor-multilingual-drafts";
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
  children,
  className,
}: {
  segment: ContentEditorSegment;
  locale: string;
  ai?: ContentEditorGroupVariantsAi;
  children: ReactNode;
  className?: string;
}) {
  const divergent = useHasGroupTranslationVariants(segment, locale);
  if (!divergent) return children;
  return (
    <GroupVariantsContent segment={segment} locale={locale} ai={ai} className={className}>
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
  className,
  children,
}: {
  segment: ContentEditorSegment;
  locale: string;
  ai?: ContentEditorGroupVariantsAi;
  className?: string;
  children: ReactNode;
}) {
  const variants = useContentEditorGroupVariants({ segment, locale });
  if (variants.isPending) {
    return (
      <div className={cn("space-y-2", className)}>
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-20 w-full rounded-md" />
        <Skeleton className="h-20 w-full rounded-md" />
      </div>
    );
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
    />
  );
}

/** Mount with a `key` per row and locale; the group model is bound to both. */
export const ContentEditorGroupVariantList = observer(function ContentEditorGroupVariantList({
  segment,
  locale,
  variants,
  ai,
  className,
}: {
  segment: ContentEditorSegment;
  locale: string;
  variants: CatGroupVariant[];
  ai?: ContentEditorGroupVariantsAi;
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

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="space-y-1">
        <p className="font-medium text-sm">
          <FormattedMessage {...m.variantsHeading} values={{ count: group.variants.length }} />
        </p>
        <p className="text-muted-foreground text-xs">
          <FormattedMessage {...m.variantsHint} />
        </p>
      </div>
      {ai ? <GroupVariantsAiRecommendation group={group} ai={ai} /> : null}
      {group.applyError ? <p className="text-destructive text-xs">{group.applyError}</p> : null}
      {group.variants.map((variant) => (
        <VariantEditor key={variant.id} group={group} variant={variant} />
      ))}
    </div>
  );
});

const GroupVariantsAiRecommendation = observer(function GroupVariantsAiRecommendation({
  group,
  ai,
}: {
  group: ContentEditorGroupVariants;
  ai: ContentEditorGroupVariantsAi;
}) {
  const intl = useIntl();
  const suggestion = ai.intelligence.aiSuggestion ?? "";
  const hasEditableVariant = group.variants.some((variant) => variant.canEdit);

  return (
    <ContentEditorEditorAiRecommendation
      intelligence={ai.intelligence}
      isLoading={ai.isLoading}
      error={ai.error}
      onGenerateAiRecommendation={group.canEdit ? ai.onGenerateAiRecommendation : undefined}
      useActions={
        hasEditableVariant ? (
          <>
            <Button
              variant="outline"
              size="xs"
              disabled={ai.isLoading || !group.canApplyTextToAll}
              onClick={() => void group.applyTextToAll(suggestion)}
            >
              {group.isApplyingToAll ? (
                <Spinner className="size-3" />
              ) : (
                <HugeiconsIcon icon={Tick02Icon} className="size-3" aria-hidden />
              )}
              <FormattedMessage {...m.applySuggestionToAll} />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="xs"
                    disabled={ai.isLoading || group.isApplyingToAll}
                  />
                }
              >
                <FormattedMessage {...m.useInVariant} />
                <HugeiconsIcon icon={ArrowDown01Icon} className="size-3" aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-72">
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
        ) : null
      }
    />
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

  return (
    <div
      role="group"
      aria-label={occurrencesLabel}
      className={cn(
        "space-y-2 rounded-md border border-border p-2.5 transition-colors",
        group.focusedVariantId === variant.id && "border-foreground/30",
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
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
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
        {unlockedCount === 0 ? (
          <Badge variant="warning">
            <FormattedMessage {...m.locked} />
          </Badge>
        ) : null}
        {variant.canEdit ? (
          <div className="ms-auto flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={variant.pending}
              onClick={() => variant.copySource()}
            >
              <HugeiconsIcon icon={Copy01Icon} className="size-3" aria-hidden />
              <FormattedMessage {...contentEditorEditorPanelMessages.copySource} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={variant.pending || text.length === 0}
              onClick={() => variant.clear()}
            >
              <HugeiconsIcon icon={EraserIcon} className="size-3" aria-hidden />
              <FormattedMessage {...contentEditorEditorPanelMessages.clearTarget} />
            </Button>
          </div>
        ) : null}
      </div>
      <ul className="space-y-0.5 text-muted-foreground text-xs">
        {occurrences.slice(0, VISIBLE_OCCURRENCE_KEYS).map((occurrence) => (
          <li key={occurrence.id} className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-mono">{occurrence.key}</span>
            <span className="truncate">{occurrence.sourcePath}</span>
            {occurrence.isLocked && unlockedCount > 0 ? (
              <Badge variant="warning" className="shrink-0">
                <FormattedMessage {...m.locked} />
              </Badge>
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
        maxLength={segment.maxLength}
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
          onFix={variant.canEdit ? (value) => variant.change(value) : undefined}
        />
      ) : null}
      {variant.displayError ? (
        <p className="text-destructive text-xs">{variant.displayError}</p>
      ) : null}
      {variant.canEdit ? (
        <div className="flex flex-wrap justify-end gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!variant.canApplyToAll}
            onClick={() => void variant.applyToAll()}
          >
            <FormattedMessage {...m.applyToAll} />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!variant.canSave}
            onClick={() => void variant.saveDraft()}
          >
            <FormattedMessage {...m.saveDraft} />
          </Button>
          <Button
            type="button"
            size="sm"
            className="gap-2"
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
        </div>
      ) : null}
    </div>
  );
});
