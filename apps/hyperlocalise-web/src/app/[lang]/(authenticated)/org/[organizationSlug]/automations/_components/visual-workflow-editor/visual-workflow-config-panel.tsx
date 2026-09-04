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
import { ArrowLeft01Icon, Delete02Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  HttpAuthType,
  HttpMethod,
  VisualKeyValuePair,
  VisualNodeConfig,
  VisualNodeErrorBehavior,
  VisualWorkflowGithubTriggerEvent,
  VisualWorkflowRfNode,
  VisualWorkflowValidationIssue,
} from "@/lib/visual-workflows/schema/types";

import { visualWorkflowEditorMessages as messages } from "./visual-workflow-editor.messages";

const HTTP_METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const ERROR_BEHAVIORS: VisualNodeErrorBehavior[] = ["stop", "continue", "branch"];
const GITHUB_EVENTS: VisualWorkflowGithubTriggerEvent[] = ["push", "pull_request"];
const TIMEZONES = ["UTC", "America/New_York", "America/Los_Angeles", "Europe/London", "Asia/Tokyo"];

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
            <SelectField
              id="vw-http-method"
              label={intl.formatMessage(messages.httpMethod)}
              value={config.method}
              items={HTTP_METHODS.map((method) => ({ value: method, label: method }))}
              onValueChange={(value) => {
                if (!value || !isHttpMethod(value)) {
                  return;
                }
                onChangeConfig({ ...config, method: value });
              }}
            />
            <TextField
              id="vw-http-url"
              label={intl.formatMessage(messages.httpUrl)}
              value={config.url}
              onChange={(value) => onChangeConfig({ ...config, url: value })}
              placeholder="https://"
            />
            <KeyValueEditor
              label={intl.formatMessage(messages.httpQueryParams)}
              pairs={config.queryParams ?? []}
              onChange={(pairs) => onChangeConfig({ ...config, queryParams: pairs })}
            />
            <KeyValueEditor
              label={intl.formatMessage(messages.httpHeaders)}
              pairs={config.headers ?? []}
              onChange={(pairs) => onChangeConfig({ ...config, headers: pairs })}
            />
            <SelectField
              id="vw-http-body-type"
              label={intl.formatMessage(messages.httpBodyType)}
              value={config.bodyType ?? "none"}
              items={[
                { value: "none", label: intl.formatMessage(messages.httpBodyNone) },
                { value: "json", label: intl.formatMessage(messages.httpBodyJson) },
                { value: "text", label: intl.formatMessage(messages.httpBodyText) },
              ]}
              onValueChange={(value) => {
                if (value !== "none" && value !== "json" && value !== "text") {
                  return;
                }
                onChangeConfig({ ...config, bodyType: value });
              }}
            />
            {(config.bodyType ?? "none") !== "none" ? (
              <TextAreaField
                id="vw-http-body"
                label={intl.formatMessage(messages.httpBody)}
                value={config.body ?? ""}
                onChange={(value) => onChangeConfig({ ...config, body: value })}
                placeholder='{"key": "{{trigger.id}}"}'
              />
            ) : null}
            <SelectField
              id="vw-http-auth-type"
              label={intl.formatMessage(messages.httpAuthType)}
              value={config.auth?.type ?? "none"}
              items={[
                { value: "none", label: intl.formatMessage(messages.httpAuthNone) },
                { value: "bearer", label: intl.formatMessage(messages.httpAuthBearer) },
                { value: "api_key", label: intl.formatMessage(messages.httpAuthApiKey) },
              ]}
              onValueChange={(value) => {
                if (!value || !isHttpAuthType(value)) {
                  return;
                }
                onChangeConfig({
                  ...config,
                  auth: { ...config.auth, type: value, token: config.auth?.token ?? "" },
                });
              }}
            />
            {(config.auth?.type ?? "none") !== "none" ? (
              <>
                <TextField
                  id="vw-http-auth-token"
                  label={intl.formatMessage(messages.httpAuthToken)}
                  value={config.auth?.token ?? ""}
                  onChange={(value) =>
                    onChangeConfig({
                      ...config,
                      auth: {
                        type: config.auth?.type ?? "bearer",
                        token: value,
                        headerName: config.auth?.headerName,
                      },
                    })
                  }
                />
                {config.auth?.type === "api_key" ? (
                  <TextField
                    id="vw-http-auth-header"
                    label={intl.formatMessage(messages.httpAuthHeaderName)}
                    value={config.auth?.headerName ?? "X-API-Key"}
                    onChange={(value) =>
                      onChangeConfig({
                        ...config,
                        auth: {
                          type: "api_key",
                          token: config.auth?.token ?? "",
                          headerName: value,
                        },
                      })
                    }
                  />
                ) : null}
              </>
            ) : null}
            <CheckboxField
              id="vw-http-parse-json"
              label={intl.formatMessage(messages.httpParseJson)}
              checked={config.parseJsonBody ?? true}
              onCheckedChange={(checked) =>
                onChangeConfig({ ...config, parseJsonBody: checked === true })
              }
            />
            <CheckboxField
              id="vw-http-fail-on-error"
              label={intl.formatMessage(messages.httpFailOnError)}
              checked={config.failOnHttpError ?? true}
              onCheckedChange={(checked) =>
                onChangeConfig({ ...config, failOnHttpError: checked === true })
              }
            />
            <ErrorBehaviorField
              value={config.onError ?? "stop"}
              onChange={(onError) => onChangeConfig({ ...config, onError })}
            />
          </>
        ) : null}
        {config.kind === "logic.if" ? (
          <TextAreaField
            id="vw-if-condition"
            label={intl.formatMessage(messages.ifCondition)}
            value={config.condition}
            onChange={(value) => onChangeConfig({ ...config, condition: value })}
          />
        ) : null}
        {config.kind === "logic.switch" ? (
          <>
            <TextAreaField
              id="vw-switch-expression"
              label={intl.formatMessage(messages.switchExpression)}
              value={config.expression}
              onChange={(value) => onChangeConfig({ ...config, expression: value })}
              placeholder="{{nodes.http.json.status}}"
            />
            <div className="grid gap-2">
              <Label>
                <FormattedMessage {...messages.switchCases} />
              </Label>
              {config.cases.map((caseEntry, index) => (
                <div key={`case-${index}`} className="flex items-center gap-2">
                  <Input
                    value={caseEntry.value}
                    onChange={(event) => {
                      const cases = config.cases.map((entry, caseIndex) =>
                        caseIndex === index ? { value: event.target.value } : entry,
                      );
                      onChangeConfig({ ...config, cases });
                    }}
                    placeholder={intl.formatMessage(messages.switchCaseValue, {
                      index: index + 1,
                    })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={config.cases.length <= 1}
                    onClick={() => {
                      onChangeConfig({
                        ...config,
                        cases: config.cases.filter((_, caseIndex) => caseIndex !== index),
                      });
                    }}
                  >
                    <HugeiconsIcon icon={Delete02Icon} className="size-4" strokeWidth={2} />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={config.cases.length >= 12}
                onClick={() =>
                  onChangeConfig({
                    ...config,
                    cases: [...config.cases, { value: "" }],
                  })
                }
              >
                <HugeiconsIcon icon={PlusSignIcon} className="size-4" strokeWidth={2} />
                <FormattedMessage {...messages.addSwitchCase} />
              </Button>
            </div>
          </>
        ) : null}
        {config.kind === "logic.set" ? (
          <KeyValueEditor
            label={intl.formatMessage(messages.setAssignments)}
            keyLabel={intl.formatMessage(messages.setFieldName)}
            valueLabel={intl.formatMessage(messages.setFieldValue)}
            pairs={config.assignments}
            onChange={(assignments) => onChangeConfig({ ...config, assignments })}
          />
        ) : null}
        {config.kind === "logic.for_each" ? (
          <TextAreaField
            id="vw-for-each-collection"
            label={intl.formatMessage(messages.forEachCollection)}
            value={config.collection}
            onChange={(value) => onChangeConfig({ ...config, collection: value })}
            placeholder="{{trigger.items}}"
          />
        ) : null}
        {config.kind === "action.notify_slack" ? (
          <>
            <TextField
              id="vw-slack-channel"
              label={intl.formatMessage(messages.slackChannelId)}
              value={config.channelId}
              onChange={(value) => onChangeConfig({ ...config, channelId: value })}
            />
            <TextAreaField
              id="vw-slack-message"
              label={intl.formatMessage(messages.slackMessage)}
              value={config.message}
              onChange={(value) => onChangeConfig({ ...config, message: value })}
            />
            <ErrorBehaviorField
              value={config.onError ?? "stop"}
              onChange={(onError) => onChangeConfig({ ...config, onError })}
            />
          </>
        ) : null}
        {config.kind === "trigger.github" ? (
          <>
            <TextField
              id="vw-github-repo"
              label={intl.formatMessage(messages.githubRepositoryId)}
              value={config.githubInstallationRepositoryId}
              onChange={(value) =>
                onChangeConfig({
                  ...config,
                  githubInstallationRepositoryId: value,
                })
              }
            />
            <TextField
              id="vw-github-branches"
              label={intl.formatMessage(messages.githubBranches)}
              value={config.branches.join(", ")}
              onChange={(value) =>
                onChangeConfig({
                  ...config,
                  branches: value
                    .split(",")
                    .map((entry) => entry.trim())
                    .filter(Boolean),
                })
              }
              placeholder="main, release/*"
            />
            <div className="grid gap-2">
              <Label>
                <FormattedMessage {...messages.githubEvents} />
              </Label>
              {GITHUB_EVENTS.map((event) => {
                const events = config.events ?? ["push"];
                const checked = events.includes(event);
                return (
                  <CheckboxField
                    key={event}
                    id={`vw-github-event-${event}`}
                    label={intl.formatMessage(
                      event === "push" ? messages.githubEventPush : messages.githubEventPullRequest,
                    )}
                    checked={checked}
                    onCheckedChange={(isChecked) => {
                      const nextEvents = isChecked
                        ? [...new Set([...events, event])]
                        : events.filter((entry) => entry !== event);
                      onChangeConfig({
                        ...config,
                        events: nextEvents.length > 0 ? nextEvents : ["push"],
                      });
                    }}
                  />
                );
              })}
            </div>
          </>
        ) : null}
        {config.kind === "trigger.scheduled" ? (
          <>
            <SelectField
              id="vw-schedule-cadence"
              label={intl.formatMessage(messages.scheduleCadence)}
              value={config.schedule.cadence}
              items={[
                { value: "hourly", label: intl.formatMessage(messages.scheduleHourly) },
                { value: "daily", label: intl.formatMessage(messages.scheduleDaily) },
                { value: "weekly", label: intl.formatMessage(messages.scheduleWeekly) },
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
            />
            {config.schedule.cadence !== "hourly" ? (
              <SelectField
                id="vw-schedule-hour"
                label={intl.formatMessage(messages.scheduleHour)}
                value={String(config.schedule.hourUtc ?? 9)}
                items={Array.from({ length: 24 }, (_, hour) => ({
                  value: String(hour),
                  label: `${String(hour).padStart(2, "0")}:00 UTC`,
                }))}
                onValueChange={(value) => {
                  if (!value) {
                    return;
                  }
                  onChangeConfig({
                    ...config,
                    schedule: { ...config.schedule, hourUtc: Number(value) },
                  });
                }}
              />
            ) : null}
            {config.schedule.cadence === "weekly" ? (
              <SelectField
                id="vw-schedule-day"
                label={intl.formatMessage(messages.scheduleDayOfWeek)}
                value={String(config.schedule.dayOfWeek ?? 1)}
                items={[
                  { value: "0", label: intl.formatMessage(messages.scheduleSunday) },
                  { value: "1", label: intl.formatMessage(messages.scheduleMonday) },
                  { value: "2", label: intl.formatMessage(messages.scheduleTuesday) },
                  { value: "3", label: intl.formatMessage(messages.scheduleWednesday) },
                  { value: "4", label: intl.formatMessage(messages.scheduleThursday) },
                  { value: "5", label: intl.formatMessage(messages.scheduleFriday) },
                  { value: "6", label: intl.formatMessage(messages.scheduleSaturday) },
                ]}
                onValueChange={(value) => {
                  if (!value) {
                    return;
                  }
                  onChangeConfig({
                    ...config,
                    schedule: { ...config.schedule, dayOfWeek: Number(value) },
                  });
                }}
              />
            ) : null}
            <SelectField
              id="vw-schedule-timezone"
              label={intl.formatMessage(messages.scheduleTimezone)}
              value={config.schedule.timezone ?? "UTC"}
              items={TIMEZONES.map((timezone) => ({ value: timezone, label: timezone }))}
              onValueChange={(value) => {
                if (!value) {
                  return;
                }
                onChangeConfig({
                  ...config,
                  schedule: { ...config.schedule, timezone: value },
                });
              }}
            />
          </>
        ) : null}
        {config.kind === "trigger.source_upload" ? (
          <TextField
            id="vw-source-project"
            label={intl.formatMessage(messages.sourceUploadProjectId)}
            value={config.projectId ?? ""}
            onChange={(value) =>
              onChangeConfig({
                ...config,
                projectId: value.trim() || undefined,
              })
            }
          />
        ) : null}
        {config.kind === "ai.agent" ? (
          <>
            <TextAreaField
              id="vw-ai-prompt"
              label={intl.formatMessage(messages.aiPrompt)}
              value={config.prompt}
              onChange={(value) => onChangeConfig({ ...config, prompt: value })}
            />
            <ErrorBehaviorField
              value={config.onError ?? "stop"}
              onChange={(onError) => onChangeConfig({ ...config, onError })}
            />
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
          <TypographyP size="small" tone="subtle">
            <FormattedMessage {...messages.noConfig} />
          </TypographyP>
        ) : null}
        {node.data.lastOutput || node.data.lastError ? (
          <div className="grid gap-1.5 border-t border-border pt-4">
            <Label>
              <FormattedMessage {...messages.nodeOutputTitle} />
            </Label>
            <pre className="max-h-48 overflow-auto rounded-md bg-muted p-2 text-xs">
              {JSON.stringify(node.data.lastOutput ?? node.data.lastError, null, 2)}
            </pre>
          </div>
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

function KeyValueEditor({
  label,
  keyLabel,
  valueLabel,
  pairs,
  onChange,
}: {
  label: string;
  keyLabel?: string;
  valueLabel?: string;
  pairs: VisualKeyValuePair[];
  onChange: (pairs: VisualKeyValuePair[]) => void;
}) {
  const intl = useIntl();
  const resolvedKeyLabel = keyLabel ?? intl.formatMessage(messages.keyValueKey);
  const resolvedValueLabel = valueLabel ?? intl.formatMessage(messages.keyValueValue);

  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {pairs.map((pair, index) => (
        <div key={`kv-${index}`} className="grid gap-1.5">
          <Input
            value={pair.key}
            placeholder={resolvedKeyLabel}
            onChange={(event) => {
              onChange(
                pairs.map((entry, entryIndex) =>
                  entryIndex === index ? { ...entry, key: event.target.value } : entry,
                ),
              );
            }}
          />
          <div className="flex items-center gap-2">
            <Input
              value={pair.value}
              placeholder={resolvedValueLabel}
              onChange={(event) => {
                onChange(
                  pairs.map((entry, entryIndex) =>
                    entryIndex === index ? { ...entry, value: event.target.value } : entry,
                  ),
                );
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => onChange(pairs.filter((_, entryIndex) => entryIndex !== index))}
            >
              <HugeiconsIcon icon={Delete02Icon} className="size-4" strokeWidth={2} />
            </Button>
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...pairs, { key: "", value: "" }])}
      >
        <HugeiconsIcon icon={PlusSignIcon} className="size-4" strokeWidth={2} />
        <FormattedMessage {...messages.addKeyValuePair} />
      </Button>
    </div>
  );
}

function ErrorBehaviorField({
  value,
  onChange,
}: {
  value: VisualNodeErrorBehavior;
  onChange: (value: VisualNodeErrorBehavior) => void;
}) {
  const intl = useIntl();
  return (
    <SelectField
      id="vw-error-behavior"
      label={intl.formatMessage(messages.onErrorLabel)}
      value={value}
      items={ERROR_BEHAVIORS.map((behavior) => ({
        value: behavior,
        label: intl.formatMessage(errorBehaviorMessage(behavior)),
      }))}
      onValueChange={(nextValue) => {
        if (!nextValue || !isErrorBehavior(nextValue)) {
          return;
        }
        onChange(nextValue);
      }}
    />
  );
}

function SelectField({
  id,
  label,
  value,
  items,
  onValueChange,
}: {
  id: string;
  label: string;
  value: string;
  items: { value: string; label: string }[];
  onValueChange: (value: string | null) => void;
}) {
  const selected = items.find((item) => item.value === value);
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} items={items} onValueChange={onValueChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue>{selected?.label ?? value}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value} label={item.label}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function TextAreaField({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function CheckboxField({
  id,
  label,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
      <Label htmlFor={id}>{label}</Label>
    </div>
  );
}

function isHttpMethod(value: string): value is HttpMethod {
  return HTTP_METHODS.includes(value as HttpMethod);
}

function isHttpAuthType(value: string): value is HttpAuthType {
  return value === "none" || value === "bearer" || value === "api_key";
}

function isErrorBehavior(value: string): value is VisualNodeErrorBehavior {
  return ERROR_BEHAVIORS.includes(value as VisualNodeErrorBehavior);
}

function errorBehaviorMessage(behavior: VisualNodeErrorBehavior) {
  switch (behavior) {
    case "stop":
      return messages.onErrorStop;
    case "continue":
      return messages.onErrorContinue;
    case "branch":
      return messages.onErrorBranch;
  }
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
    case "invalid_node_config":
      return messages.invalidNodeConfig;
    case "nested_for_each":
      return messages.nestedForEach;
    default:
      return assertNever(code);
  }
}
