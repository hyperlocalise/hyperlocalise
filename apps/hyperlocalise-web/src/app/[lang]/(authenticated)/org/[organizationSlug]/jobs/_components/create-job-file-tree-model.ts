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

export type CreateJobFileTreeFile = {
  type: "file";
  id: string;
  name: string;
  path: string;
};

export type CreateJobFileTreeFolder = {
  type: "folder";
  name: string;
  path: string;
  children: CreateJobFileTreeNode[];
};

export type CreateJobFileTreeNode = CreateJobFileTreeFile | CreateJobFileTreeFolder;

export type CreateJobFileTreeItem = {
  id: string;
  label: string;
};

type DraftFolder = {
  name: string;
  path: string;
  files: CreateJobFileTreeFile[];
  folders: Map<string, DraftFolder>;
};

function compareNodes(left: CreateJobFileTreeNode, right: CreateJobFileTreeNode) {
  if (left.type !== right.type) {
    return left.type === "folder" ? -1 : 1;
  }
  return left.name.localeCompare(right.name);
}

function freezeFolder(folder: DraftFolder): CreateJobFileTreeFolder {
  const children: CreateJobFileTreeNode[] = [
    ...[...folder.folders.values()].map(freezeFolder),
    ...folder.files,
  ].toSorted(compareNodes);
  return {
    type: "folder",
    name: folder.name,
    path: folder.path,
    children,
  };
}

export function buildCreateJobFileTree(files: CreateJobFileTreeItem[]): CreateJobFileTreeNode[] {
  const rootFolders = new Map<string, DraftFolder>();
  const rootFiles: CreateJobFileTreeFile[] = [];

  function folderAt(parent: Map<string, DraftFolder>, name: string, path: string) {
    const existing = parent.get(name);
    if (existing) {
      return existing;
    }
    const created: DraftFolder = {
      name,
      path,
      files: [],
      folders: new Map(),
    };
    parent.set(name, created);
    return created;
  }

  for (const file of files) {
    const parts = file.label.split("/").filter(Boolean);
    if (parts.length === 0) {
      continue;
    }
    if (parts.length === 1) {
      rootFiles.push({
        type: "file",
        id: file.id,
        name: parts[0],
        path: file.label,
      });
      continue;
    }

    let folders = rootFolders;
    let path = "";
    let current: DraftFolder | undefined;
    for (const folderName of parts.slice(0, -1)) {
      path = path ? `${path}/${folderName}` : folderName;
      current = folderAt(folders, folderName, path);
      folders = current.folders;
    }
    current?.files.push({
      type: "file",
      id: file.id,
      name: parts[parts.length - 1],
      path: file.label,
    });
  }

  return [...[...rootFolders.values()].map(freezeFolder), ...rootFiles].toSorted(compareNodes);
}

export function collectCreateJobFileIds(node: CreateJobFileTreeNode): string[] {
  if (node.type === "file") {
    return [node.id];
  }
  return node.children.flatMap(collectCreateJobFileIds);
}

export function folderFileIdsByPath(nodes: CreateJobFileTreeNode[]): Map<string, string[]> {
  const idsByPath = new Map<string, string[]>();

  function walk(node: CreateJobFileTreeNode) {
    if (node.type === "file") {
      return;
    }
    idsByPath.set(node.path, collectCreateJobFileIds(node));
    for (const child of node.children) {
      walk(child);
    }
  }

  for (const node of nodes) {
    walk(node);
  }
  return idsByPath;
}

export function folderSelectionState(
  fileIds: string[],
  selectedIds: ReadonlySet<string>,
): "none" | "some" | "all" {
  if (fileIds.length === 0) {
    return "none";
  }
  let selectedCount = 0;
  for (const fileId of fileIds) {
    if (selectedIds.has(fileId)) {
      selectedCount += 1;
    }
  }
  if (selectedCount === 0) {
    return "none";
  }
  if (selectedCount === fileIds.length) {
    return "all";
  }
  return "some";
}

export function topLevelFolderPaths(nodes: CreateJobFileTreeNode[]): string[] {
  return nodes.flatMap((node) => (node.type === "folder" ? [node.path] : []));
}

export function allFolderPaths(nodes: CreateJobFileTreeNode[]): string[] {
  return nodes.flatMap((node) =>
    node.type === "folder" ? [node.path, ...allFolderPaths(node.children)] : [],
  );
}

export function filterCreateJobFileTree(
  nodes: CreateJobFileTreeNode[],
  query: string,
): CreateJobFileTreeNode[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return nodes;
  }

  function matchNode(node: CreateJobFileTreeNode): CreateJobFileTreeNode | null {
    if (node.type === "file") {
      return node.name.toLowerCase().includes(normalized) ||
        node.path.toLowerCase().includes(normalized)
        ? node
        : null;
    }
    const children = node.children.flatMap((child) => {
      const matched = matchNode(child);
      return matched ? [matched] : [];
    });
    if (node.name.toLowerCase().includes(normalized) || children.length > 0) {
      return { ...node, children };
    }
    return null;
  }

  return nodes.flatMap((node) => {
    const matched = matchNode(node);
    return matched ? [matched] : [];
  });
}
