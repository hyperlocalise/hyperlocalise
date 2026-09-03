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
import { assertNever } from "@/lib/primitives/assert-never/assert-never";
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
        {config.kind === "logic.for_each" ? (
          <div className="grid gap-1.5">
            <Label htmlFor="vw-for-each-collection">
              <FormattedMessage {...messages.forEachCollection} />
            </Label>
            <Textarea
              id="vw-for-each-collection"
              value={config.collection}
              onChange={(event) => onChangeConfig({ ...config, collection: event.target.value })}
              placeholder="{{trigger.items}}"
            />
          </div>
        ) : null}
        {config.kind === "action.notify_slack" ? (
          <>
            <div className="grid gap-1.5">
              <Label htmlFor="vw-slack-channel">
                <FormattedMessage {...messages.slackChannelId} />
              </Label>
              <Input
                id="vw-slack-channel"
                value={config.channelId}
                onChange={(event) => onChangeConfig({ ...config, channelId: event.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="vw-slack-message">
                <FormattedMessage {...messages.slackMessage} />
              </Label>
              <Textarea
                id="vw-slack-message"
                value={config.message}
                onChange={(event) => onChangeConfig({ ...config, message: event.target.value })}
              />
            </div>
          </>
        ) : null}
        {config.kind === "trigger.github" ? (
          <>
            <div className="grid gap-1.5">
              <Label htmlFor="vw-github-repo">
                <FormattedMessage {...messages.githubRepositoryId} />
              </Label>
              <Input
                id="vw-github-repo"
                value={config.githubInstallationRepositoryId}
                onChange={(event) =>
                  onChangeConfig({
                    ...config,
                    githubInstallationRepositoryId: event.target.value,
                  })
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="vw-github-branches">
                <FormattedMessage {...messages.githubBranches} />
              </Label>
              <Input
                id="vw-github-branches"
                value={config.branches.join(", ")}
                onChange={(event) =>
                  onChangeConfig({
                    ...config,
                    branches: event.target.value
                      .split(",")
                      .map((entry) => entry.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="main, release/*"
              />
            </div>
          </>
        ) : null}
        {config.kind === "trigger.scheduled" ? (
          <div className="grid gap-1.5">
            <Label htmlFor="vw-schedule-cadence">
              <FormattedMessage {...messages.scheduleCadence} />
            </Label>
            <Select
              value={config.schedule.cadence}
              items={[
                { value: "hourly", label: "Hourly" },
                { value: "daily", label: "Daily" },
                { value: "weekly", label: "Weekly" },
              ]}
              onValueChange={(value) => {
                if (value !== "hourly" && value !== "daily" && value !== "weekly") {
                  return;
                }
                onChangeConfig({
                  ...config,
                  schedule: { ...config.schedule, cadence: value },
                });
              }}
            >
              <SelectTrigger id="vw-schedule-cadence" className="w-full">
                <SelectValue>{config.schedule.cadence}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hourly" label="Hourly">
                  Hourly
                </SelectItem>
                <SelectItem value="daily" label="Daily">
                  Daily
                </SelectItem>
                <SelectItem value="weekly" label="Weekly">
                  Weekly
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : null}
        {config.kind === "trigger.source_upload" ? (
          <div className="grid gap-1.5">
            <Label htmlFor="vw-source-project">
              <FormattedMessage {...messages.sourceUploadProjectId} />
            </Label>
            <Input
              id="vw-source-project"
              value={config.projectId ?? ""}
              onChange={(event) =>
                onChangeConfig({
                  ...config,
                  projectId: event.target.value.trim() || undefined,
                })
              }
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
        {config.kind === "trigger.manual" ||
        config.kind === "trigger.scheduled" ||
        config.kind === "trigger.github" ||
        config.kind === "trigger.source_upload" ? (
          config.kind === "trigger.manual" ? (
            <TypographyP className="text-sm text-muted-foreground">
              <FormattedMessage {...messages.noConfig} />
            </TypographyP>
          ) : null
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
    case "invalid_trigger_config":
      return messages.invalidTriggerConfig;
    default:
      return assertNever(code);
  }
}
