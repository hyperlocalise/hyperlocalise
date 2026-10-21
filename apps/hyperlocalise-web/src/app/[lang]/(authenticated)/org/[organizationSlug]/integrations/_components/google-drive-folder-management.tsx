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

import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CaretRightIcon, FolderIcon } from "@phosphor-icons/react";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Rows } from "@/components/ui/layout/rows";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyP } from "@/components/ui/typography";
import { createApiClient } from "@/lib/api-client";

import { googleDriveFolderManagementMessages } from "./google-drive-folder-management.messages";

const api = createApiClient();

type DriveRoot = { id: string; name: string; kind: "my_drive" | "shared_drive" };
type TreeNode = {
  id: string;
  name: string;
  driveId: string | null;
  depth: number;
  isFolder: boolean;
  childrenLoaded: boolean;
  children: TreeNode[];
};

type BrowseItem = {
  id: string;
  name: string;
  isFolder: boolean;
};

function buildRootNodes(drives: DriveRoot[]): TreeNode[] {
  return drives.map((drive) => ({
    id: drive.kind === "my_drive" ? "root" : drive.id,
    name: drive.name,
    driveId: drive.kind === "my_drive" ? null : drive.id,
    depth: 0,
    isFolder: true,
    childrenLoaded: false,
    children: [],
  }));
}

export function GoogleDriveFolderManagement({
  organizationSlug,
  disabled,
}: {
  organizationSlug: string;
  disabled?: boolean;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showTranslations, setShowTranslations] = useState(false);
  const [roots, setRoots] = useState<TreeNode[]>([]);
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
      return body.folders as Array<{
        id: string;
        name: string;
        pathLabel: string;
        driveId: string | null;
        folderId: string;
      }>;
    },
  });

  const drivesQuery = useQuery({
    queryKey: ["google-drive-drives", organizationSlug],
    enabled: dialogOpen,
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"]["google-drive"].drives.$get({
        param: { organizationSlug },
      });
      if (!response.ok) {
        throw new Error("Failed to load drives");
      }
      const body = await response.json();
      return body.drives as DriveRoot[];
    },
  });

  const loadChildren = useCallback(
    async (node: TreeNode) => {
      const folderId = node.id === "root" ? "root" : node.id;
      const response = await api.api.orgs[":organizationSlug"]["google-drive"].children.$get({
        param: { organizationSlug },
        query: {
          folderId,
          ...(node.driveId ? { driveId: node.driveId } : {}),
          showTranslations: showTranslations ? "true" : "false",
          depth: String(node.depth + 1),
        },
      });
      if (!response.ok) {
        throw new Error(intl.formatMessage(googleDriveFolderManagementMessages.browseFailed));
      }
      const body = await response.json();
      const items = body.items as BrowseItem[];
      return items
        .filter((item) => item.isFolder)
        .map<TreeNode>((item) => ({
          id: item.id,
          name: item.name,
          driveId: node.driveId,
          depth: node.depth + 1,
          isFolder: true,
          childrenLoaded: false,
          children: [],
        }));
    },
    [intl, organizationSlug, showTranslations],
  );

  const expandNode = useCallback(
    async (nodeId: string) => {
      async function walk(nodes: TreeNode[]): Promise<TreeNode[]> {
        const next: TreeNode[] = [];
        for (const node of nodes) {
          if (node.id === nodeId) {
            if (!node.childrenLoaded) {
              const children = await loadChildren(node);
              next.push({ ...node, childrenLoaded: true, children });
            } else {
              next.push(node);
            }
            continue;
          }
          if (node.children.length > 0) {
            next.push({ ...node, children: await walk(node.children) });
          } else {
            next.push(node);
          }
        }
        return next;
      }
      const updated = await walk(roots);
      setRoots(updated);
    },
    [loadChildren, roots],
  );

  const toggleFolderSelection = useCallback((node: TreeNode, pathLabel: string) => {
    setSelectedFolderIds((current) => {
      const next = new Set(current);
      if (next.has(node.id)) {
        next.delete(node.id);
        setSelectedMeta((meta) => {
          const copy = new Map(meta);
          copy.delete(node.id);
          return copy;
        });
      } else {
        next.add(node.id);
        setSelectedMeta((meta) => {
          const copy = new Map(meta);
          copy.set(node.id, { name: node.name, pathLabel, driveId: node.driveId });
          return copy;
        });
      }
      return next;
    });
  }, []);

  const addFolders = useMutation({
    mutationFn: async () => {
      for (const folderId of selectedFolderIds) {
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
      setDialogOpen(false);
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

  const openDialog = useCallback(() => {
    setDialogOpen(true);
    if (drivesQuery.data) {
      setRoots(buildRootNodes(drivesQuery.data));
    }
  }, [drivesQuery.data]);

  useEffect(() => {
    if (dialogOpen && drivesQuery.data) {
      setRoots(buildRootNodes(drivesQuery.data));
    }
  }, [dialogOpen, drivesQuery.data]);

  function renderTree(nodes: TreeNode[], pathPrefix: string) {
    return nodes.map((node) => {
      const pathLabel = pathPrefix ? `${pathPrefix}/${node.name}` : node.name;
      return (
        <div key={node.id} className="pl-4">
          <div className="flex items-center gap-2 py-1">
            <button
              type="button"
              className="inline-flex size-6 items-center justify-center rounded hover:bg-muted"
              onClick={() => void expandNode(node.id)}
              aria-label={`Expand ${node.name}`}
            >
              <CaretRightIcon className="size-4" />
            </button>
            <Checkbox
              checked={selectedFolderIds.has(node.id)}
              disabled={disabled}
              onCheckedChange={() => toggleFolderSelection(node, pathLabel)}
            />
            <FolderIcon className="size-4 text-muted-foreground" />
            <span className="text-sm">{node.name}</span>
          </div>
          {node.children.length > 0 ? renderTree(node.children, pathLabel) : null}
        </div>
      );
    });
  }

  return (
    <Rows spacing="2u">
      <TypographyP size="small" weight="medium">
        <FormattedMessage {...googleDriveFolderManagementMessages.connectedFoldersTitle} />
      </TypographyP>
      {foldersQuery.isLoading ? (
        <Skeleton className="h-12 rounded-lg" />
      ) : connectedFolders.length === 0 ? (
        <TypographyP size="small" tone="subtle">
          <FormattedMessage {...googleDriveFolderManagementMessages.emptyFolders} />
        </TypographyP>
      ) : (
        connectedFolders.map((folder) => (
          <div
            key={folder.id}
            className="flex items-center justify-between gap-2 rounded-lg border p-2"
          >
            <div>
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
        ))
      )}
      <Button type="button" variant="secondary" disabled={disabled} onClick={openDialog}>
        <FormattedMessage {...googleDriveFolderManagementMessages.addFolders} />
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              <FormattedMessage {...googleDriveFolderManagementMessages.addFolders} />
            </DialogTitle>
          </DialogHeader>
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
          {drivesQuery.isLoading ? <Skeleton className="h-40 rounded-lg" /> : renderTree(roots, "")}
          <DialogFooter>
            <Button
              type="button"
              disabled={disabled || addFolders.isPending || selectedFolderIds.size === 0}
              onClick={() => addFolders.mutate()}
            >
              <FormattedMessage {...googleDriveFolderManagementMessages.addFolders} />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Rows>
  );
}
