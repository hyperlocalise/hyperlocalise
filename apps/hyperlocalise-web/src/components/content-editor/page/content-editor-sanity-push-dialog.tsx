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
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";

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

import {
  nextPushDialogSelection,
  selectedPushRowsHaveEligibleLocales,
} from "./content-editor-integration-toolbar-visibility";
import {
  ContentEditorPushApproveHint,
  ContentEditorPushLocaleProgressRows,
  ContentEditorPushRefreshButton,
} from "./content-editor-push-progress";
import { contentEditorSanityPushButtonMessages as messages } from "./content-editor-sanity-push-button.messages";
import {
  contentEditorSanityPushDocumentsQueryKey,
  defaultSelectedSanityPushSourcePaths,
  fetchContentEditorSanityPushDocuments,
  sanityDocumentTitleFromSourcePath,
  type ContentEditorSanityPushDocument,
  type ContentEditorSanityPushCandidate,
} from "./content-editor-sanity-push-queries";

export function ContentEditorSanityPushDialog({
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
  candidates: ContentEditorSanityPushCandidate[];
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (input: { automationId: string; sourcePaths: string[] }) => void;
}) {
  const intl = useIntl();
  const [selectedAutomationId, setSelectedAutomationId] = useState(
    () => candidates[0]?.automationId ?? "",
  );
  const [selectedSourcePaths, setSelectedSourcePaths] = useState<string[]>([]);
  const [search, setSearch] = useState("");

  const selectedAutomation =
    candidates.find((candidate) => candidate.automationId === selectedAutomationId) ??
    candidates[0] ??
    null;
  const automationId = selectedAutomation?.automationId ?? "";

  const documentsQuery = useQuery({
    queryKey: contentEditorSanityPushDocumentsQueryKey(organizationSlug, automationId),
    queryFn: () =>
      fetchContentEditorSanityPushDocuments({
        organizationSlug,
        automationId,
      }),
    enabled: open && automationId.length > 0,
  });

  const documents = documentsQuery.data ?? [];
  const visibleDocuments = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return documents;
    }
    return documents.filter((document) => {
      const title = sanityDocumentTitleFromSourcePath(document.sourcePath).toLowerCase();
      return title.includes(query) || document.sourcePath.toLowerCase().includes(query);
    });
  }, [documents, search]);

  const firstAutomationId = candidates[0]?.automationId ?? "";
  const resetSelectionRef = useRef(true);

  useEffect(() => {
    if (!open) {
      setSelectedSourcePaths([]);
      resetSelectionRef.current = true;
      return;
    }
    setSelectedAutomationId(firstAutomationId);
    setSearch("");
  }, [open, firstAutomationId]);

  useEffect(() => {
    resetSelectionRef.current = true;
  }, [automationId, sourcePath]);

  useEffect(() => {
    if (!open || !documentsQuery.data) {
      return;
    }
    setSelectedSourcePaths((current) => {
      if (resetSelectionRef.current) {
        resetSelectionRef.current = false;
        return defaultSelectedSanityPushSourcePaths(documentsQuery.data, sourcePath);
      }
      return nextPushDialogSelection(
        current,
        documentsQuery.data.map((document) => document.sourcePath),
      );
    });
  }, [open, documentsQuery.data, sourcePath, automationId]);

  const toggleSourcePath = (nextSourcePath: string, checked: boolean) => {
    setSelectedSourcePaths((current) =>
      checked ? [...current, nextSourcePath] : current.filter((value) => value !== nextSourcePath),
    );
  };

  const canConfirmPush = selectedPushRowsHaveEligibleLocales(documents, selectedSourcePaths);

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
            <FormattedMessage {...messages.selectDocumentsTitle} />
          </DialogTitle>
          <DialogDescription>
            <FormattedMessage {...messages.selectDocumentsDescription} />
          </DialogDescription>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              <FormattedMessage {...messages.pushPolicyLabel} />
            </span>
            {": "}
            <FormattedMessage
              {...(selectedAutomation?.overwriteSanityDrafts
                ? messages.pushPolicyOverwrite
                : messages.pushPolicyKeepRemote)}
            />
          </p>
          <ContentEditorPushApproveHint />
        </DialogHeader>
        {candidates.length > 1 ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="sanity-push-automation">
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
              <SelectTrigger id="sanity-push-automation" className="w-full min-w-0">
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
            placeholder={intl.formatMessage(messages.searchDocumentsPlaceholder)}
            aria-label={intl.formatMessage(messages.searchDocumentsLabel)}
          />
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="link"
              className="h-auto px-0 text-xs underline"
              disabled={documents.length === 0 || pending}
              onClick={() =>
                setSelectedSourcePaths(documents.map((document) => document.sourcePath))
              }
            >
              <FormattedMessage {...messages.selectAllDocuments} />
            </Button>
            <Button
              type="button"
              variant="link"
              className="h-auto px-0 text-xs underline"
              disabled={selectedSourcePaths.length === 0 || pending}
              onClick={() => setSelectedSourcePaths([])}
            >
              <FormattedMessage {...messages.clearDocumentSelection} />
            </Button>
            <ContentEditorPushRefreshButton
              fetching={documentsQuery.isRefetching}
              disabled={pending || automationId.length === 0}
              onRefresh={() => {
                void documentsQuery.refetch();
              }}
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border">
          {documentsQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 p-8 text-muted-foreground">
              <Spinner />
              <FormattedMessage {...messages.loadingDocuments} />
            </div>
          ) : documentsQuery.isError ? (
            <p className="p-6 text-center text-sm text-destructive">
              <FormattedMessage {...messages.loadDocumentsError} />
            </p>
          ) : visibleDocuments.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              <FormattedMessage
                {...(documents.length === 0 ? messages.noDocuments : messages.noMatchingDocuments)}
              />
            </p>
          ) : (
            <div className="divide-y divide-border">
              {visibleDocuments.map((document) => (
                <SanityPushDocumentRow
                  key={document.documentId}
                  document={document}
                  checked={selectedSourcePaths.includes(document.sourcePath)}
                  disabled={pending}
                  onCheckedChange={(checked) => toggleSourcePath(document.sourcePath, checked)}
                />
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            <FormattedMessage {...messages.cancelDocumentSelection} />
          </Button>
          <Button
            onClick={() => {
              if (!automationId || !canConfirmPush) {
                return;
              }
              onConfirm({
                automationId,
                sourcePaths: selectedSourcePaths,
              });
            }}
            disabled={!canConfirmPush || pending || documentsQuery.isLoading}
          >
            {pending ? <Spinner data-icon="inline-start" /> : null}
            <FormattedMessage
              {...messages.pushSelectedDocuments}
              values={{ count: selectedSourcePaths.length }}
            />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SanityPushDocumentRow({
  document,
  checked,
  disabled,
  onCheckedChange,
}: {
  document: ContentEditorSanityPushDocument;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const title = sanityDocumentTitleFromSourcePath(document.sourcePath);
  return (
    <label className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-muted/50">
      <Checkbox
        className="mt-0.5"
        checked={checked}
        disabled={disabled}
        onCheckedChange={(nextChecked) => onCheckedChange(nextChecked === true)}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{title}</span>
        <span className="mt-0.5 block truncate font-mono text-xs text-muted-foreground">
          {document.sourcePath}
        </span>
        <ContentEditorPushLocaleProgressRows locales={document.locales ?? []} />
        {document.status === "push_failed" ? (
          <span className="mt-1 block text-xs text-destructive">
            <FormattedMessage {...messages.lastPushFailed} />
            {document.lastError ? ` · ${document.lastError}` : null}
          </span>
        ) : null}
      </span>
    </label>
  );
}
