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

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CaretRightIcon,
  FileDocIcon,
  FilePdfIcon,
  FilePptIcon,
  FileTextIcon,
  FileXlsIcon,
  FolderIcon,
} from "@phosphor-icons/react";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { TypographyP } from "@/components/ui/typography";
import { createApiClient } from "@/lib/api-client";
import { GOOGLE_MIME } from "@/lib/google-drive/constants";
import { cn } from "@/lib/primitives/cn";

import { googleDriveFolderManagementMessages } from "./google-drive-folder-management.messages";

const api = createApiClient();

export type GoogleDriveTreeNode = {
  id: string;
  name: string;
  driveId: string | null;
  depth: number;
  isFolder: boolean;
  mimeType?: string;
  selectable: boolean;
  expanded: boolean;
  childrenLoaded: boolean;
  children: GoogleDriveTreeNode[];
};

export type GoogleDriveConnectedItem = {
  folderId: string;
  name: string;
  pathLabel: string;
  driveId: string | null;
  mimeType?: string | null;
  isFolder?: boolean;
};

function parentPathLabel(pathLabel: string) {
  const index = pathLabel.lastIndexOf("/");
  if (index <= 0) {
    return null;
  }
  return pathLabel.slice(0, index);
}

function buildConnectedTree(items: GoogleDriveConnectedItem[]): GoogleDriveTreeNode[] {
  const nodes = new Map<string, GoogleDriveTreeNode>();
  for (const item of items) {
    const isFolder =
      item.isFolder === true || item.mimeType === GOOGLE_MIME.folder || item.folderId === "root";
    nodes.set(item.pathLabel, {
      id: item.folderId,
      name: item.name,
      driveId: item.driveId,
      depth: 0,
      isFolder,
      mimeType: item.mimeType ?? undefined,
      selectable: true,
      expanded: false,
      childrenLoaded: true,
      children: [],
    });
  }

  const roots: GoogleDriveTreeNode[] = [];
  const sorted = items.toSorted((left, right) => left.pathLabel.length - right.pathLabel.length);
  for (const item of sorted) {
    const node = nodes.get(item.pathLabel);
    if (!node) {
      continue;
    }
    let parentLabel = parentPathLabel(item.pathLabel);
    let parent: GoogleDriveTreeNode | undefined;
    while (parentLabel) {
      parent = nodes.get(parentLabel);
      if (parent) {
        break;
      }
      parentLabel = parentPathLabel(parentLabel);
    }
    if (parent) {
      parent.isFolder = true;
      parent.children.push(node);
      node.depth = parent.depth + 1;
    } else {
      roots.push(node);
    }
  }
  return roots;
}

type DriveRoot = { id: string; name: string; kind: "my_drive" | "shared_drive" };

type BrowseItem = {
  id: string;
  name: string;
  isFolder?: boolean;
  mimeType?: string;
  classification?: { status?: string };
};

function treeKey(node: { id: string; driveId: string | null }) {
  return `${node.driveId ?? "my"}:${node.id}`;
}

export type GoogleDriveTreeToggleChange = {
  node: GoogleDriveTreeNode;
  pathLabel: string;
};

function collectSelectableDescendants(node: GoogleDriveTreeNode): GoogleDriveTreeNode[] {
  const collected: GoogleDriveTreeNode[] = [];
  for (const child of node.children) {
    if (child.selectable) {
      collected.push(child);
    }
    collected.push(...collectSelectableDescendants(child));
  }
  return collected;
}

function findAncestorTrail(
  nodes: GoogleDriveTreeNode[],
  key: string,
  trail: GoogleDriveTreeNode[] = [],
): GoogleDriveTreeNode[] | null {
  for (const node of nodes) {
    if (treeKey(node) === key) {
      return trail;
    }
    const nested = findAncestorTrail(node.children, key, [...trail, node]);
    if (nested) {
      return nested;
    }
  }
  return null;
}

function hasSelectedDescendant(node: GoogleDriveTreeNode, selectedIds: Set<string>): boolean {
  if (selectedIds.has(node.id)) {
    return true;
  }
  return node.children.some((child) => hasSelectedDescendant(child, selectedIds));
}

function nodePathLabel(node: GoogleDriveTreeNode, ancestors: GoogleDriveTreeNode[]) {
  return [...ancestors, node].map((item) => item.name).join("/");
}

function findNode(nodes: GoogleDriveTreeNode[], key: string): GoogleDriveTreeNode | null {
  for (const node of nodes) {
    if (treeKey(node) === key) {
      return node;
    }
    const child = findNode(node.children, key);
    if (child) {
      return child;
    }
  }
  return null;
}

function updateNode(
  nodes: GoogleDriveTreeNode[],
  key: string,
  updater: (node: GoogleDriveTreeNode) => GoogleDriveTreeNode,
): GoogleDriveTreeNode[] {
  return nodes.map((node) => {
    if (treeKey(node) === key) {
      return updater(node);
    }
    if (node.children.length === 0) {
      return node;
    }
    return { ...node, children: updateNode(node.children, key, updater) };
  });
}

function isBrowseFolder(item: BrowseItem) {
  return item.isFolder === true || item.mimeType === GOOGLE_MIME.folder;
}

function isSelectableItem(item: BrowseItem) {
  if (isBrowseFolder(item)) {
    return true;
  }
  return item.classification?.status === "supported";
}

async function driveApiError(response: Response, fallback: string): Promise<Error> {
  try {
    const body = (await response.json()) as { message?: string };
    const message = body.message?.trim();
    if (message) {
      return new Error(message);
    }
  } catch {
    // Use the fallback when the body is not JSON.
  }
  return new Error(fallback);
}

function buildRootNodes(drives: DriveRoot[]): GoogleDriveTreeNode[] {
  return drives.map((drive) => ({
    id: drive.kind === "my_drive" ? "root" : drive.id,
    name: drive.name,
    driveId: drive.kind === "my_drive" ? null : drive.id,
    depth: 0,
    isFolder: true,
    mimeType: GOOGLE_MIME.folder,
    selectable: true,
    expanded: false,
    childrenLoaded: false,
    children: [],
  }));
}

const TREE_ICON_CLASS = "size-4 shrink-0 text-muted-foreground";

function DriveItemIcon({ node }: { node: GoogleDriveTreeNode }) {
  if (node.isFolder) {
    return <FolderIcon className={TREE_ICON_CLASS} />;
  }

  const mimeType = node.mimeType ?? "";
  if (mimeType === GOOGLE_MIME.document || mimeType.includes("wordprocessingml")) {
    return <FileDocIcon className={TREE_ICON_CLASS} />;
  }
  if (mimeType === GOOGLE_MIME.spreadsheet || mimeType.includes("spreadsheetml")) {
    return <FileXlsIcon className={TREE_ICON_CLASS} />;
  }
  if (mimeType === GOOGLE_MIME.presentation || mimeType.includes("presentationml")) {
    return <FilePptIcon className={TREE_ICON_CLASS} />;
  }
  if (mimeType === "application/pdf") {
    return <FilePdfIcon className={TREE_ICON_CLASS} />;
  }
  return <FileTextIcon className={TREE_ICON_CLASS} />;
}

function DriveFolderTreeRow({
  node,
  pathLabel,
  disabled,
  isLocked,
  isSelected,
  isIndeterminate,
  isExpanding,
  expandLabel,
  onExpand,
  onToggle,
}: {
  node: GoogleDriveTreeNode;
  pathLabel: string;
  disabled?: boolean;
  isLocked: boolean;
  isSelected: boolean;
  isIndeterminate: boolean;
  isExpanding: boolean;
  expandLabel: string;
  onExpand: (node: GoogleDriveTreeNode) => void;
  onToggle: (node: GoogleDriveTreeNode, pathLabel: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 py-1">
      {node.isFolder && (node.children.length > 0 || !node.childrenLoaded) ? (
        <button
          type="button"
          className="inline-flex size-6 shrink-0 items-center justify-center rounded hover:bg-muted"
          onClick={() => onExpand(node)}
          disabled={isExpanding}
          aria-expanded={node.expanded}
          aria-busy={isExpanding}
          aria-label={expandLabel}
        >
          {isExpanding ? (
            <Spinner className="size-4" />
          ) : (
            <CaretRightIcon
              className={cn("size-4 transition-transform", node.expanded && "rotate-90")}
            />
          )}
        </button>
      ) : (
        <span className="inline-flex size-6 shrink-0" aria-hidden />
      )}
      <Checkbox
        checked={isLocked || isSelected ? true : isIndeterminate ? "indeterminate" : false}
        disabled={disabled || isLocked || !node.selectable}
        onCheckedChange={() => onToggle(node, pathLabel)}
      />
      <DriveItemIcon node={node} />
      <span className={cn("min-w-0 truncate text-sm", !node.selectable && "text-muted-foreground")}>
        {node.name}
      </span>
    </div>
  );
}

export function GoogleDriveFolderTree({
  organizationSlug,
  disabled,
  showTranslations,
  selectedDriveIds,
  lockedDriveIds,
  connectedItems,
  onToggle,
}: {
  organizationSlug: string;
  disabled?: boolean;
  showTranslations?: boolean;
  selectedDriveIds: Set<string>;
  lockedDriveIds?: Set<string>;
  connectedItems?: GoogleDriveConnectedItem[];
  onToggle: (change: {
    select: GoogleDriveTreeToggleChange[];
    unselect: GoogleDriveTreeToggleChange[];
  }) => void;
}) {
  const intl = useIntl();
  const connectedOnly = connectedItems !== undefined;
  const [roots, setRoots] = useState<GoogleDriveTreeNode[]>([]);
  const [expandingKeys, setExpandingKeys] = useState<Set<string>>(new Set());
  const rootsRef = useRef<GoogleDriveTreeNode[]>([]);
  rootsRef.current = roots;

  const drivesQuery = useQuery({
    queryKey: ["google-drive-drives", organizationSlug],
    enabled: !connectedOnly,
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"]["google-drive"].drives.$get({
        param: { organizationSlug },
      });
      if (!response.ok) {
        throw await driveApiError(response, "Failed to load drives");
      }
      const body = await response.json();
      return body.drives as DriveRoot[];
    },
  });

  const loadChildren = useCallback(
    async (node: GoogleDriveTreeNode) => {
      const folderId = node.id === "root" ? "root" : node.id;
      const response = await api.api.orgs[":organizationSlug"]["google-drive"].children.$get({
        param: { organizationSlug },
        query: {
          folderId,
          ...(node.driveId ? { driveId: node.driveId } : {}),
          showTranslations: showTranslations === true ? "true" : "false",
          depth: String(node.depth + 1),
        },
      });
      if (!response.ok) {
        throw await driveApiError(
          response,
          intl.formatMessage(googleDriveFolderManagementMessages.browseFailed),
        );
      }
      const body = await response.json();
      const items = Array.isArray(body.items) ? (body.items as BrowseItem[]) : [];
      return items.map<GoogleDriveTreeNode>((item) => ({
        id: item.id,
        name: item.name,
        driveId: node.driveId,
        depth: node.depth + 1,
        isFolder: isBrowseFolder(item),
        mimeType: item.mimeType,
        selectable: isSelectableItem(item),
        expanded: false,
        childrenLoaded: false,
        children: [],
      }));
    },
    [intl, organizationSlug, showTranslations],
  );

  const expandNode = useCallback(
    async (node: GoogleDriveTreeNode) => {
      if (!node.isFolder) {
        return;
      }
      const key = treeKey(node);
      const current = findNode(rootsRef.current, key);
      if (!current || !current.isFolder) {
        return;
      }
      if (current.expanded) {
        setRoots((tree) => updateNode(tree, key, (item) => ({ ...item, expanded: false })));
        return;
      }
      if (current.childrenLoaded) {
        setRoots((tree) => updateNode(tree, key, (item) => ({ ...item, expanded: true })));
        return;
      }

      setExpandingKeys((keys) => new Set(keys).add(key));
      try {
        const children = await loadChildren(current);
        setRoots((tree) =>
          updateNode(tree, key, (item) => ({
            ...item,
            childrenLoaded: true,
            expanded: true,
            children,
          })),
        );
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : intl.formatMessage(googleDriveFolderManagementMessages.browseFailed),
        );
      } finally {
        setExpandingKeys((keys) => {
          const next = new Set(keys);
          next.delete(key);
          return next;
        });
      }
    },
    [intl, loadChildren],
  );

  const handleToggle = useCallback(
    (node: GoogleDriveTreeNode, pathLabel: string) => {
      if (!node.selectable) {
        return;
      }
      const key = treeKey(node);
      const ancestors = findAncestorTrail(rootsRef.current, key) ?? [];
      const ancestorSelected = ancestors.some(
        (ancestor) =>
          selectedDriveIds.has(ancestor.id) || (lockedDriveIds?.has(ancestor.id) ?? false),
      );
      const isChecked =
        selectedDriveIds.has(node.id) ||
        ancestorSelected ||
        (lockedDriveIds?.has(node.id) ?? false);
      const select: GoogleDriveTreeToggleChange[] = [];
      const unselect: GoogleDriveTreeToggleChange[] = [];

      if (!isChecked) {
        select.push({ node, pathLabel });
        onToggle({ select, unselect });
        return;
      }

      const selectedAncestor = [...ancestors]
        .reverse()
        .find(
          (ancestor) =>
            selectedDriveIds.has(ancestor.id) && !(lockedDriveIds?.has(ancestor.id) ?? false),
        );
      if (selectedAncestor) {
        const ancestorTrail = findAncestorTrail(rootsRef.current, treeKey(selectedAncestor)) ?? [];
        unselect.push({
          node: selectedAncestor,
          pathLabel: nodePathLabel(selectedAncestor, ancestorTrail),
        });
        for (const ancestor of ancestorTrail) {
          if (selectedDriveIds.has(ancestor.id) && !lockedDriveIds?.has(ancestor.id)) {
            const trail = findAncestorTrail(rootsRef.current, treeKey(ancestor)) ?? [];
            unselect.push({ node: ancestor, pathLabel: nodePathLabel(ancestor, trail) });
          }
        }

        const pathFromAncestor = [...ancestors.slice(ancestorTrail.length + 1), node];
        let current = selectedAncestor;
        for (const nextOnPath of pathFromAncestor) {
          for (const sibling of current.children) {
            if (sibling.id === nextOnPath.id || !sibling.selectable) {
              continue;
            }
            if (lockedDriveIds?.has(sibling.id) || selectedDriveIds.has(sibling.id)) {
              continue;
            }
            const siblingTrail = findAncestorTrail(rootsRef.current, treeKey(sibling)) ?? [];
            select.push({ node: sibling, pathLabel: nodePathLabel(sibling, siblingTrail) });
          }
          current = nextOnPath;
        }
      }

      unselect.push({ node, pathLabel });
      for (const child of collectSelectableDescendants(node)) {
        if (selectedDriveIds.has(child.id) && !lockedDriveIds?.has(child.id)) {
          const childTrail = findAncestorTrail(rootsRef.current, treeKey(child)) ?? [];
          unselect.push({ node: child, pathLabel: nodePathLabel(child, childTrail) });
        }
      }
      onToggle({ select, unselect });
    },
    [lockedDriveIds, onToggle, selectedDriveIds],
  );

  useEffect(() => {
    if (connectedOnly) {
      setRoots(buildConnectedTree(connectedItems ?? []));
      return;
    }
    if (!drivesQuery.data || roots.length > 0) {
      return;
    }
    setRoots(buildRootNodes(drivesQuery.data));
  }, [connectedItems, connectedOnly, drivesQuery.data, roots.length]);

  function renderTree(nodes: GoogleDriveTreeNode[], pathPrefix: string, ancestorSelected: boolean) {
    return nodes.map((node) => {
      const key = treeKey(node);
      const pathLabel = pathPrefix ? `${pathPrefix}/${node.name}` : node.name;
      const isLocked = lockedDriveIds?.has(node.id) ?? false;
      const isSelected = isLocked || selectedDriveIds.has(node.id) || ancestorSelected;
      const isIndeterminate =
        !isSelected && node.isFolder && hasSelectedDescendant(node, selectedDriveIds);
      const isExpanding = expandingKeys.has(key);
      const expandLabel = intl.formatMessage(
        isExpanding
          ? googleDriveFolderManagementMessages.loadingFolder
          : node.expanded
            ? googleDriveFolderManagementMessages.collapseFolder
            : googleDriveFolderManagementMessages.expandFolder,
        { name: node.name },
      );
      return (
        <div key={key} className="pl-4">
          <DriveFolderTreeRow
            node={node}
            pathLabel={pathLabel}
            disabled={disabled}
            isLocked={isLocked}
            isSelected={isSelected}
            isIndeterminate={isIndeterminate}
            isExpanding={isExpanding}
            expandLabel={expandLabel}
            onExpand={(nextNode) => void expandNode(nextNode)}
            onToggle={handleToggle}
          />
          {node.expanded ? (
            node.children.length > 0 ? (
              renderTree(node.children, pathLabel, isSelected)
            ) : (
              <TypographyP size="small" tone="subtle" className="py-1 pl-12">
                <FormattedMessage {...googleDriveFolderManagementMessages.emptyChildFolders} />
              </TypographyP>
            )
          ) : null}
        </div>
      );
    });
  }

  if (!connectedOnly && drivesQuery.isLoading) {
    return <Skeleton className="h-40 rounded-lg" />;
  }

  if (!connectedOnly && drivesQuery.isError) {
    return (
      <TypographyP size="small" tone="subtle">
        {drivesQuery.error instanceof Error
          ? drivesQuery.error.message
          : intl.formatMessage(googleDriveFolderManagementMessages.browseFailed)}
      </TypographyP>
    );
  }

  return (
    <div className="max-h-72 overflow-y-auto rounded-lg border bg-canvas py-1">
      {renderTree(roots, "", false)}
    </div>
  );
}
