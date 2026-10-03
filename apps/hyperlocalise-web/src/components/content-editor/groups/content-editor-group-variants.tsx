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
import { useEffect, useState, type ReactNode } from "react";
import { observer } from "mobx-react-lite";
import { FormattedMessage, useIntl } from "react-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { CatGroupOccurrence, CatGroupVariant } from "@/lib/go-svc/go-svc-cat-groups.types";
import { cn } from "@/lib/primitives/cn";
import type { ContentEditorSegment } from "@/components/content-editor/shared/types";

import { MultilingualDrafts } from "../multilingual/content-editor-multilingual-drafts";
import { useOptionalCatWorkspace } from "../workspace/content-editor-workspace-context";
import { useContentEditorGrouping } from "./content-editor-grouping-context";
import { groupMessages as m } from "./content-editor-groups.messages";
import {
  useContentEditorGroupVariants,
  useHasGroupTranslationVariants,
} from "./use-content-editor-group-variants";

const VISIBLE_OCCURRENCE_KEYS = 3;

/**
 * Shows one target input per distinct translation when the identical strings behind a
 * grouped row disagree. Otherwise renders `children`, the layout's normal target input,
 * which saves to every occurrence.
 */
export function ContentEditorGroupVariantsGate({
  segment,
  locale,
  children,
  className,
}: {
  segment: ContentEditorSegment;
  locale: string;
  children: ReactNode;
  className?: string;
}) {
  const divergent = useHasGroupTranslationVariants(segment, locale);
  if (!divergent) return children;
  return (
    <GroupVariantsContent segment={segment} locale={locale} className={className}>
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
  className,
  children,
}: {
  segment: ContentEditorSegment;
  locale: string;
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
      className={className}
      segment={segment}
      locale={locale}
      variants={variants.data}
    />
  );
}

export function ContentEditorGroupVariantList({
  segment,
  locale,
  variants,
  className,
}: {
  segment: ContentEditorSegment;
  locale: string;
  variants: CatGroupVariant[];
  className?: string;
}) {
  const allUnlocked = variants.flatMap((variant) =>
    variant.occurrences.filter((occurrence) => !occurrence.isLocked),
  );
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="space-y-1">
        <p className="font-medium text-sm">
          <FormattedMessage {...m.variantsHeading} values={{ count: variants.length }} />
        </p>
        <p className="text-muted-foreground text-xs">
          <FormattedMessage {...m.variantsHint} />
        </p>
      </div>
      {variants.map((variant) => (
        <VariantEditor
          key={variantIdentity(variant)}
          segment={segment}
          locale={locale}
          variant={variant}
          allUnlocked={allUnlocked}
        />
      ))}
    </div>
  );
}

function variantIdentity(variant: CatGroupVariant) {
  return `${variant.occurrences[0]?.id ?? ""}:${variant.text}`;
}

/**
 * Variant drafts live in the workspace's multilingual draft store so they survive row
 * changes and count as unsaved work for the leave-page prompt.
 */
function useVariantDraft(segment: ContentEditorSegment, locale: string, variant: CatGroupVariant) {
  const workspace = useOptionalCatWorkspace();
  const grouping = useContentEditorGrouping();
  const [fallback] = useState(() => new MultilingualDrafts());
  const drafts = workspace?.multilingualDrafts ?? fallback;
  const key = JSON.stringify([
    "group-variant",
    grouping?.projectId ?? "",
    segment.id,
    locale,
    variantIdentity(variant),
  ]);
  useEffect(() => {
    drafts.get(key, variant.text);
    return () => drafts.release(key);
  }, [drafts, key, variant.text]);
  return drafts.cells.get(key);
}

const VariantEditor = observer(function VariantEditor({
  segment,
  locale,
  variant,
  allUnlocked,
}: {
  segment: ContentEditorSegment;
  locale: string;
  variant: CatGroupVariant;
  allUnlocked: CatGroupOccurrence[];
}) {
  const intl = useIntl();
  const grouping = useContentEditorGrouping();
  const draft = useVariantDraft(segment, locale, variant);
  const [pendingAction, setPendingAction] = useState<"save" | "approve" | "all" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const unlocked = variant.occurrences.filter((occurrence) => !occurrence.isLocked);
  const canEdit = Boolean(grouping?.canEdit) && unlocked.length > 0;
  const text = draft?.text ?? variant.text;
  const savedText = draft?.savedText ?? variant.text;
  const hasText = text.trim().length > 0;
  const pending = pendingAction !== null || Boolean(draft?.saving);
  const hidden = variant.occurrences.length - VISIBLE_OCCURRENCE_KEYS;

  const save = async (
    action: "save" | "approve" | "all",
    occurrences: CatGroupOccurrence[],
    approve: boolean,
  ) => {
    if (!grouping || occurrences.length === 0) return;
    setPendingAction(action);
    setError(null);
    const write = (value: string) =>
      grouping.saveVariant({ segment, locale, occurrences, text: value, approve });
    try {
      if (!draft || text === savedText) await write(text);
      else {
        await draft.save(write);
        if (draft.error) setError(draft.error);
      }
    } catch (saveError) {
      setError(
        saveError instanceof Error && saveError.message
          ? saveError.message
          : intl.formatMessage(m.saveFailed),
      );
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <div className="space-y-2 rounded-md border border-border p-2.5">
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="font-medium">
          <FormattedMessage {...m.occurrences} values={{ count: variant.occurrences.length }} />
        </span>
        {!variant.text ? (
          <Badge variant="outline">
            <FormattedMessage {...m.untranslated} />
          </Badge>
        ) : variant.isApproved ? (
          <Badge variant="secondary">
            <FormattedMessage {...m.approved} />
          </Badge>
        ) : null}
        {unlocked.length === 0 ? (
          <Badge variant="warning">
            <FormattedMessage {...m.locked} />
          </Badge>
        ) : null}
      </div>
      <ul className="space-y-0.5 text-muted-foreground text-xs">
        {variant.occurrences.slice(0, VISIBLE_OCCURRENCE_KEYS).map((occurrence) => (
          <li key={occurrence.id} className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-mono">{occurrence.key}</span>
            <span className="truncate">{occurrence.sourcePath}</span>
            {occurrence.isLocked && unlocked.length > 0 ? (
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
      <Textarea
        value={text}
        onChange={(event) => {
          draft?.change(event.target.value);
          setError(null);
        }}
        placeholder={intl.formatMessage(m.placeholder)}
        aria-label={intl.formatMessage(m.occurrences, { count: variant.occurrences.length })}
        disabled={!canEdit || pending}
        lang={locale}
        className="min-h-16 text-sm"
      />
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
      {canEdit ? (
        <div className="flex flex-wrap justify-end gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending || !hasText}
            onClick={() => void save("all", allUnlocked, false)}
          >
            <FormattedMessage {...m.applyToAll} />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending || !hasText || text === savedText}
            onClick={() => void save("save", unlocked, false)}
          >
            <FormattedMessage {...m.saveDraft} />
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={pending || !hasText || (variant.isApproved && text === savedText)}
            onClick={() => void save("approve", unlocked, true)}
          >
            <FormattedMessage {...m.approve} />
          </Button>
        </div>
      ) : null}
    </div>
  );
});
