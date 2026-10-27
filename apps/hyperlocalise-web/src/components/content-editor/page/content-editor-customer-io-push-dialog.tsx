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
import { useQuery } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Spinner } from "@/components/ui/spinner";

import { allSelectedPushRowsHaveEligibleLocales } from "./content-editor-integration-toolbar-visibility";
import {
  ContentEditorPushApproveHint,
  ContentEditorPushLocaleProgressRows,
  ContentEditorPushRefreshButton,
} from "./content-editor-push-progress";
import { contentEditorPushProgressMessages as pushProgressMessages } from "./content-editor-push-progress.messages";
import { useContentEditorPushDialogSelection } from "./use-content-editor-push-dialog-selection";
import { contentEditorCustomerIoPushButtonMessages as messages } from "./content-editor-customer-io-push-button.messages";
import {
  contentEditorCustomerIoPushItemsQueryKey,
  defaultSelectedCustomerIoPushSourcePaths,
  fetchContentEditorCustomerIoPushItems,
  type ContentEditorCustomerIoPushCandidate,
  type ContentEditorCustomerIoPushItem,
} from "./content-editor-customer-io-push-queries";

export function ContentEditorCustomerIoPushDialog({
  open,
  organizationSlug,
  sourcePath,
  candidates,
  pending,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  organizationSlug: string;
  sourcePath: string | null;
  candidates: ContentEditorCustomerIoPushCandidate[];
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (input: { automationId: string; sourcePaths: string[] }) => void;
}) {
  const intl = useIntl();
  const [selectedAutomationId, setSelectedAutomationId] = useState(
    () => candidates[0]?.automationId ?? "",
  );
  const [search, setSearch] = useState("");

  const selectedAutomation =
    candidates.find((candidate) => candidate.automationId === selectedAutomationId) ??
    candidates[0] ??
    null;
  const automationId = selectedAutomation?.automationId ?? "";

  const itemsQuery = useQuery({
    queryKey: contentEditorCustomerIoPushItemsQueryKey(organizationSlug, automationId),
    queryFn: () =>
      fetchContentEditorCustomerIoPushItems({
        organizationSlug,
        automationId,
      }),
    enabled: open && automationId.length > 0,
  });

  const items = itemsQuery.data ?? [];
  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return items;
    }
    return items.filter((item) => {
      return (
        item.name.toLowerCase().includes(query) || item.sourcePath.toLowerCase().includes(query)
      );
    });
  }, [items, search]);

  const firstAutomationId = candidates[0]?.automationId ?? "";

  useEffect(() => {
    if (!open) {
      return;
    }
    setSelectedAutomationId(firstAutomationId);
    setSearch("");
  }, [open, firstAutomationId]);

  const { selectedSourcePaths, setSelectedSourcePaths } = useContentEditorPushDialogSelection({
    open,
    automationId,
    sourcePath,
    items: itemsQuery.data,
    defaultSelectedSourcePaths: defaultSelectedCustomerIoPushSourcePaths,
  });

  const toggleSourcePath = (nextSourcePath: string, checked: boolean) => {
    setSelectedSourcePaths((current) =>
      checked ? [...current, nextSourcePath] : current.filter((value) => value !== nextSourcePath),
    );
  };

  const canConfirmPush = selectedSourcePaths.length > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (pending) {
          return;
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="flex max-h-[80vh] flex-col sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            <FormattedMessage {...messages.selectItemsTitle} />
          </DialogTitle>
          <DialogDescription>
            <FormattedMessage {...messages.selectItemsDescription} />
          </DialogDescription>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              <FormattedMessage {...messages.pushPolicyLabel} />
            </span>
            {": "}
            <FormattedMessage
              {...(selectedAutomation?.overwriteWhenRemoteNewer
                ? messages.pushPolicyOverwrite
                : messages.pushPolicyKeepRemote)}
            />
          </p>
          <ContentEditorPushApproveHint />
        </DialogHeader>
        {candidates.length > 1 ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="customer-io-push-automation">
              <FormattedMessage {...messages.automationLabel} />
            </Label>
            <Select
              value={automationId}
              onValueChange={(value) => {
                if (typeof value === "string") {
                  setSelectedAutomationId(value);
                }
              }}
            >
              <SelectTrigger id="customer-io-push-automation" className="w-full min-w-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((candidate) => (
                  <SelectItem key={candidate.automationId} value={candidate.automationId}>
                    {candidate.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <div className="flex flex-col gap-1.5">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={intl.formatMessage(messages.searchItemsPlaceholder)}
            aria-label={intl.formatMessage(messages.searchItemsLabel)}
          />
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="link"
              className="h-auto px-0 text-xs underline"
              disabled={items.length === 0 || pending}
              onClick={() => setSelectedSourcePaths(items.map((item) => item.sourcePath))}
            >
              <FormattedMessage {...messages.selectAllItems} />
            </Button>
            <Button
              type="button"
              variant="link"
              className="h-auto px-0 text-xs underline"
              disabled={selectedSourcePaths.length === 0 || pending}
              onClick={() => setSelectedSourcePaths([])}
            >
              <FormattedMessage {...messages.clearItemSelection} />
            </Button>
            <ContentEditorPushRefreshButton
              fetching={itemsQuery.isRefetching}
              disabled={pending || automationId.length === 0}
              onRefresh={() => {
                void itemsQuery.refetch();
              }}
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border">
          {itemsQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 p-8 text-muted-foreground">
              <Spinner />
              <FormattedMessage {...messages.loadingItems} />
            </div>
          ) : itemsQuery.isError ? (
            <p className="p-6 text-center text-sm text-destructive">
              <FormattedMessage {...messages.loadItemsError} />
            </p>
          ) : visibleItems.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              <FormattedMessage
                {...(items.length === 0 ? messages.noItems : messages.noMatchingItems)}
              />
            </p>
          ) : (
            <div className="divide-y divide-border">
              {visibleItems.map((item) => (
                <CustomerIoPushItemRow
                  key={`${item.resourceKind}-${item.sourceId}`}
                  item={item}
                  checked={selectedSourcePaths.includes(item.sourcePath)}
                  disabled={pending}
                  onCheckedChange={(checked) => toggleSourcePath(item.sourcePath, checked)}
                />
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            <FormattedMessage {...messages.cancelItemSelection} />
          </Button>
          <Button
            onClick={() => {
              if (!automationId || !canConfirmPush) {
                return;
              }
              if (!allSelectedPushRowsHaveEligibleLocales(items, selectedSourcePaths)) {
                toast.error(intl.formatMessage(pushProgressMessages.ineligibleSelectionError));
                return;
              }
              onConfirm({
                automationId,
                sourcePaths: selectedSourcePaths,
              });
            }}
            disabled={!canConfirmPush || pending || itemsQuery.isLoading}
          >
            {pending ? <Spinner data-icon="inline-start" /> : null}
            <FormattedMessage
              {...messages.pushSelectedItems}
              values={{ count: selectedSourcePaths.length }}
            />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CustomerIoPushItemRow({
  item,
  checked,
  disabled,
  onCheckedChange,
}: {
  item: ContentEditorCustomerIoPushItem;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-muted/50">
      <Checkbox
        className="mt-0.5"
        checked={checked}
        disabled={disabled}
        onCheckedChange={(nextChecked) => onCheckedChange(nextChecked === true)}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{item.name}</span>
        <span className="mt-0.5 block truncate font-mono text-xs text-muted-foreground">
          {item.sourcePath}
        </span>
        <ContentEditorPushLocaleProgressRows locales={item.locales ?? []} />
        {item.status === "push_failed" ? (
          <span className="mt-1 block text-xs text-destructive">
            <FormattedMessage {...messages.lastPushFailed} />
            {item.lastError ? ` · ${item.lastError}` : null}
          </span>
        ) : null}
      </span>
    </label>
  );
}
