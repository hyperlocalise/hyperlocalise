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
import { FormattedMessage, useIntl } from "react-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { VisualWorkflowStatus } from "@/lib/visual-workflows/visual-workflow-types";

import { visualWorkflowEditorMessages as messages } from "./visual-workflow-editor.messages";

export function VisualWorkflowChrome({
  name,
  onNameChange,
  copied,
  onExport,
  onCopy,
  onSave,
  isSaving = false,
  saveDisabled = false,
  previewMode = false,
  activeTab = "editor",
  onTabChange,
  workflowStatus = "draft",
  onStatusChange,
  statusDisabled = false,
}: {
  name: string;
  onNameChange: (name: string) => void;
  copied: boolean;
  onExport: () => void;
  onCopy: () => void;
  onSave?: () => void;
  isSaving?: boolean;
  saveDisabled?: boolean;
  previewMode?: boolean;
  activeTab?: "editor" | "executions";
  onTabChange?: (tab: "editor" | "executions") => void;
  workflowStatus?: VisualWorkflowStatus;
  onStatusChange?: (active: boolean) => void;
  statusDisabled?: boolean;
}) {
  const intl = useIntl();
  const previewOnly = intl.formatMessage(messages.previewOnly);
  const isActive = workflowStatus === "active";

  return (
    <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border bg-background px-4 py-2.5">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Input
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          aria-label={intl.formatMessage(messages.workflowNameLabel)}
          variant="inline"
          className="max-w-xs px-2 font-medium"
        />
        {previewMode ? (
          <Badge variant="outline" className="rounded-full">
            <FormattedMessage {...messages.previewBadge} />
          </Badge>
        ) : workflowStatus !== "draft" ? (
          <Badge variant={isActive ? "default" : "outline"} className="rounded-full">
            {isActive ? (
              <FormattedMessage {...messages.activeLabel} />
            ) : (
              <FormattedMessage {...messages.pausedLabel} />
            )}
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
        {previewMode || !onStatusChange ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
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
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <Switch
              checked={isActive}
              disabled={statusDisabled || isSaving}
              size="sm"
              aria-label={intl.formatMessage(messages.activeLabel)}
              onCheckedChange={(checked) => onStatusChange(checked)}
            />
            {isActive ? (
              <FormattedMessage {...messages.activeLabel} />
            ) : (
              <FormattedMessage {...messages.inactiveLabel} />
            )}
          </span>
        )}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button type="button" variant="outline" size="sm" disabled>
                <FormattedMessage {...messages.share} />
              </Button>
            }
          />
          <TooltipContent>{previewOnly}</TooltipContent>
        </Tooltip>
        <Button type="button" variant="outline" size="sm" onClick={onCopy}>
          {copied ? (
            <FormattedMessage {...messages.copiedJson} />
          ) : (
            <FormattedMessage {...messages.copyJson} />
          )}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onExport}>
          <FormattedMessage {...messages.exportJson} />
        </Button>
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
