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

import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Column } from "@/components/ui/layout/column";
import { Columns } from "@/components/ui/layout/columns";
import { Rows } from "@/components/ui/layout/rows";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyP } from "@/components/ui/typography";
import { createApiClient } from "@/lib/api-client";

import {
  GoogleDriveFolderTree,
  type GoogleDriveTreeToggleChange,
} from "./google-drive-folder-tree";
import { googleDriveFolderManagementMessages } from "./google-drive-folder-management.messages";

const api = createApiClient();

export type GoogleDriveConnectedFolder = {
  id: string;
  name: string;
  pathLabel: string;
  driveId: string | null;
  folderId: string;
  mimeType?: string | null;
  isFolder?: boolean;
};

export function GoogleDriveFolderManagement({
  organizationSlug,
  disabled,
}: {
  organizationSlug: string;
  disabled?: boolean;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const [showTranslations, setShowTranslations] = useState(false);
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(new Set());
  const [selectedMeta, setSelectedMeta] = useState<
    Map<string, { name: string; pathLabel: string; driveId: string | null }>
  >(new Map());

  const foldersQuery = useQuery({
    queryKey: ["google-drive-folders", organizationSlug],
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"]["google-drive"].folders.$get({
        param: { organizationSlug },
      });
      if (!response.ok) {
        throw new Error("Failed to load folders");
      }
      const body = await response.json();
      return body.folders as GoogleDriveConnectedFolder[];
    },
  });

  const connectedFolderIds = useMemo(() => {
    return new Set((foldersQuery.data ?? []).map((folder) => folder.folderId));
  }, [foldersQuery.data]);

  const toggleFolderSelection = useCallback(
    (change: {
      select: GoogleDriveTreeToggleChange[];
      unselect: GoogleDriveTreeToggleChange[];
    }) => {
      setSelectedFolderIds((current) => {
        const next = new Set(current);
        for (const item of change.unselect) {
          next.delete(item.node.id);
        }
        for (const item of change.select) {
          if (!item.node.selectable) {
            continue;
          }
          next.add(item.node.id);
        }
        return next;
      });
      setSelectedMeta((meta) => {
        const copy = new Map(meta);
        for (const item of change.unselect) {
          copy.delete(item.node.id);
        }
        for (const item of change.select) {
          if (!item.node.selectable) {
            continue;
          }
          copy.set(item.node.id, {
            name: item.node.name,
            pathLabel: item.pathLabel,
            driveId: item.node.driveId,
          });
        }
        return copy;
      });
    },
    [],
  );

  const addFolders = useMutation({
    mutationFn: async () => {
      for (const folderId of selectedFolderIds) {
        if (connectedFolderIds.has(folderId)) {
          continue;
        }
        const meta = selectedMeta.get(folderId);
        if (!meta) {
          continue;
        }
        await api.api.orgs[":organizationSlug"]["google-drive"].folders.$post({
          param: { organizationSlug },
          json: {
            folderId,
            name: meta.name,
            pathLabel: meta.pathLabel,
            driveId: meta.driveId,
          },
        });
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["google-drive-folders", organizationSlug] });
      setSelectedFolderIds(new Set());
      setSelectedMeta(new Map());
    },
    onError: () => {
      toast.error(intl.formatMessage(googleDriveFolderManagementMessages.browseFailed));
    },
  });

  const removeFolder = useMutation({
    mutationFn: async (folderRecordId: string) => {
      const response = await api.api.orgs[":organizationSlug"]["google-drive"].folders[
        ":folderRecordId"
      ].$delete({
        param: { organizationSlug, folderRecordId },
      });
      if (!response.ok) {
        throw new Error("remove_failed");
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["google-drive-folders", organizationSlug] });
    },
  });

  const connectedFolders = foldersQuery.data ?? [];

  return (
    <Columns spacing="2u" alignY="stretch" collapseBelow="medium">
      <Column width="1/2">
        <Rows spacing="2u">
          <TypographyP size="small" weight="medium">
            <FormattedMessage {...googleDriveFolderManagementMessages.browseFoldersTitle} />
          </TypographyP>
          <div className="flex items-center gap-2">
            <Checkbox
              id="show-translated-drive-files"
              checked={showTranslations}
              onCheckedChange={(checked) => setShowTranslations(checked === true)}
            />
            <Label htmlFor="show-translated-drive-files">
              <FormattedMessage {...googleDriveFolderManagementMessages.showTranslatedFiles} />
            </Label>
          </div>
          <GoogleDriveFolderTree
            organizationSlug={organizationSlug}
            disabled={disabled}
            showTranslations={showTranslations}
            selectedDriveIds={selectedFolderIds}
            lockedDriveIds={connectedFolderIds}
            onToggle={toggleFolderSelection}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={disabled || addFolders.isPending || selectedFolderIds.size === 0}
            onClick={() => addFolders.mutate()}
          >
            <FormattedMessage {...googleDriveFolderManagementMessages.addFolders} />
          </Button>
        </Rows>
      </Column>
      <Column width="1/2">
        <Rows spacing="2u">
          <TypographyP size="small" weight="medium">
            <FormattedMessage {...googleDriveFolderManagementMessages.connectedFoldersTitle} />
          </TypographyP>
          {foldersQuery.isLoading ? (
            <Skeleton className="h-40 rounded-lg" />
          ) : connectedFolders.length === 0 ? (
            <TypographyP size="small" tone="subtle">
              <FormattedMessage {...googleDriveFolderManagementMessages.emptyFolders} />
            </TypographyP>
          ) : (
            <div className="max-h-72 overflow-y-auto">
              <Rows spacing="1u">
                {connectedFolders.map((folder) => (
                  <div
                    key={folder.id}
                    className="flex items-center justify-between gap-2 rounded-lg border p-2"
                  >
                    <div className="min-w-0">
                      <TypographyP size="small">{folder.pathLabel}</TypographyP>
                      <TypographyP size="small" tone="subtle">
                        {folder.driveId ? "Shared Drive" : "My Drive"}
                      </TypographyP>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={disabled || removeFolder.isPending}
                      onClick={() => removeFolder.mutate(folder.id)}
                    >
                      <FormattedMessage {...googleDriveFolderManagementMessages.removeFolder} />
                    </Button>
                  </div>
                ))}
              </Rows>
            </div>
          )}
        </Rows>
      </Column>
    </Columns>
  );
}
