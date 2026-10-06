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
import { FormattedMessage, useIntl } from "react-intl";
import { useQuery } from "@tanstack/react-query";

import { fetchProjectFileContentEditorLabels } from "@/components/content-editor/project-file/project-file-content-editor-api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import {
  EMPTY_ADVANCED_QUEUE_FILTER,
  advancedQueueFilterSupportsLabels,
  advancedQueueFilterSupportsPartialStatuses,
  advancedQueueFilterSupportsScreenshots,
  compactAdvancedQueueFilter,
  contentEditorAdvancedQueueFilterLabelLimit,
  nextAdvancedQueueFilterLabelIds,
  type ContentEditorAdvancedQueueFilter,
  type ContentEditorCatLabel,
} from "@/lib/projects/content-editor/content-editor-advanced-queue-filter";

import { contentEditorAdvancedFilterMessages as messages } from "./content-editor-advanced-filter.messages";

const noneValue = "__none__";

function FilterSelect({
  id,
  value,
  onValueChange,
  placeholder,
  items,
}: {
  id: string;
  value?: string;
  onValueChange: (value: string | undefined) => void;
  placeholder: string;
  items: { value: string; label: string }[];
}) {
  return (
    <Select
      value={value ?? noneValue}
      onValueChange={(next) => onValueChange(!next || next === noneValue ? undefined : next)}
    >
      <SelectTrigger id={id} size="sm" className="w-full min-w-0">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={noneValue}>{placeholder}</SelectItem>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function DateRangeFields({
  fromId,
  toId,
  from,
  to,
  fromLabel,
  toLabel,
  onFromChange,
  onToChange,
}: {
  fromId: string;
  toId: string;
  from?: string;
  to?: string;
  fromLabel: string;
  toLabel: string;
  onFromChange: (value: string | undefined) => void;
  onToChange: (value: string | undefined) => void;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Input
        id={fromId}
        type="date"
        value={from ?? ""}
        aria-label={fromLabel}
        onChange={(event) => onFromChange(event.target.value || undefined)}
        className="h-8 min-w-0 flex-1"
      />
      <span className="text-muted-foreground" aria-hidden>
        –
      </span>
      <Input
        id={toId}
        type="date"
        value={to ?? ""}
        aria-label={toLabel}
        onChange={(event) => onToChange(event.target.value || undefined)}
        className="h-8 min-w-0 flex-1"
      />
    </div>
  );
}

function LabelMultiSelect({
  labels,
  selectedIds,
  onChange,
  placeholder,
}: {
  labels: ContentEditorCatLabel[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  placeholder: string;
}) {
  const intl = useIntl();
  const selected = new Set(selectedIds);
  const atLimit = selectedIds.length >= contentEditorAdvancedQueueFilterLabelLimit;
  const summary =
    selectedIds.length === 0
      ? placeholder
      : intl.formatMessage(messages.labelsCount, { count: selectedIds.length });

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 min-w-0 flex-1 justify-start font-normal"
            aria-label={intl.formatMessage(messages.selectLabels)}
          />
        }
      >
        <span className="truncate">{summary}</span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <div className="flex max-h-56 flex-col gap-1 overflow-y-auto">
          {labels.length === 0 ? (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">
              <FormattedMessage {...messages.noLabels} />
            </p>
          ) : (
            labels.map((label) => {
              const checked = selected.has(label.id);
              return (
                <label
                  key={label.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                >
                  <Checkbox
                    checked={checked}
                    disabled={!checked && atLimit}
                    onCheckedChange={(next) => {
                      onChange(
                        nextAdvancedQueueFilterLabelIds(selectedIds, label.id, next === true),
                      );
                    }}
                  />
                  <span className="truncate">{label.title}</span>
                </label>
              );
            })
          )}
        </div>
        {atLimit ? (
          <p className="px-2 pt-2 text-xs text-muted-foreground">
            <FormattedMessage
              {...messages.labelSelectionLimit}
              values={{ count: contentEditorAdvancedQueueFilterLabelLimit }}
            />
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function FilterRow({
  label,
  htmlFor,
  children,
}: {
  label: ReactNode;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)] items-center gap-3">
      <Label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

export function ContentEditorAdvancedQueueFilterDialog({
  open,
  onOpenChange,
  value,
  onApply,
  providerKind,
  organizationSlug,
  projectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value?: ContentEditorAdvancedQueueFilter;
  onApply: (filter: ContentEditorAdvancedQueueFilter | undefined) => void;
  providerKind?: string | null;
  organizationSlug?: string;
  projectId?: string;
}) {
  const intl = useIntl();
  const [draft, setDraft] = useState<ContentEditorAdvancedQueueFilter>(
    value ?? EMPTY_ADVANCED_QUEUE_FILTER,
  );
  const showLabels = advancedQueueFilterSupportsLabels(providerKind);
  const showScreenshots = advancedQueueFilterSupportsScreenshots(providerKind);
  const showPartial = advancedQueueFilterSupportsPartialStatuses(providerKind);
  const selectPlaceholder = intl.formatMessage(messages.selectPlaceholder);
  const labelsQuery = useQuery({
    queryKey: ["content-editor-cat-labels", organizationSlug, projectId],
    queryFn: () =>
      fetchProjectFileContentEditorLabels({
        organizationSlug: organizationSlug!,
        projectId: projectId!,
        intl,
      }),
    enabled: open && showLabels && Boolean(organizationSlug && projectId),
    staleTime: 60_000,
  });
  const labels = labelsQuery.data ?? [];

  useEffect(() => {
    if (open) {
      setDraft(value ?? EMPTY_ADVANCED_QUEUE_FILTER);
    }
  }, [open, value]);

  const translationStatusItems = useMemo(() => {
    const items = [
      { value: "translated", label: intl.formatMessage(messages.translated) },
      { value: "untranslated", label: intl.formatMessage(messages.untranslated) },
    ];
    if (showPartial) {
      items.splice(1, 0, {
        value: "partially_translated",
        label: intl.formatMessage(messages.partiallyTranslated),
      });
    }
    return items;
  }, [intl, showPartial]);

  const approvalStatusItems = useMemo(() => {
    const items = [
      { value: "approved", label: intl.formatMessage(messages.approved) },
      { value: "not_approved", label: intl.formatMessage(messages.notApproved) },
    ];
    if (showPartial) {
      items.push({
        value: "partially_approved",
        label: intl.formatMessage(messages.partiallyApproved),
      });
    }
    return items;
  }, [intl, showPartial]);

  const presenceItems = [
    { value: "with", label: intl.formatMessage(messages.with) },
    { value: "without", label: intl.formatMessage(messages.without) },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(40rem,calc(100vh-4rem))] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            <FormattedMessage {...messages.title} />
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <p className="text-[0.65rem] font-semibold tracking-wider text-muted-foreground uppercase">
            <FormattedMessage {...messages.stringsSection} />
          </p>

          <FilterRow
            label={<FormattedMessage {...messages.stringsAdded} />}
            htmlFor="cat-added-from"
          >
            <DateRangeFields
              fromId="cat-added-from"
              toId="cat-added-to"
              from={draft.addedFrom}
              to={draft.addedTo}
              fromLabel={intl.formatMessage(messages.dateFrom)}
              toLabel={intl.formatMessage(messages.dateTo)}
              onFromChange={(addedFrom) => setDraft((current) => ({ ...current, addedFrom }))}
              onToChange={(addedTo) => setDraft((current) => ({ ...current, addedTo }))}
            />
          </FilterRow>

          <FilterRow
            label={<FormattedMessage {...messages.stringsUpdated} />}
            htmlFor="cat-updated-from"
          >
            <DateRangeFields
              fromId="cat-updated-from"
              toId="cat-updated-to"
              from={draft.updatedFrom}
              to={draft.updatedTo}
              fromLabel={intl.formatMessage(messages.dateFrom)}
              toLabel={intl.formatMessage(messages.dateTo)}
              onFromChange={(updatedFrom) => setDraft((current) => ({ ...current, updatedFrom }))}
              onToChange={(updatedTo) => setDraft((current) => ({ ...current, updatedTo }))}
            />
          </FilterRow>

          {showLabels ? (
            <>
              <div className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)] items-center gap-3">
                <Select
                  value={draft.includeLabelMode ?? "include_all"}
                  onValueChange={(includeLabelMode) =>
                    setDraft((current) => ({
                      ...current,
                      includeLabelMode: includeLabelMode as "include_all" | "include_any",
                    }))
                  }
                >
                  <SelectTrigger size="sm" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="include_all">
                      <FormattedMessage {...messages.includeAll} />
                    </SelectItem>
                    <SelectItem value="include_any">
                      <FormattedMessage {...messages.includeAny} />
                    </SelectItem>
                  </SelectContent>
                </Select>
                <LabelMultiSelect
                  labels={labels}
                  selectedIds={draft.includeLabelIds ?? []}
                  onChange={(includeLabelIds) =>
                    setDraft((current) => ({ ...current, includeLabelIds }))
                  }
                  placeholder={selectPlaceholder}
                />
              </div>
              <div className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)] items-center gap-3">
                <Select
                  value={draft.excludeLabelMode ?? "exclude_all"}
                  onValueChange={(excludeLabelMode) =>
                    setDraft((current) => ({
                      ...current,
                      excludeLabelMode: excludeLabelMode as "exclude_all" | "exclude_any",
                    }))
                  }
                >
                  <SelectTrigger size="sm" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="exclude_all">
                      <FormattedMessage {...messages.excludeAll} />
                    </SelectItem>
                    <SelectItem value="exclude_any">
                      <FormattedMessage {...messages.excludeAny} />
                    </SelectItem>
                  </SelectContent>
                </Select>
                <LabelMultiSelect
                  labels={labels}
                  selectedIds={draft.excludeLabelIds ?? []}
                  onChange={(excludeLabelIds) =>
                    setDraft((current) => ({ ...current, excludeLabelIds }))
                  }
                  placeholder={selectPlaceholder}
                />
              </div>
            </>
          ) : null}

          <FilterRow
            label={<FormattedMessage {...messages.stringType} />}
            htmlFor="cat-string-type"
          >
            <FilterSelect
              id="cat-string-type"
              value={draft.stringType}
              onValueChange={(stringType) =>
                setDraft((current) => ({
                  ...current,
                  stringType: stringType as ContentEditorAdvancedQueueFilter["stringType"],
                }))
              }
              placeholder={selectPlaceholder}
              items={[
                { value: "plain", label: intl.formatMessage(messages.typePlain) },
                { value: "plural", label: intl.formatMessage(messages.typePlural) },
                { value: "icu", label: intl.formatMessage(messages.typeIcu) },
                { value: "asset", label: intl.formatMessage(messages.typeAsset) },
              ]}
            />
          </FilterRow>

          <FilterRow
            label={<FormattedMessage {...messages.translationStatus} />}
            htmlFor="cat-translation-status"
          >
            <FilterSelect
              id="cat-translation-status"
              value={draft.translationStatus}
              onValueChange={(translationStatus) =>
                setDraft((current) => ({
                  ...current,
                  translationStatus:
                    translationStatus as ContentEditorAdvancedQueueFilter["translationStatus"],
                }))
              }
              placeholder={selectPlaceholder}
              items={translationStatusItems}
            />
          </FilterRow>

          <FilterRow
            label={<FormattedMessage {...messages.approvalStatus} />}
            htmlFor="cat-approval-status"
          >
            <FilterSelect
              id="cat-approval-status"
              value={draft.approvalStatus}
              onValueChange={(approvalStatus) =>
                setDraft((current) => ({
                  ...current,
                  approvalStatus:
                    approvalStatus as ContentEditorAdvancedQueueFilter["approvalStatus"],
                }))
              }
              placeholder={selectPlaceholder}
              items={approvalStatusItems}
            />
          </FilterRow>

          <FilterRow label={<FormattedMessage {...messages.qaIssues} />} htmlFor="cat-qa-issues">
            <FilterSelect
              id="cat-qa-issues"
              value={draft.qaIssues}
              onValueChange={(qaIssues) =>
                setDraft((current) => ({
                  ...current,
                  qaIssues: qaIssues as ContentEditorAdvancedQueueFilter["qaIssues"],
                }))
              }
              placeholder={selectPlaceholder}
              items={presenceItems}
            />
          </FilterRow>

          <FilterRow label={<FormattedMessage {...messages.comments} />} htmlFor="cat-comments">
            <FilterSelect
              id="cat-comments"
              value={draft.comments}
              onValueChange={(comments) =>
                setDraft((current) => ({
                  ...current,
                  comments: comments as ContentEditorAdvancedQueueFilter["comments"],
                }))
              }
              placeholder={selectPlaceholder}
              items={presenceItems}
            />
          </FilterRow>

          {showScreenshots ? (
            <FilterRow
              label={<FormattedMessage {...messages.screenshots} />}
              htmlFor="cat-screenshots"
            >
              <FilterSelect
                id="cat-screenshots"
                value={draft.screenshots}
                onValueChange={(screenshots) =>
                  setDraft((current) => ({
                    ...current,
                    screenshots: screenshots as ContentEditorAdvancedQueueFilter["screenshots"],
                  }))
                }
                placeholder={selectPlaceholder}
                items={presenceItems}
              />
            </FilterRow>
          ) : null}

          <FilterRow label={<FormattedMessage {...messages.visibility} />} htmlFor="cat-visibility">
            <FilterSelect
              id="cat-visibility"
              value={draft.visibility}
              onValueChange={(visibility) =>
                setDraft((current) => ({
                  ...current,
                  visibility: visibility as ContentEditorAdvancedQueueFilter["visibility"],
                }))
              }
              placeholder={selectPlaceholder}
              items={[
                { value: "visible", label: intl.formatMessage(messages.visible) },
                { value: "hidden", label: intl.formatMessage(messages.hidden) },
              ]}
            />
          </FilterRow>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setDraft(EMPTY_ADVANCED_QUEUE_FILTER)}
          >
            <FormattedMessage {...messages.reset} />
          </Button>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            <FormattedMessage {...messages.cancel} />
          </Button>
          <Button
            type="button"
            onClick={() => {
              const compacted = compactAdvancedQueueFilter(draft);
              onApply(Object.keys(compacted).length > 0 ? compacted : undefined);
              onOpenChange(false);
            }}
          >
            <FormattedMessage {...messages.apply} />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
