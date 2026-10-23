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
import { contentEditorGoogleDrivePushButtonMessages as messages } from "./content-editor-google-drive-push-button.messages";
import {
  contentEditorGoogleDrivePushFilesQueryKey,
  defaultSelectedGoogleDrivePushSourcePaths,
  fetchContentEditorGoogleDrivePushFiles,
  googleDriveFileTitleFromSourcePath,
  type ContentEditorGoogleDrivePushCandidate,
  type ContentEditorGoogleDrivePushFile,
} from "./content-editor-google-drive-push-queries";

export function ContentEditorGoogleDrivePushDialog({
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
  candidates: ContentEditorGoogleDrivePushCandidate[];
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

  const filesQuery = useQuery({
    queryKey: contentEditorGoogleDrivePushFilesQueryKey(organizationSlug, automationId),
    queryFn: () =>
      fetchContentEditorGoogleDrivePushFiles({
        organizationSlug,
        automationId,
      }),
    enabled: open && automationId.length > 0,
  });

  const files = filesQuery.data ?? [];
  const visibleFiles = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return files;
    }
    return files.filter((file) => {
      const title = googleDriveFileTitleFromSourcePath(file.sourcePath).toLowerCase();
      return title.includes(query) || file.sourcePath.toLowerCase().includes(query);
    });
  }, [files, search]);

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
    if (!open || !filesQuery.data) {
      return;
    }
    setSelectedSourcePaths((current) => {
      if (resetSelectionRef.current) {
        resetSelectionRef.current = false;
        return defaultSelectedGoogleDrivePushSourcePaths(filesQuery.data, sourcePath);
      }
      return nextPushDialogSelection(
        current,
        filesQuery.data.map((file) => file.sourcePath),
      );
    });
  }, [open, filesQuery.data, sourcePath, automationId]);

  const toggleSourcePath = (nextSourcePath: string, checked: boolean) => {
    setSelectedSourcePaths((current) =>
      checked ? [...current, nextSourcePath] : current.filter((value) => value !== nextSourcePath),
    );
  };

  const canConfirmPush = selectedPushRowsHaveEligibleLocales(files, selectedSourcePaths);

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
            <FormattedMessage {...messages.selectFilesTitle} />
          </DialogTitle>
          <DialogDescription>
            <FormattedMessage {...messages.selectFilesDescription} />
          </DialogDescription>
          <ContentEditorPushApproveHint />
        </DialogHeader>
        {candidates.length > 1 ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="google-drive-push-automation">
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
              <SelectTrigger id="google-drive-push-automation" className="w-full min-w-0">
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
            placeholder={intl.formatMessage(messages.searchFilesPlaceholder)}
            aria-label={intl.formatMessage(messages.searchFilesLabel)}
          />
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="link"
              className="h-auto px-0 text-xs underline"
              disabled={files.length === 0 || pending}
              onClick={() => setSelectedSourcePaths(files.map((file) => file.sourcePath))}
            >
              <FormattedMessage {...messages.selectAllFiles} />
            </Button>
            <Button
              type="button"
              variant="link"
              className="h-auto px-0 text-xs underline"
              disabled={selectedSourcePaths.length === 0 || pending}
              onClick={() => setSelectedSourcePaths([])}
            >
              <FormattedMessage {...messages.clearFileSelection} />
            </Button>
            <ContentEditorPushRefreshButton
              fetching={filesQuery.isRefetching}
              disabled={pending || automationId.length === 0}
              onRefresh={() => {
                void filesQuery.refetch();
              }}
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border">
          {filesQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 p-8 text-muted-foreground">
              <Spinner />
              <FormattedMessage {...messages.loadingFiles} />
            </div>
          ) : filesQuery.isError ? (
            <p className="p-6 text-center text-sm text-destructive">
              <FormattedMessage {...messages.loadFilesError} />
            </p>
          ) : visibleFiles.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              <FormattedMessage
                {...(files.length === 0 ? messages.noFiles : messages.noMatchingFiles)}
              />
            </p>
          ) : (
            <div className="divide-y divide-border">
              {visibleFiles.map((file) => (
                <GoogleDrivePushFileRow
                  key={file.driveFileId}
                  file={file}
                  checked={selectedSourcePaths.includes(file.sourcePath)}
                  disabled={pending}
                  onCheckedChange={(checked) => toggleSourcePath(file.sourcePath, checked)}
                />
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            <FormattedMessage {...messages.cancelFileSelection} />
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
            disabled={!canConfirmPush || pending || filesQuery.isLoading}
          >
            {pending ? <Spinner data-icon="inline-start" /> : null}
            <FormattedMessage
              {...messages.pushSelectedFiles}
              values={{ count: selectedSourcePaths.length }}
            />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GoogleDrivePushFileRow({
  file,
  checked,
  disabled,
  onCheckedChange,
}: {
  file: ContentEditorGoogleDrivePushFile;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const title = googleDriveFileTitleFromSourcePath(file.sourcePath);
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
          {file.sourcePath}
        </span>
        <ContentEditorPushLocaleProgressRows locales={file.locales ?? []} />
        {file.status === "push_failed" ? (
          <span className="mt-1 block text-xs text-destructive">
            <FormattedMessage {...messages.lastPushFailed} />
            {file.lastError ? ` · ${file.lastError}` : null}
          </span>
        ) : null}
      </span>
    </label>
  );
}
