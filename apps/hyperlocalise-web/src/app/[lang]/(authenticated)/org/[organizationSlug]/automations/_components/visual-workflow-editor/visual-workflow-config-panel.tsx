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
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TypographyP } from "@/components/ui/typography";
import type {
  HttpMethod,
  VisualNodeConfig,
  VisualWorkflowRfNode,
  VisualWorkflowValidationIssue,
} from "@/lib/visual-workflows/schema/types";

import { visualWorkflowEditorMessages as messages } from "./visual-workflow-editor.messages";

const HTTP_METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

export function VisualWorkflowConfigPanel({
  node,
  issues,
  onBack,
  onChangeConfig,
}: {
  node: VisualWorkflowRfNode;
  issues: readonly VisualWorkflowValidationIssue[];
  onBack: () => void;
  onChangeConfig: (config: VisualNodeConfig) => void;
}) {
  const intl = useIntl();
  const { config } = node.data;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" strokeWidth={2} />
          <FormattedMessage {...messages.backToPicker} />
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        <h2 className="text-sm font-medium">
          <FormattedMessage {...messages.configTitle} />
        </h2>
        {config.kind === "action.http" ? (
          <>
            <div className="grid gap-1.5">
              <Label htmlFor="vw-http-method">
                <FormattedMessage {...messages.httpMethod} />
              </Label>
              <Select
                value={config.method}
                items={HTTP_METHODS.map((method) => ({ value: method, label: method }))}
                onValueChange={(value) => {
                  if (!value || !isHttpMethod(value)) {
                    return;
                  }
                  onChangeConfig({ ...config, method: value });
                }}
              >
                <SelectTrigger id="vw-http-method" className="w-full">
                  <SelectValue>{config.method}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {HTTP_METHODS.map((method) => (
                    <SelectItem key={method} value={method} label={method}>
                      {method}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="vw-http-url">
                <FormattedMessage {...messages.httpUrl} />
              </Label>
              <Input
                id="vw-http-url"
                value={config.url}
                onChange={(event) => onChangeConfig({ ...config, url: event.target.value })}
                placeholder="https://"
              />
            </div>
          </>
        ) : null}
        {config.kind === "logic.if" ? (
          <div className="grid gap-1.5">
            <Label htmlFor="vw-if-condition">
              <FormattedMessage {...messages.ifCondition} />
            </Label>
            <Textarea
              id="vw-if-condition"
              value={config.condition}
              onChange={(event) => onChangeConfig({ ...config, condition: event.target.value })}
            />
          </div>
        ) : null}
        {config.kind === "ai.agent" ? (
          <>
            <div className="grid gap-1.5">
              <Label htmlFor="vw-ai-prompt">
                <FormattedMessage {...messages.aiPrompt} />
              </Label>
              <Textarea
                id="vw-ai-prompt"
                value={config.prompt}
                onChange={(event) => onChangeConfig({ ...config, prompt: event.target.value })}
              />
            </div>
            <div className="rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
              <p>
                <FormattedMessage {...messages.aiModelSlot} />
              </p>
              <p>
                <FormattedMessage {...messages.aiToolsSlot} />
              </p>
              <p className="mt-1 text-xs">
                <FormattedMessage {...messages.stubSlotHint} />
              </p>
            </div>
          </>
        ) : null}
        {config.kind === "trigger.manual" ? (
          <TypographyP className="text-sm text-muted-foreground">
            <FormattedMessage {...messages.noConfig} />
          </TypographyP>
        ) : null}
      </div>
      {issues.length > 0 ? (
        <div className="border-t border-border px-4 py-3 text-sm text-destructive">
          {issues.map((issue) => (
            <p key={`${issue.code}-${issue.nodeId ?? issue.edgeId ?? "all"}`}>
              {intl.formatMessage(issueMessage(issue.code))}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function isHttpMethod(value: string): value is HttpMethod {
  return HTTP_METHODS.includes(value as HttpMethod);
}

function issueMessage(code: VisualWorkflowValidationIssue["code"]) {
  switch (code) {
    case "missing_trigger":
      return messages.missingTrigger;
    case "multiple_triggers":
      return messages.multipleTriggers;
    case "orphan_node":
      return messages.orphanNode;
    case "invalid_edge":
      return messages.invalidEdge;
  }
}
