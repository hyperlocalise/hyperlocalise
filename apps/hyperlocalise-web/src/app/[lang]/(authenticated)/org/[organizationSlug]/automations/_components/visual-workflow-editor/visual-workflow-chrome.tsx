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

import { visualWorkflowEditorMessages as messages } from "./visual-workflow-editor.messages";

export function VisualWorkflowChrome({
  name,
  onNameChange,
  copied,
  onExport,
  onCopy,
}: {
  name: string;
  onNameChange: (name: string) => void;
  copied: boolean;
  onExport: () => void;
  onCopy: () => void;
}) {
  const intl = useIntl();
  const previewOnly = intl.formatMessage(messages.previewOnly);

  return (
    <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border bg-background px-4 py-2.5">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Input
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          aria-label={intl.formatMessage(messages.workflowNameLabel)}
          className="h-8 max-w-xs border-transparent bg-transparent px-2 font-medium shadow-none focus-visible:border-ring"
        />
        <Badge variant="outline" className="rounded-full">
          <FormattedMessage {...messages.previewBadge} />
        </Badge>
      </div>

      <Tabs value="editor" className="items-center">
        <TabsList>
          <TabsTrigger value="editor">
            <FormattedMessage {...messages.editorTab} />
          </TabsTrigger>
          <Tooltip>
            <TooltipTrigger
              render={
                <span>
                  <TabsTrigger value="executions" disabled>
                    <FormattedMessage {...messages.executionsTab} />
                  </TabsTrigger>
                </span>
              }
            />
            <TooltipContent>
              <FormattedMessage {...messages.comingSoon} />
            </TooltipContent>
          </Tooltip>
        </TabsList>
      </Tabs>

      <div className="flex flex-1 items-center justify-end gap-2">
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
      </div>
    </header>
  );
}
