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
import { CaretDownIcon } from "@phosphor-icons/react";
import { FormattedMessage, useIntl } from "react-intl";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/primitives/cn";
import type { VisualWorkflowStatus } from "@/lib/visual-workflows/visual-workflow-types";

import { AutomationAssistantOpenButton } from "../automation-assistant-panel";
import { visualWorkflowEditorMessages as messages } from "./visual-workflow-editor.messages";

// The workflow's status and the switch that changes it, as one pill.
const STATUS_TOGGLE_CLASS =
  "flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-border px-2 text-xs font-medium whitespace-nowrap";

export function VisualWorkflowChrome({
  name,
  onNameChange,
  undoRedo,
  copied,
  onExport,
  onCopy,
  onSave,
  isSaving = false,
  saveDisabled = false,
  previewMode = false,
  playgroundMode = false,
  activeTab = "editor",
  onTabChange,
  workflowStatus = "draft",
  onStatusChange,
  statusDisabled = false,
  onDelete,
  isDeleting = false,
}: {
  name: string;
  onNameChange: (name: string) => void;
  /** Undo and redo buttons, shown first among the actions. */
  undoRedo?: ReactNode;
  copied: boolean;
  onExport: () => void;
  onCopy: () => void;
  onSave?: () => void;
  isSaving?: boolean;
  saveDisabled?: boolean;
  previewMode?: boolean;
  playgroundMode?: boolean;
  activeTab?: "editor" | "executions";
  onTabChange?: (tab: "editor" | "executions") => void;
  workflowStatus?: VisualWorkflowStatus;
  onStatusChange?: (active: boolean) => void;
  statusDisabled?: boolean;
  onDelete?: () => void;
  isDeleting?: boolean;
}) {
  const intl = useIntl();
  const previewOnly = intl.formatMessage(messages.previewOnly);
  const isActive = workflowStatus === "active";

  return (
    <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border bg-background px-4 py-2.5">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {previewMode || !onStatusChange ? (
          <Tooltip>
            <TooltipTrigger
              render={
                // On a phone the badge beside the name says as much, and the row has no room.
                <span className={cn(STATUS_TOGGLE_CLASS, "hidden text-muted-foreground sm:flex")}>
                  <Switch
                    disabled
                    size="sm"
                    aria-label={intl.formatMessage(messages.inactiveLabel)}
                  />
                  <FormattedMessage {...messages.inactiveLabel} />
                </span>
              }
            />
            <TooltipContent>{previewOnly}</TooltipContent>
          </Tooltip>
        ) : (
          // The switch takes its name from the label around it, which is the status shown.
          <label
            className={cn(
              STATUS_TOGGLE_CLASS,
              isActive ? "text-foreground" : "text-muted-foreground",
              statusDisabled || isSaving ? null : "cursor-pointer",
            )}
          >
            <Switch
              checked={isActive}
              disabled={statusDisabled || isSaving}
              size="sm"
              onCheckedChange={(checked) => onStatusChange(checked)}
            />
            {/* On a phone the switch alone shows the status, and leaves the row to the name. */}
            <span className="sr-only sm:not-sr-only">
              {isActive ? (
                <FormattedMessage {...messages.activeLabel} />
              ) : workflowStatus === "paused" ? (
                <FormattedMessage {...messages.pausedLabel} />
              ) : (
                <FormattedMessage {...messages.inactiveLabel} />
              )}
            </span>
          </label>
        )}
        <Input
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          aria-label={intl.formatMessage(messages.workflowNameLabel)}
          variant="inline"
          className="max-w-xs px-2 font-medium"
        />
        {playgroundMode ? (
          <Badge variant="outline" className="rounded-full">
            <FormattedMessage {...messages.playgroundBadge} />
          </Badge>
        ) : previewMode ? (
          <Badge variant="outline" className="rounded-full">
            <FormattedMessage {...messages.previewBadge} />
          </Badge>
        ) : null}
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          if (value === "editor" || value === "executions") {
            onTabChange?.(value);
          }
        }}
        className="items-center"
      >
        <TabsList>
          <TabsTrigger value="editor">
            <FormattedMessage {...messages.editorTab} />
          </TabsTrigger>
          <TabsTrigger value="executions" disabled={previewMode}>
            <FormattedMessage {...messages.executionsTab} />
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex flex-1 items-center justify-end gap-2">
        {/* Renders nothing where the assistant is not offered. */}
        <AutomationAssistantOpenButton />
        {undoRedo}
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button type="button" variant="outline" size="sm" />}>
            {/* The menu closes on a choice, so the button itself confirms a copy. */}
            {copied ? (
              <FormattedMessage {...messages.copiedJson} />
            ) : (
              <FormattedMessage {...messages.exportMenu} />
            )}
            <CaretDownIcon data-icon="inline-end" className="size-3.5 opacity-60" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onCopy}>
              <FormattedMessage {...messages.copyJson} />
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onExport}>
              <FormattedMessage {...messages.exportJson} />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {onDelete ? (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={isDeleting || isSaving}
            onClick={onDelete}
          >
            <FormattedMessage {...messages.deleteWorkflow} />
          </Button>
        ) : null}
        {onStatusChange ? (
          <Button
            type="button"
            size="sm"
            disabled={statusDisabled || isSaving}
            onClick={() => onStatusChange(true)}
          >
            {intl.formatMessage({
              defaultMessage: "Publish",
              id: "rUIfR5O8Wi",
              description: "Publish and activate the current workflow draft",
            })}
          </Button>
        ) : null}
        {onSave ? (
          <Button type="button" size="sm" disabled={saveDisabled || isSaving} onClick={onSave}>
            {isSaving ? (
              <FormattedMessage {...messages.saving} />
            ) : (
              <FormattedMessage {...messages.save} />
            )}
          </Button>
        ) : (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button type="button" size="sm" disabled>
                  <FormattedMessage {...messages.save} />
                </Button>
              }
            />
            <TooltipContent>{previewOnly}</TooltipContent>
          </Tooltip>
        )}
      </div>
    </header>
  );
}
