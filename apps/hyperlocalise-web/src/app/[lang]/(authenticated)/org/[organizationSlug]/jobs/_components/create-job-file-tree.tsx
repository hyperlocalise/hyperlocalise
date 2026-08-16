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
import { FormattedMessage, useIntl } from "react-intl";
import {
  ArrowRight01Icon,
  File01Icon,
  Folder01Icon,
  FolderOpenIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/primitives/cn";

import { createJobDialogMessages } from "./create-job-dialog.messages";
import {
  allFolderPaths,
  buildCreateJobFileTree,
  collectCreateJobFileIds,
  filterCreateJobFileTree,
  folderSelectionState,
  topLevelFolderPaths,
  type CreateJobFileTreeFolder,
  type CreateJobFileTreeItem,
  type CreateJobFileTreeNode,
} from "./create-job-file-tree-model";

const ROW_CLASS =
  "flex min-h-7 w-full items-center gap-1.5 rounded-md px-1.5 text-xs hover:bg-muted/60";

function toggleIds(selectedIds: string[], ids: string[], shouldSelect: boolean) {
  if (shouldSelect) {
    return [...new Set([...selectedIds, ...ids])].toSorted((left, right) =>
      left.localeCompare(right),
    );
  }
  const remove = new Set(ids);
  return selectedIds.filter((id) => !remove.has(id));
}

function FolderCheckbox({
  state,
  label,
  disabled,
  onToggle,
}: {
  state: "none" | "some" | "all";
  label: string;
  disabled?: boolean;
  onToggle: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = state === "some";
    }
  }, [state]);

  return (
    <input
      ref={inputRef}
      type="checkbox"
      checked={state === "all"}
      disabled={disabled}
      aria-label={label}
      className="size-3.5 shrink-0 rounded border border-input accent-primary"
      onChange={onToggle}
      onClick={(event) => event.stopPropagation()}
    />
  );
}

function FileTreeFolder({
  folder,
  depth,
  selectedIds,
  expandedPaths,
  disabled,
  onToggleIds,
  onExpandedChange,
}: {
  folder: CreateJobFileTreeFolder;
  depth: number;
  selectedIds: string[];
  expandedPaths: Set<string>;
  disabled?: boolean;
  onToggleIds: (ids: string[], shouldSelect: boolean) => void;
  onExpandedChange: (path: string, open: boolean) => void;
}) {
  const intl = useIntl();
  const fileIds = useMemo(() => collectCreateJobFileIds(folder), [folder]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const state = folderSelectionState(fileIds, selectedSet);
  const open = expandedPaths.has(folder.path);
  const selectFolderLabel = intl.formatMessage(createJobDialogMessages.selectFolder, {
    folder: folder.path,
  });

  return (
    <Collapsible open={open} onOpenChange={(nextOpen) => onExpandedChange(folder.path, nextOpen)}>
      <div style={{ paddingInlineStart: depth * 12 }} className={ROW_CLASS}>
        <CollapsibleTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={intl.formatMessage(
                open
                  ? createJobDialogMessages.collapseFolder
                  : createJobDialogMessages.expandFolder,
                { folder: folder.name },
              )}
              className="size-5 shrink-0 text-muted-foreground"
            />
          }
        >
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            strokeWidth={1.8}
            data-icon
            className={cn(
              "size-3.5 transition-transform rtl:rotate-180",
              open && "rotate-90 rtl:rotate-90",
            )}
          />
        </CollapsibleTrigger>
        <FolderCheckbox
          state={state}
          label={selectFolderLabel}
          disabled={disabled}
          onToggle={() => onToggleIds(fileIds, state !== "all")}
        />
        <HugeiconsIcon
          icon={open ? FolderOpenIcon : Folder01Icon}
          strokeWidth={1.8}
          className="size-3.5 shrink-0 text-muted-foreground"
        />
        <span className="min-w-0 truncate font-medium">{folder.name}</span>
      </div>
      <CollapsibleContent>
        <div role="group" className="flex flex-col">
          {folder.children.map((child) => (
            <FileTreeNode
              key={child.type === "folder" ? `folder:${child.path}` : child.id}
              node={child}
              depth={depth + 1}
              selectedIds={selectedIds}
              expandedPaths={expandedPaths}
              disabled={disabled}
              onToggleIds={onToggleIds}
              onExpandedChange={onExpandedChange}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function FileTreeNode({
  node,
  depth,
  selectedIds,
  expandedPaths,
  disabled,
  onToggleIds,
  onExpandedChange,
}: {
  node: CreateJobFileTreeNode;
  depth: number;
  selectedIds: string[];
  expandedPaths: Set<string>;
  disabled?: boolean;
  onToggleIds: (ids: string[], shouldSelect: boolean) => void;
  onExpandedChange: (path: string, open: boolean) => void;
}) {
  if (node.type === "folder") {
    return (
      <FileTreeFolder
        folder={node}
        depth={depth}
        selectedIds={selectedIds}
        expandedPaths={expandedPaths}
        disabled={disabled}
        onToggleIds={onToggleIds}
        onExpandedChange={onExpandedChange}
      />
    );
  }

  const checked = selectedIds.includes(node.id);
  return (
    <label
      style={{ paddingInlineStart: 20 + depth * 12 }}
      className={cn(ROW_CLASS, "cursor-pointer")}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={node.path}
        className="size-3.5 shrink-0 rounded border border-input accent-primary"
        onChange={() => onToggleIds([node.id], !checked)}
      />
      <HugeiconsIcon
        icon={File01Icon}
        strokeWidth={1.8}
        className="size-3.5 shrink-0 text-muted-foreground"
      />
      <span className="min-w-0 truncate">{node.name}</span>
    </label>
  );
}

export function CreateJobFileTree({
  files,
  selectedIds,
  onSelectedIdsChange,
  isLoading,
  disabled,
}: {
  files: CreateJobFileTreeItem[];
  selectedIds: string[];
  onSelectedIdsChange: (ids: string[]) => void;
  isLoading?: boolean;
  disabled?: boolean;
}) {
  const intl = useIntl();
  const [query, setQuery] = useState("");
  const tree = useMemo(() => buildCreateJobFileTree(files), [files]);
  const filteredTree = useMemo(() => filterCreateJobFileTree(tree, query), [query, tree]);
  const defaultExpanded = useMemo(() => topLevelFolderPaths(tree), [tree]);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set(defaultExpanded));
  const treeKey = useMemo(() => files.map((file) => file.id).join("\0"), [files]);

  useEffect(() => {
    setExpandedPaths(new Set(topLevelFolderPaths(tree)));
  }, [tree, treeKey]);

  const visibleExpandedPaths = useMemo(() => {
    if (query.trim()) {
      return new Set(allFolderPaths(filteredTree));
    }
    return expandedPaths;
  }, [expandedPaths, filteredTree, query]);

  function handleToggleIds(ids: string[], shouldSelect: boolean) {
    onSelectedIdsChange(toggleIds(selectedIds, ids, shouldSelect));
  }

  function handleExpandedChange(path: string, open: boolean) {
    setExpandedPaths((current) => {
      const next = new Set(current);
      if (open) {
        next.add(path);
      } else {
        next.delete(path);
      }
      return next;
    });
  }

  const filesLabel = intl.formatMessage(createJobDialogMessages.filesLabel);

  return (
    <div className="flex min-h-0 flex-col gap-1.5 rounded-lg border border-border/80 bg-muted/20 p-2">
      <div className="flex items-center justify-between gap-2 px-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <p className="text-xs font-medium text-muted-foreground">{filesLabel}</p>
          {selectedIds.length > 0 ? (
            <p className="text-xs tabular-nums text-muted-foreground">
              {intl.formatMessage(createJobDialogMessages.filesSelectedCount, {
                count: selectedIds.length,
              })}
            </p>
          ) : null}
        </div>
        {files.length > 0 ? (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={disabled || isLoading || selectedIds.length === files.length}
              onClick={() => onSelectedIdsChange(files.map((file) => file.id))}
            >
              <FormattedMessage {...createJobDialogMessages.selectAll} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={disabled || isLoading || selectedIds.length === 0}
              onClick={() => onSelectedIdsChange([])}
            >
              <FormattedMessage {...createJobDialogMessages.clear} />
            </Button>
          </div>
        ) : null}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 px-0.5 py-3 text-xs text-muted-foreground">
          <Spinner />
          <FormattedMessage {...createJobDialogMessages.loading} />
        </div>
      ) : files.length === 0 ? (
        <p className="px-0.5 py-3 text-xs text-muted-foreground">
          <FormattedMessage {...createJobDialogMessages.noFilesAvailable} />
        </p>
      ) : (
        <>
          <Input
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
              }
            }}
            placeholder={intl.formatMessage(createJobDialogMessages.searchFiles)}
            aria-label={intl.formatMessage(createJobDialogMessages.searchFiles)}
            disabled={disabled}
            autoComplete="off"
            className="h-8 bg-background/60 text-xs md:text-xs"
          />
          {filteredTree.length === 0 ? (
            <p className="px-0.5 py-3 text-xs text-muted-foreground">
              <FormattedMessage {...createJobDialogMessages.filesSearchEmpty} />
            </p>
          ) : (
            <div
              className="flex max-h-52 flex-col overflow-y-auto"
              role="group"
              aria-label={filesLabel}
            >
              {filteredTree.map((node) => (
                <FileTreeNode
                  key={node.type === "folder" ? `folder:${node.path}` : node.id}
                  node={node}
                  depth={0}
                  selectedIds={selectedIds}
                  expandedPaths={visibleExpandedPaths}
                  disabled={disabled}
                  onToggleIds={handleToggleIds}
                  onExpandedChange={handleExpandedChange}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
