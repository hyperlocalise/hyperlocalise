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
import { useEffect, useState } from "react";
import { Cancel01Icon, FilterIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Popover,
    PopoverContent,
    PopoverHeader,
    PopoverTitle,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { formatLocaleOptionLabel } from "@/lib/i18n/locale-display-names.messages";

import { IssueLocalePicker } from "../../../_components/issue-detail/issue-locale-picker";
import {
    WorkspaceFilterField,
    workspaceFilterTriggerClassName,
} from "../../../_components/workspace-resource-shared";
import { tmEntryExplorerMessages as messages } from "./tm-entry-explorer.messages";
import {
    getActiveTmEntryFilterChips,
    isUuid,
    TM_ENTRY_ORIGINS,
    TM_ENTRY_PROVIDERS,
    TM_ENTRY_REVIEW_STATUSES,
    TM_ENTRY_SORT_DIRS,
    TM_ENTRY_SORTS,
    type TmEntryFilterChip,
    type TmEntryListUrlState,
    type TmEntryReviewStatus,
    type TmEntrySort,
    type TmEntrySortDir,
} from "./tm-entry-list-state";

function reviewStatusLabel(
    intl: ReturnType<typeof useIntl>,
    status: TmEntryReviewStatus,
): string {
    switch (status) {
        case "approved":
            return intl.formatMessage(messages.reviewApproved);
        case "pending":
            return intl.formatMessage(messages.reviewPending);
        case "rejected":
            return intl.formatMessage(messages.reviewRejected);
    }
}

function originLabel(intl: ReturnType<typeof useIntl>, origin: string): string {
    switch (origin) {
        case "manual":
            return intl.formatMessage(messages.originManual);
        case "import":
            return intl.formatMessage(messages.originImport);
        case "sync":
            return intl.formatMessage(messages.originSync);
        default:
            return origin;
    }
}

function sortLabel(intl: ReturnType<typeof useIntl>, sort: TmEntrySort): string {
    return intl.formatMessage(sort === "updated_at" ? messages.sortUpdatedAt : messages.sortCreatedAt);
}

function sortDirLabel(intl: ReturnType<typeof useIntl>, sortDir: TmEntrySortDir): string {
    return intl.formatMessage(sortDir === "asc" ? messages.sortDirAsc : messages.sortDirDesc);
}

function formatChipLabel(intl: ReturnType<typeof useIntl>, chip: TmEntryFilterChip): string {
    switch (chip.key) {
        case "search":
            return intl.formatMessage(messages.chipSearch, { value: chip.value });
        case "sourceLocale":
            return intl.formatMessage(messages.chipSourceLocale, {
                value: formatLocaleOptionLabel(intl, chip.value),
            });
        case "targetLocale":
            return intl.formatMessage(messages.chipTargetLocale, {
                value: formatLocaleOptionLabel(intl, chip.value),
            });
        case "reviewStatus":
            return intl.formatMessage(messages.chipReviewStatus, {
                value: reviewStatusLabel(intl, chip.value),
            });
        case "origin":
            return intl.formatMessage(messages.chipOrigin, { value: originLabel(intl, chip.value) });
        case "provider":
            return intl.formatMessage(messages.chipProvider, { value: chip.value });
        case "createdByUserId":
            return intl.formatMessage(messages.chipCreator, { value: chip.value });
        case "modifiedFrom":
            return intl.formatMessage(messages.chipModifiedFrom, { value: chip.value });
        case "modifiedTo":
            return intl.formatMessage(messages.chipModifiedTo, { value: chip.value });
        case "importBatchId":
            return intl.formatMessage(messages.chipImportBatch, { value: chip.value });
    }
}

function commitUuidFilter(
    value: string,
    onCommit: (next: string | undefined) => void,
): void {
    const trimmed = value.trim();
    if (!trimmed) {
        onCommit(undefined);
        return;
    }
    if (isUuid(trimmed)) {
        onCommit(trimmed.toLowerCase());
    }
}

export function TmEntryListToolbar({
    state,
    searchDraft,
    localeOptions,
    onSearchDraftChange,
    onStateChange,
    onClearFilters,
}: {
    state: TmEntryListUrlState;
    searchDraft: string;
    localeOptions: string[];
    onSearchDraftChange: (value: string) => void;
    onStateChange: (patch: Partial<TmEntryListUrlState>) => void;
    onClearFilters: () => void;
}) {
    const intl = useIntl();
    const chips = getActiveTmEntryFilterChips(state);
    const filterChipCount = chips.filter((chip) => chip.key !== "search").length;
    const [creatorDraft, setCreatorDraft] = useState(state.createdByUserId ?? "");
    const [importBatchDraft, setImportBatchDraft] = useState(state.importBatchId ?? "");

    useEffect(() => {
        setCreatorDraft(state.createdByUserId ?? "");
    }, [state.createdByUserId]);

    useEffect(() => {
        setImportBatchDraft(state.importBatchId ?? "");
    }, [state.importBatchId]);

    const sortOptions = TM_ENTRY_SORTS.map((value) => ({
        value,
        label: sortLabel(intl, value),
    }));
    const sortDirOptions = TM_ENTRY_SORT_DIRS.map((value) => ({
        value,
        label: sortDirLabel(intl, value),
    }));

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                <Input
                    value={searchDraft}
                    onChange={(event) => onSearchDraftChange(event.currentTarget.value)}
                    placeholder={intl.formatMessage(messages.searchPlaceholder)}
                    className="h-9 min-w-[12rem] flex-1 md:max-w-md"
                    aria-label={intl.formatMessage(messages.searchLabel)}
                />

                <Popover>
                    <PopoverTrigger
                        render={<Button type="button" variant="outline" size="sm" className="gap-1.5" />}
                    >
                        <HugeiconsIcon icon={FilterIcon} strokeWidth={2} className="size-3.5" />
                        {filterChipCount > 0 ? (
                            <FormattedMessage
                                {...messages.filterButtonWithCount}
                                values={{ count: filterChipCount }}
                            />
                        ) : (
                            <FormattedMessage {...messages.filterButton} />
                        )}
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-[22rem] gap-3 p-3 sm:w-[28rem]">
                        <PopoverHeader className="px-1">
                            <PopoverTitle className="text-sm font-medium">
                                <FormattedMessage {...messages.filterPopoverTitle} />
                            </PopoverTitle>
                        </PopoverHeader>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <WorkspaceFilterField label={intl.formatMessage(messages.sourceLocaleLabel)}>
                                <IssueLocalePicker
                                    value={state.sourceLocale}
                                    locales={localeOptions}
                                    allowClear
                                    onValueChange={(locale) =>
                                        onStateChange({ sourceLocale: locale ?? undefined })
                                    }
                                    aria-label={intl.formatMessage(messages.sourceLocaleLabel)}
                                    triggerClassName={workspaceFilterTriggerClassName}
                                />
                            </WorkspaceFilterField>
                            <WorkspaceFilterField label={intl.formatMessage(messages.targetLocaleLabel)}>
                                <IssueLocalePicker
                                    value={state.targetLocale}
                                    locales={localeOptions}
                                    allowClear
                                    onValueChange={(locale) =>
                                        onStateChange({ targetLocale: locale ?? undefined })
                                    }
                                    aria-label={intl.formatMessage(messages.targetLocaleLabel)}
                                    triggerClassName={workspaceFilterTriggerClassName}
                                />
                            </WorkspaceFilterField>
                            <WorkspaceFilterField label={intl.formatMessage(messages.reviewStatusLabel)}>
                                <Select
                                    value={state.reviewStatus ?? "all"}
                                    onValueChange={(value) =>
                                        onStateChange({
                                            reviewStatus:
                                                value && value !== "all"
                                                    ? (value as TmEntryReviewStatus)
                                                    : undefined,
                                        })
                                    }
                                >
                                    <SelectTrigger className={workspaceFilterTriggerClassName}>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all" label={intl.formatMessage(messages.anyValue)}>
                                            <FormattedMessage {...messages.anyValue} />
                                        </SelectItem>
                                        {TM_ENTRY_REVIEW_STATUSES.map((status) => (
                                            <SelectItem
                                                key={status}
                                                value={status}
                                                label={reviewStatusLabel(intl, status)}
                                            >
                                                {reviewStatusLabel(intl, status)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </WorkspaceFilterField>
                            <WorkspaceFilterField label={intl.formatMessage(messages.originLabel)}>
                                <Select
                                    value={state.origin ?? "all"}
                                    onValueChange={(value) =>
                                        onStateChange({
                                            origin: value && value !== "all" ? value : undefined,
                                        })
                                    }
                                >
                                    <SelectTrigger className={workspaceFilterTriggerClassName}>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all" label={intl.formatMessage(messages.anyValue)}>
                                            <FormattedMessage {...messages.anyValue} />
                                        </SelectItem>
                                        {TM_ENTRY_ORIGINS.map((origin) => (
                                            <SelectItem
                                                key={origin}
                                                value={origin}
                                                label={originLabel(intl, origin)}
                                            >
                                                {originLabel(intl, origin)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </WorkspaceFilterField>
                            <WorkspaceFilterField label={intl.formatMessage(messages.providerLabel)}>
                                <Select
                                    value={state.provider ?? "all"}
                                    onValueChange={(value) =>
                                        onStateChange({
                                            provider: value && value !== "all" ? value : undefined,
                                        })
                                    }
                                >
                                    <SelectTrigger className={workspaceFilterTriggerClassName}>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all" label={intl.formatMessage(messages.anyValue)}>
                                            <FormattedMessage {...messages.anyValue} />
                                        </SelectItem>
                                        {TM_ENTRY_PROVIDERS.map((provider) => (
                                            <SelectItem key={provider} value={provider} label={provider}>
                                                {provider}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </WorkspaceFilterField>
                            <WorkspaceFilterField label={intl.formatMessage(messages.creatorLabel)}>
                                <Input
                                    value={creatorDraft}
                                    onChange={(event) => setCreatorDraft(event.currentTarget.value)}
                                    onBlur={() =>
                                        commitUuidFilter(creatorDraft, (createdByUserId) =>
                                            onStateChange({ createdByUserId }),
                                        )
                                    }
                                    placeholder={intl.formatMessage(messages.creatorPlaceholder)}
                                    aria-label={intl.formatMessage(messages.creatorLabel)}
                                    className="h-9"
                                />
                            </WorkspaceFilterField>
                            <WorkspaceFilterField label={intl.formatMessage(messages.modifiedFromLabel)}>
                                <Input
                                    type="date"
                                    value={state.modifiedFrom ?? ""}
                                    onChange={(event) =>
                                        onStateChange({
                                            modifiedFrom: event.currentTarget.value || undefined,
                                        })
                                    }
                                    aria-label={intl.formatMessage(messages.modifiedFromLabel)}
                                    className="h-9"
                                />
                            </WorkspaceFilterField>
                            <WorkspaceFilterField label={intl.formatMessage(messages.modifiedToLabel)}>
                                <Input
                                    type="date"
                                    value={state.modifiedTo ?? ""}
                                    onChange={(event) =>
                                        onStateChange({
                                            modifiedTo: event.currentTarget.value || undefined,
                                        })
                                    }
                                    aria-label={intl.formatMessage(messages.modifiedToLabel)}
                                    className="h-9"
                                />
                            </WorkspaceFilterField>
                            <WorkspaceFilterField
                                className="sm:col-span-2"
                                label={intl.formatMessage(messages.importBatchLabel)}
                            >
                                <Input
                                    value={importBatchDraft}
                                    onChange={(event) => setImportBatchDraft(event.currentTarget.value)}
                                    onBlur={() =>
                                        commitUuidFilter(importBatchDraft, (importBatchId) =>
                                            onStateChange({ importBatchId }),
                                        )
                                    }
                                    placeholder={intl.formatMessage(messages.importBatchPlaceholder)}
                                    aria-label={intl.formatMessage(messages.importBatchLabel)}
                                    className="h-9"
                                />
                            </WorkspaceFilterField>
                        </div>
                    </PopoverContent>
                </Popover>

                <div className="flex items-center gap-1.5">
                    <Select
                        value={state.sort}
                        items={sortOptions}
                        onValueChange={(value) =>
                            onStateChange({ sort: (value ?? "created_at") as TmEntrySort })
                        }
                    >
                        <SelectTrigger
                            size="sm"
                            className="h-8 w-[8.5rem]"
                            aria-label={intl.formatMessage(messages.sortByLabel)}
                        >
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {sortOptions.map((item) => (
                                <SelectItem key={item.value} value={item.value} label={item.label}>
                                    {item.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Select
                        value={state.sortDir}
                        items={sortDirOptions}
                        onValueChange={(value) =>
                            onStateChange({ sortDir: (value ?? "desc") as TmEntrySortDir })
                        }
                    >
                        <SelectTrigger
                            size="sm"
                            className="h-8 w-[8.5rem]"
                            aria-label={intl.formatMessage(messages.orderLabel)}
                        >
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {sortDirOptions.map((item) => (
                                <SelectItem key={item.value} value={item.value} label={item.label}>
                                    {item.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {chips.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                    {chips.map((chip) => {
                        const label = formatChipLabel(intl, chip);
                        return (
                            <Badge key={chip.key} variant="secondary" className="gap-1 rounded-full pe-1">
                                <span>{label}</span>
                                <button
                                    type="button"
                                    className="rounded-full p-0.5 hover:bg-muted"
                                    aria-label={intl.formatMessage(messages.removeChipAriaLabel, { label })}
                                    onClick={() => {
                                        if (chip.key === "search") {
                                            onSearchDraftChange("");
                                        }
                                        onStateChange({
                                            [chip.key]: chip.key === "search" ? "" : undefined,
                                        });
                                    }}
                                >
                                    <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3.5" />
                                </button>
                            </Badge>
                        );
                    })}
                    <Button type="button" variant="ghost" size="sm" onClick={onClearFilters}>
                        <FormattedMessage {...messages.clearFilters} />
                    </Button>
                </div>
            ) : null}
        </div>
    );
}
