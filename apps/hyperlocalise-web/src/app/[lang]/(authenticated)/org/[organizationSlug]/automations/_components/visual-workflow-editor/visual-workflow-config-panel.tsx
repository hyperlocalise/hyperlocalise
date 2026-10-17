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
import { useEffect, useState } from "react";

import { WorkflowCredentialField } from "./workflow-credential-field";
import { WorkflowDataPanel } from "./workflow-data-panel";
import { WorkflowBoundField, type BoundPort } from "./workflow-bound-field";
import { WorkflowTestDataPanel } from "./workflow-test-data-panel";
import type {
  WorkflowBinding,
  WorkflowNodeContract,
  VisualWorkflowRfEdge,
} from "@/lib/visual-workflows/schema/types";
import {
  CaretDownIcon,
  ArrowLeftIcon,
  CaretUpIcon,
  TrashIcon,
  PlusIcon,
  CaretRightIcon,
} from "@phosphor-icons/react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TypographyP } from "@/components/ui/typography";
import {
  createMergeInputId,
  createObjectPortId,
  createReturnOutputId,
  createSequenceOutputId,
  isTriggerType,
} from "@/lib/visual-workflows/catalog/node-catalog";
import { createSwitchCaseId } from "@/lib/visual-workflows/schema/switch-cases";
import {
  isVisualTriggerCatalogType,
  VISUAL_TRIGGER_TYPES,
} from "@/lib/visual-workflows/editor/visual-workflow-editor-graph";
import type {
  HttpAuthType,
  HttpMethod,
  VisualCatalogType,
  VisualKeyValuePair,
  VisualNodeConfig,
  VisualNodeErrorBehavior,
  VisualSubworkflowField,
  VisualWorkflowGithubTriggerEvent,
  VisualWorkflowRfNode,
  VisualWorkflowValidationIssue,
  WorkflowValueType,
} from "@/lib/visual-workflows/schema/types";
import type { VisualWorkflowV3ValidationIssue } from "@/lib/visual-workflows/validation/validate-workflow-v3";

import {
  contentSyncNeedsProviderFolder,
  defaultContentSyncProjectFolder,
  type ContentSyncProvider,
} from "@/lib/agents/content-sync/content-sync-types";

import { visualWorkflowEditorMessages as messages } from "./visual-workflow-editor.messages";
import { VisualWorkflowIssueList } from "./visual-workflow-issue-list";
import { getVisualWorkflowDataEdgeBinding } from "@/lib/visual-workflows/editor/visual-workflow-data-ports";
import {
  listUpstreamFields,
  upstreamNodeIds,
} from "@/lib/visual-workflows/editor/visual-workflow-upstream-fields";
import { getWorkflowInputFields } from "@/lib/visual-workflows/catalog/node-contracts";
import { cn } from "@/lib/primitives/cn";
import { visualWorkflowNodeTitleMessage } from "./visual-workflow-node-picker";
import {
  canRunForReal,
  isMockable,
  type MissingTestValue,
  type VisualWorkflowTestData,
  type VisualWorkflowTestFailure,
} from "@/lib/visual-workflows/editor/visual-workflow-test-data";
import { useVisualWorkflowResourceOptions } from "./visual-workflow-resource-options";
import { deriveReusableWorkflowContract } from "@/lib/visual-workflows/validation/subworkflow-validation";

const ANY_PROJECT_VALUE = "__any_project__";
const CONTENT_SYNC_PROVIDERS: ContentSyncProvider[] = [
  "github",
  "gitlab",
  "contentful",
  "intercom",
];

const HTTP_METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const ERROR_BEHAVIORS: VisualNodeErrorBehavior[] = ["stop", "continue", "branch"];
const GITHUB_EVENTS: VisualWorkflowGithubTriggerEvent[] = ["push", "pull_request"];
const TIMEZONES = ["UTC", "America/New_York", "America/Los_Angeles", "Europe/London", "Asia/Tokyo"];

/** The parts of a step's settings, one shown at a time. */
export type StepSettingsTab = "configuration" | "outputs" | "test";

const STEP_SETTINGS_TABS = [
  { value: "configuration", message: messages.configurationTab },
  { value: "outputs", message: messages.outputsTab },
  { value: "test", message: messages.testTab },
] as const;

export function VisualWorkflowConfigPanel({
  node,
  nodes = [],
  edges = [],
  onChangeContract,
  organizationSlug,
  issues,
  onSelectNode,
  onShowNode,
  onBack,
  onChangeConfig,
  onChangeNodeType,
  onDeleteNode,
  testData,
  allTestData,
  missingTestValues = [],
  onChangeTestData,
  testRunsForReal,
  onChangeTestRunsForReal,
  testFailure,
  onChangeTestFailure,
  requestedTab,
  onDisconnectInput,
  onPointStep,
}: {
  node: VisualWorkflowRfNode;
  organizationSlug?: string;
  nodes?: readonly VisualWorkflowRfNode[];
  edges?: readonly VisualWorkflowRfEdge[];
  onChangeContract?: (patch: WorkflowNodeContract) => void;
  issues: readonly (VisualWorkflowValidationIssue | VisualWorkflowV3ValidationIssue)[];
  /** Called with the step an issue is about when its line is clicked. */
  onSelectNode?: (nodeId: string) => void;
  /** Called with the step an issue is about when it is asked to be shown on the canvas. */
  onShowNode?: (nodeId: string) => void;
  onBack: () => void;
  onChangeConfig: (config: VisualNodeConfig) => void;
  onChangeNodeType: (type: VisualCatalogType) => void;
  onDeleteNode: () => void;
  /** The step's test data, shown on its Test tab with `onChangeTestData`. */
  testData?: Record<string, unknown>;
  /** Every step's test data, so a source field of an earlier step can be picked before a run. */
  allTestData?: VisualWorkflowTestData;
  /** The values of this step a test run needs and does not have. */
  missingTestValues?: readonly MissingTestValue[];
  onChangeTestData?: (value: Record<string, unknown>) => void;
  /** Whether test runs run this step for real; the choice is offered with its handler. */
  testRunsForReal?: boolean;
  onChangeTestRunsForReal?: (real: boolean) => void;
  /** The error this step fails with in a test run, or undefined when it succeeds. */
  testFailure?: VisualWorkflowTestFailure;
  onChangeTestFailure?: (failure: VisualWorkflowTestFailure | undefined) => void;
  /** Opens a tab from outside the panel; a new `key` opens it again. */
  requestedTab?: { tab: StepSettingsTab; key: number };
  /** Removes the data wire that feeds one of this step's settings. */
  onDisconnectInput?: (portId: string) => void;
  /** Called with the step a value under the pointer comes from, and with null when it leaves. */
  onPointStep?: (nodeId: string | null) => void;
}) {
  const intl = useIntl();
  const { config } = node.data;
  const resources = useVisualWorkflowResourceOptions(organizationSlug);
  const isTrigger = isTriggerType(node.data.catalogType);
  // The settings and inputs of this step that an issue names.
  const invalidFields = new Set(
    issues.flatMap((issue) => (issue.nodeId === node.id && issue.field ? [issue.field] : [])),
  );
  const inputFields = getWorkflowInputFields({
    id: node.id,
    type: node.data.catalogType,
    config: node.data.config,
    inputs: node.data.inputs,
    outputFields: node.data.outputFields,
  });
  const upstreamFields = listUpstreamFields({ node, nodes, edges, testData: allTestData });
  const upstreamIds = upstreamNodeIds(node.id, edges);
  const triggerId = nodes.find((step) => isTriggerType(step.data.catalogType))?.id;
  const stepTitle = (nodeId: string) => {
    const step = nodes.find((entry) => entry.id === nodeId);
    return step
      ? intl.formatMessage(visualWorkflowNodeTitleMessage(step.data.catalogType))
      : nodeId;
  };
  const removeBinding = (portId: string) => {
    const inputs = { ...node.data.inputs };
    delete inputs[portId];
    onChangeContract?.({ inputs });
  };
  /** Puts a fixed value or template stored by an older version into the setting's own box. */
  const adoptBinding = (portId: string, binding: WorkflowBinding) => {
    const text =
      binding.kind === "template"
        ? binding.template
        : binding.kind === "literal"
          ? typeof binding.value === "string" || typeof binding.value === "number"
            ? binding.value
            : JSON.stringify(binding.value)
          : undefined;
    if (text !== undefined) {
      onChangeConfig({ ...config, [portId]: text } as VisualNodeConfig);
    }
    removeBinding(portId);
  };
  /** A setting's port and what feeds it: a wire on the canvas, or a binding stored earlier. */
  const portFor = (portId: string): BoundPort => {
    const field = inputFields.find((entry) => entry.name === portId);
    const wired = getVisualWorkflowDataEdgeBinding({ nodeId: node.id, portId, edges });
    const binding = node.data.inputs?.[portId];
    const source = wired
      ? {
          nodeId: wired.nodeId,
          label: stepTitle(wired.nodeId),
          detail: wired.path.join(" › "),
          removeLabel: intl.formatMessage(messages.disconnectInput),
          onRemove: onDisconnectInput ? () => onDisconnectInput(portId) : undefined,
        }
      : binding
        ? {
            nodeId:
              binding.kind === "reference"
                ? binding.nodeId === "$trigger"
                  ? triggerId
                  : binding.nodeId
                : undefined,
            label:
              binding.kind === "reference"
                ? stepTitle(
                    binding.nodeId === "$trigger" ? (triggerId ?? binding.nodeId) : binding.nodeId,
                  )
                : binding.kind === "literal"
                  ? intl.formatMessage(messages.fixedValueSource)
                  : binding.kind === "template"
                    ? intl.formatMessage(messages.templateSource)
                    : intl.formatMessage(messages.credentialSource),
            detail:
              binding.kind === "reference"
                ? binding.path.join(" › ")
                : binding.kind === "literal"
                  ? JSON.stringify(binding.value)
                  : binding.kind === "template"
                    ? binding.template
                    : undefined,
            // A fixed value or template is typed into the box since this version of the panel.
            ...((binding.kind === "literal" || binding.kind === "template") &&
            !portId.startsWith("value.")
              ? {
                  removeLabel: intl.formatMessage(messages.editBindingAsText),
                  onRemove: onChangeContract ? () => adoptBinding(portId, binding) : undefined,
                }
              : {
                  removeLabel: intl.formatMessage(messages.removeBinding),
                  onRemove: onChangeContract ? () => removeBinding(portId) : undefined,
                }),
          }
        : undefined;
    return {
      id: portId,
      type: field?.type ?? "string",
      required: field?.required ?? false,
      source,
      fields: upstreamFields,
      stepTitle,
      runsBefore: (nodeId) => upstreamIds.has(nodeId),
      triggerId,
      onPoint: onPointStep,
    };
  };
  const connectedInputProps = (portId: string) => ({
    port: portFor(portId),
    invalid: invalidFields.has(portId),
  });
  // Inputs that only a wire can feed, such as a Call workflow's or a Return's values.
  // Create/Merge object ports are shown with their field editors, not again at the bottom.
  const wireOnlyInputs = inputFields.filter(
    (field) =>
      field.name.startsWith("value.") &&
      config.kind !== "logic.create_object" &&
      config.kind !== "logic.merge_objects",
  );

  // The tab stays as chosen from step to step, and starts over when the panel is opened again.
  const [tab, setTab] = useState<StepSettingsTab>("configuration");
  useEffect(() => {
    if (requestedTab) setTab(requestedTab.tab);
  }, [requestedTab]);
  const hasTestTab = Boolean(onChangeTestData) && isMockable(node.data.catalogType);
  const canRunStepForReal = canRunForReal(node.data.catalogType);
  // A step without a Test tab shows its own form while that tab is the chosen one.
  const shownTab = tab === "test" && !hasTestTab ? "configuration" : tab;
  /** Shows the step's own form, where its issues are marked, whichever tab was open. */
  const showIssueTab = () => setTab("configuration");
  const [failOpen, setFailOpen] = useState(false);

  return (
    <Tabs
      value={shownTab}
      onValueChange={(value) => setTab(value as StepSettingsTab)}
      className="h-full min-h-0 gap-0"
    >
      {/* Back and Delete step are icons, so the tabs fit beside them in the panel's one header row. */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={intl.formatMessage(messages.backToPicker)}
                onClick={onBack}
              >
                <ArrowLeftIcon />
              </Button>
            }
          />
          <TooltipContent side="bottom">
            <FormattedMessage {...messages.backToPicker} />
          </TooltipContent>
        </Tooltip>
        {onChangeContract ? (
          <TabsList
            aria-label={intl.formatMessage(messages.stepSettingsTabs)}
            className="min-w-0 flex-1 group-data-horizontal/tabs:h-8"
          >
            {STEP_SETTINGS_TABS.filter((entry) => entry.value !== "test" || hasTestTab).map(
              (entry) => (
                // A tab is as wide as its name and gives way only when the row runs out of room.
                <TabsTrigger key={entry.value} value={entry.value} className="min-w-0 flex-auto">
                  <span className="truncate">
                    <FormattedMessage {...entry.message} />
                  </span>
                </TabsTrigger>
              ),
            )}
          </TabsList>
        ) : null}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="destructive"
                size="icon-sm"
                className="ms-auto"
                aria-label={intl.formatMessage(messages.deleteStep)}
                onClick={onDeleteNode}
              >
                <TrashIcon />
              </Button>
            }
          />
          <TooltipContent side="bottom">
            <FormattedMessage {...messages.deleteStep} />
          </TooltipContent>
        </Tooltip>
      </div>
      {onChangeContract ? (
        <>
          {hasTestTab && onChangeTestData ? (
            <TabsContent value="test" className="min-h-0 overflow-y-auto p-4">
              <WorkflowTestDataPanel
                node={node}
                value={testData}
                missing={missingTestValues}
                projects={resources.projects}
                onChange={onChangeTestData}
                runsForReal={testRunsForReal}
                onRunsForRealChange={canRunStepForReal ? onChangeTestRunsForReal : undefined}
                failure={testFailure}
                onFailureChange={canRunStepForReal ? onChangeTestFailure : undefined}
              />
            </TabsContent>
          ) : null}
          <TabsContent value="outputs" className="min-h-0 overflow-y-auto p-4">
            <WorkflowDataPanel
              section="outputs"
              node={node}
              nodes={nodes}
              edges={edges}
              organizationSlug={organizationSlug}
              onChange={onChangeContract}
            />
          </TabsContent>
        </>
      ) : null}
      <TabsContent
        value="configuration"
        className="flex min-h-0 flex-col gap-4 overflow-y-auto p-4"
      >
        {/* Without the tabs nothing else names this part. */}
        {onChangeContract ? null : (
          <h2 className="text-sm font-medium">
            <FormattedMessage {...messages.configTitle} />
          </h2>
        )}
        {isTrigger ? (
          <SelectField
            id="vw-trigger-type"
            label={intl.formatMessage(messages.triggerType)}
            value={node.data.catalogType}
            items={VISUAL_TRIGGER_TYPES.map((type) => ({
              value: type,
              label: intl.formatMessage(titleForTrigger(type)),
            }))}
            onValueChange={(value) => {
              if (!value || !isVisualTriggerCatalogType(value)) {
                return;
              }
              onChangeNodeType(value);
            }}
          />
        ) : null}
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
              id="vw-http-idempotency"
              label={intl.formatMessage({
                defaultMessage: "Provider idempotency header (optional)",
                id: "DCJppnaACE",
                description: "HTTP provider supported idempotency header name",
              })}
              value={config.idempotencyHeader ?? ""}
              onChange={(value) =>
                onChangeConfig({ ...config, idempotencyHeader: value || undefined })
              }
            />
            <TextField
              id="vw-http-url"
              label={intl.formatMessage(messages.httpUrl)}
              value={config.url}
              {...connectedInputProps("url")}
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
                {...connectedInputProps("body")}
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
                {organizationSlug ? (
                  <WorkflowCredentialField
                    organizationSlug={organizationSlug}
                    value={config.auth?.credentialId}
                    onChange={(credentialId) =>
                      onChangeConfig({
                        ...config,
                        auth: {
                          type: config.auth?.type ?? "bearer",
                          credentialId,
                          headerName: config.auth?.headerName,
                        },
                      })
                    }
                  />
                ) : null}
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
                          credentialId: config.auth?.credentialId,
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
          </>
        ) : null}
        {config.kind === "logic.if" ? (
          <TextAreaField
            id="vw-if-condition"
            label={intl.formatMessage(messages.ifCondition)}
            value={config.condition}
            {...connectedInputProps("condition")}
            onChange={(value) => onChangeConfig({ ...config, condition: value })}
          />
        ) : null}
        {config.kind === "logic.switch" ? (
          <>
            <TextAreaField
              id="vw-switch-expression"
              label={intl.formatMessage(messages.switchExpression)}
              value={config.expression}
              {...connectedInputProps("expression")}
              onChange={(value) => onChangeConfig({ ...config, expression: value })}
              placeholder="{{nodes.http.json.status}}"
            />
            <div className="grid gap-2">
              <Label>
                <FormattedMessage {...messages.switchCases} />
              </Label>
              {config.cases.map((caseEntry, index) => (
                <div key={caseEntry.id} className="flex items-center gap-2">
                  <Input
                    value={caseEntry.value}
                    onChange={(event) => {
                      const cases = config.cases.map((entry, caseIndex) =>
                        caseIndex === index ? { ...entry, value: event.target.value } : entry,
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
                    aria-label={intl.formatMessage(messages.removeSwitchCase, {
                      index: index + 1,
                    })}
                    disabled={config.cases.length <= 1}
                    onClick={() => {
                      onChangeConfig({
                        ...config,
                        cases: config.cases.filter((_, caseIndex) => caseIndex !== index),
                      });
                    }}
                  >
                    <TrashIcon className="size-4" />
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
                    cases: [...config.cases, { id: createSwitchCaseId(), value: "" }],
                  })
                }
              >
                <PlusIcon className="size-4" />
                <FormattedMessage {...messages.addSwitchCase} />
              </Button>
            </div>
          </>
        ) : null}
        {config.kind === "logic.merge" ? (
          <>
            <SelectField
              id="vw-merge-mode"
              label={intl.formatMessage(messages.mergeMode)}
              value={config.mode}
              items={[
                {
                  value: "all",
                  label: intl.formatMessage(messages.mergeModeAll),
                },
                {
                  value: "any",
                  label: intl.formatMessage(messages.mergeModeAny),
                },
                {
                  value: "first_success",
                  label: intl.formatMessage(messages.mergeModeFirstSuccess),
                },
              ]}
              onValueChange={(value) => {
                if (value === "all" || value === "any" || value === "first_success") {
                  onChangeConfig({
                    ...config,
                    mode: value,
                  });
                }
              }}
            />

            <div className="grid gap-2">
              <Label>
                <FormattedMessage {...messages.mergeInputs} />
              </Label>

              {config.inputs.map((input, index) => (
                <div key={input.id} className="flex items-center gap-2">
                  <Input
                    aria-label={intl.formatMessage(messages.mergeInputName, {
                      index: index + 1,
                    })}
                    value={input.name}
                    placeholder={intl.formatMessage(messages.mergeInputName, {
                      index: index + 1,
                    })}
                    onChange={(event) => {
                      const inputs = config.inputs.map((entry, inputIndex) =>
                        inputIndex === index
                          ? {
                              ...entry,
                              name: event.target.value,
                            }
                          : entry,
                      );

                      onChangeConfig({
                        ...config,
                        inputs,
                      });
                    }}
                  />

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={index === 0}
                    aria-label={intl.formatMessage(messages.moveMergeInputUp, {
                      index: index + 1,
                    })}
                    onClick={() => {
                      const inputs = [...config.inputs];
                      [inputs[index - 1], inputs[index]] = [inputs[index]!, inputs[index - 1]!];

                      onChangeConfig({
                        ...config,
                        inputs,
                      });
                    }}
                  >
                    <CaretUpIcon className="size-4" />
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={index === config.inputs.length - 1}
                    aria-label={intl.formatMessage(messages.moveMergeInputDown, {
                      index: index + 1,
                    })}
                    onClick={() => {
                      const inputs = [...config.inputs];
                      [inputs[index], inputs[index + 1]] = [inputs[index + 1]!, inputs[index]!];

                      onChangeConfig({
                        ...config,
                        inputs,
                      });
                    }}
                  >
                    <CaretDownIcon className="size-4" />
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={config.inputs.length <= 2}
                    aria-label={intl.formatMessage(messages.removeMergeInput, {
                      index: index + 1,
                    })}
                    onClick={() =>
                      onChangeConfig({
                        ...config,
                        inputs: config.inputs.filter((_, inputIndex) => inputIndex !== index),
                      })
                    }
                  >
                    <TrashIcon className="size-4" />
                  </Button>
                </div>
              ))}

              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={config.inputs.length >= 32}
                onClick={() =>
                  onChangeConfig({
                    ...config,
                    inputs: [
                      ...config.inputs,
                      {
                        id: createMergeInputId(),
                        name: `Input ${config.inputs.length + 1}`,
                      },
                    ],
                  })
                }
              >
                <PlusIcon className="size-4" />
                <FormattedMessage {...messages.addMergeInput} />
              </Button>
            </div>

            <TextField
              id="vw-merge-timeout"
              label={intl.formatMessage(messages.mergeTimeoutMs)}
              value={config.timeoutMs === undefined ? "" : String(config.timeoutMs)}
              onChange={(value) =>
                onChangeConfig({
                  ...config,
                  timeoutMs:
                    value.trim() === "" ? undefined : Number.parseInt(value, 10) || undefined,
                })
              }
            />
          </>
        ) : null}
        {config.kind === "logic.sequence" ? (
          <div className="grid gap-2">
            <Label>
              <FormattedMessage {...messages.sequenceOutputs} />
            </Label>

            {config.outputs.length === 0 ? (
              <TypographyP className="text-sm text-muted-foreground">
                <FormattedMessage {...messages.sequenceOutputsEmpty} />
              </TypographyP>
            ) : null}

            {config.outputs.map((output, index) => (
              <div key={output.id} className="flex items-center gap-2">
                <Input
                  aria-label={intl.formatMessage(messages.sequenceOutputLabel, {
                    index: index + 1,
                  })}
                  value={output.label}
                  placeholder={intl.formatMessage(messages.sequenceOutputLabel, {
                    index: index + 1,
                  })}
                  onChange={(event) => {
                    const outputs = config.outputs.map((entry, outputIndex) =>
                      outputIndex === index
                        ? {
                            ...entry,
                            label: event.target.value,
                          }
                        : entry,
                    );

                    onChangeConfig({
                      ...config,
                      outputs,
                    });
                  }}
                />

                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={index === 0}
                  aria-label={intl.formatMessage(messages.moveSequenceOutputUp, {
                    index: index + 1,
                  })}
                  onClick={() => {
                    const outputs = [...config.outputs];

                    [outputs[index - 1], outputs[index]] = [outputs[index]!, outputs[index - 1]!];

                    onChangeConfig({
                      ...config,
                      outputs,
                    });
                  }}
                >
                  <CaretUpIcon className="size-4" />
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={index === config.outputs.length - 1}
                  aria-label={intl.formatMessage(messages.moveSequenceOutputDown, {
                    index: index + 1,
                  })}
                  onClick={() => {
                    const outputs = [...config.outputs];

                    [outputs[index], outputs[index + 1]] = [outputs[index + 1]!, outputs[index]!];

                    onChangeConfig({
                      ...config,
                      outputs,
                    });
                  }}
                >
                  <CaretDownIcon className="size-4" />
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={intl.formatMessage(messages.removeSequenceOutput, {
                    index: index + 1,
                  })}
                  onClick={() =>
                    onChangeConfig({
                      ...config,
                      outputs: config.outputs.filter((_, outputIndex) => outputIndex !== index),
                    })
                  }
                >
                  <TrashIcon className="size-4" />
                </Button>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={config.outputs.length >= 32}
              onClick={() =>
                onChangeConfig({
                  ...config,
                  outputs: [
                    ...config.outputs,
                    {
                      id: createSequenceOutputId(),
                      label: `Output ${config.outputs.length + 1}`,
                    },
                  ],
                })
              }
            >
              <PlusIcon className="size-4" />
              <FormattedMessage {...messages.addSequenceOutput} />
            </Button>
          </div>
        ) : null}
        {config.kind === "flow.stop" ? (
          <>
            <SelectField
              id="vw-stop-outcome"
              label={intl.formatMessage(messages.stopOutcome)}
              value={config.outcome}
              items={[
                { value: "completed", label: intl.formatMessage(messages.stopCompleted) },
                { value: "cancelled", label: intl.formatMessage(messages.stopCancelled) },
              ]}
              onValueChange={(value) => {
                if (value === "completed" || value === "cancelled") {
                  onChangeConfig({ ...config, outcome: value });
                }
              }}
            />
            <TextAreaField
              id="vw-stop-reason"
              label={intl.formatMessage(messages.stopReason)}
              value={config.reason ?? ""}
              onChange={(reason) => onChangeConfig({ ...config, reason: reason || undefined })}
            />
          </>
        ) : null}
        {config.kind === "flow.call_workflow" ? (
          <div className="grid gap-4">
            <SelectField
              id="vw-call-workflow"
              label={intl.formatMessage({
                defaultMessage: "Published workflow",
                id: "zMLRlSi4TO",
                description: "Workflow selected by a Call Workflow node",
              })}
              value={config.workflowId}
              placeholder={intl.formatMessage({
                defaultMessage: "Select a reusable workflow",
                id: "UbCGk5WHRG",
                description: "Placeholder for selecting a reusable workflow",
              })}
              items={resources.workflows
                .filter(
                  (workflow) =>
                    workflow.publishedDefinition !== null &&
                    deriveReusableWorkflowContract(workflow.publishedDefinition) !== null,
                )
                .map((workflow) => ({
                  value: workflow.id,
                  label: `${workflow.name} · v${workflow.publishedVersion}`,
                }))}
              onValueChange={(workflowId) => {
                const workflow = resources.workflows.find((entry) => entry.id === workflowId);
                if (!workflow?.publishedDefinition || workflow.publishedVersion === null) return;
                const contract = deriveReusableWorkflowContract(workflow.publishedDefinition);
                if (!contract) return;
                onChangeConfig({
                  ...config,
                  workflowId: workflow.id,
                  version: workflow.publishedVersion,
                  inputFields: contract.inputs,
                  outputFields: contract.outputs,
                });
              }}
            />
            <div className="grid gap-1.5">
              <Label htmlFor="vw-call-version">
                {intl.formatMessage({
                  defaultMessage: "Immutable version",
                  id: "6NfqQj4VJh",
                  description: "Pinned immutable workflow version",
                })}
              </Label>
              <Input
                id="vw-call-version"
                type="number"
                min={1}
                value={config.version}
                onChange={(event) =>
                  onChangeConfig({
                    ...config,
                    version: Math.max(1, Number.parseInt(event.target.value, 10) || 1),
                  })
                }
              />
            </div>
            <ContractFieldList
              label={intl.formatMessage({
                defaultMessage: "Outputs",
                id: "xhGJ7UWFLE",
                description: "Snapshotted Call Workflow outputs",
              })}
              fields={config.outputFields}
            />
          </div>
        ) : null}
        {config.kind === "flow.return" ? (
          <div className="grid gap-2">
            <Label>
              <FormattedMessage {...messages.returnOutputs} />
            </Label>
            {config.outputs.length === 0 ? (
              <TypographyP className="text-sm text-muted-foreground">
                <FormattedMessage {...messages.returnOutputsEmpty} />
              </TypographyP>
            ) : null}
            {config.outputs.map((output, index) => (
              <div key={output.id} className="grid grid-cols-[1fr_7rem_auto] items-center gap-2">
                <Input
                  aria-label={intl.formatMessage(messages.returnOutputName, { index: index + 1 })}
                  value={output.name}
                  onChange={(event) =>
                    onChangeConfig({
                      ...config,
                      outputs: config.outputs.map((entry, outputIndex) =>
                        outputIndex === index ? { ...entry, name: event.target.value } : entry,
                      ),
                    })
                  }
                />
                <Select
                  value={output.type}
                  onValueChange={(type) => {
                    if (
                      !type ||
                      !["string", "number", "boolean", "object", "array", "unknown"].includes(type)
                    )
                      return;
                    onChangeConfig({
                      ...config,
                      outputs: config.outputs.map((entry, outputIndex) =>
                        outputIndex === index
                          ? { ...entry, type: type as typeof output.type }
                          : entry,
                      ),
                    });
                  }}
                >
                  <SelectTrigger
                    aria-label={intl.formatMessage(messages.returnOutputType, { index: index + 1 })}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["string", "number", "boolean", "object", "array", "unknown"].map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={intl.formatMessage(messages.removeReturnOutput, { index: index + 1 })}
                  onClick={() =>
                    onChangeConfig({
                      ...config,
                      outputs: config.outputs.filter((_, outputIndex) => outputIndex !== index),
                    })
                  }
                >
                  <TrashIcon className="size-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={config.outputs.length >= 32}
              onClick={() => {
                const usedNames = new Set(config.outputs.map((output) => output.name));
                let nextIndex = config.outputs.length + 1;
                while (usedNames.has(`output${nextIndex}`)) nextIndex += 1;
                onChangeConfig({
                  ...config,
                  outputs: [
                    ...config.outputs,
                    {
                      id: createReturnOutputId(),
                      name: `output${nextIndex}`,
                      type: "unknown",
                    },
                  ],
                });
              }}
            >
              <PlusIcon className="size-4" />
              <FormattedMessage {...messages.addReturnOutput} />
            </Button>
          </div>
        ) : null}
        {config.kind === "flow.fail" ? (
          <>
            <TextField
              id="vw-fail-code"
              label={intl.formatMessage(messages.failErrorCode)}
              value={config.errorCode}
              onChange={(errorCode) => onChangeConfig({ ...config, errorCode })}
            />
            <TextAreaField
              id="vw-fail-message"
              label={intl.formatMessage(messages.failMessage)}
              value={config.message}
              onChange={(message) => onChangeConfig({ ...config, message })}
            />
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
        {config.kind === "logic.create_object" ? (
          <div className="grid gap-3">
            <Label>
              <FormattedMessage {...messages.createObjectFields} />
            </Label>
            {config.fields.length === 0 ? (
              <TypographyP className="text-sm text-muted-foreground">
                <FormattedMessage {...messages.createObjectFieldsEmpty} />
              </TypographyP>
            ) : null}
            {config.fields.map((field, index) => {
              const portId = `value.${field.id}`;
              const connected = connectedInputProps(portId);
              const wired = connected.port.source !== undefined;
              const hasDefault = Object.hasOwn(field, "defaultValue");
              return (
                <div key={field.id} className="grid gap-2 rounded-md border border-border p-2">
                  <div className="grid grid-cols-[1fr_7rem] gap-2">
                    <Input
                      aria-label={intl.formatMessage(messages.createObjectFieldName, {
                        index: index + 1,
                      })}
                      value={field.name}
                      aria-invalid={invalidFields.has(portId) || undefined}
                      onChange={(event) =>
                        onChangeConfig({
                          ...config,
                          fields: config.fields.map((entry, fieldIndex) =>
                            fieldIndex === index ? { ...entry, name: event.target.value } : entry,
                          ),
                        })
                      }
                    />
                    <Select
                      value={field.type}
                      onValueChange={(type) => {
                        if (!isWorkflowValueType(type)) return;
                        onChangeConfig({
                          ...config,
                          fields: config.fields.map((entry, fieldIndex) =>
                            fieldIndex === index
                              ? {
                                  ...entry,
                                  type,
                                  ...(Object.hasOwn(entry, "defaultValue")
                                    ? { defaultValue: defaultValueForType(type) }
                                    : {}),
                                }
                              : entry,
                          ),
                        });
                      }}
                    >
                      <SelectTrigger
                        aria-label={intl.formatMessage(messages.createObjectFieldType, {
                          index: index + 1,
                        })}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {WORKFLOW_VALUE_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`vw-object-default-${field.id}`}
                      checked={hasDefault}
                      disabled={wired}
                      onCheckedChange={(checked) =>
                        onChangeConfig({
                          ...config,
                          fields: config.fields.map((entry, fieldIndex) => {
                            if (fieldIndex !== index) return entry;
                            if (checked === true)
                              return { ...entry, defaultValue: defaultValueForType(entry.type) };
                            const { defaultValue: _removed, ...withoutDefault } = entry;
                            return withoutDefault;
                          }),
                        })
                      }
                    />
                    <Label htmlFor={`vw-object-default-${field.id}`}>
                      <FormattedMessage {...messages.createObjectUseDefault} />
                    </Label>
                  </div>
                  {wired || !hasDefault ? (
                    <WorkflowBoundField
                      id={`vw-object-value-${field.id}`}
                      label={field.name}
                      value=""
                      onChange={() => {}}
                      editable={false}
                      invalid={connected.invalid}
                      port={connected.port}
                    />
                  ) : (
                    <ObjectDefaultInput
                      key={`${field.id}:${field.type}`}
                      ariaLabel={intl.formatMessage(messages.createObjectFieldDefault, {
                        index: index + 1,
                      })}
                      value={field.defaultValue}
                      type={field.type}
                      invalid={connected.invalid}
                      onChange={(defaultValue) =>
                        onChangeConfig({
                          ...config,
                          fields: config.fields.map((entry, fieldIndex) =>
                            fieldIndex === index ? { ...entry, defaultValue } : entry,
                          ),
                        })
                      }
                    />
                  )}
                  <div className="flex justify-end gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={index === 0}
                      aria-label={intl.formatMessage(messages.moveCreateObjectFieldUp, {
                        index: index + 1,
                      })}
                      onClick={() => {
                        const fields = [...config.fields];
                        [fields[index - 1], fields[index]] = [fields[index]!, fields[index - 1]!];
                        onChangeConfig({ ...config, fields });
                      }}
                    >
                      <CaretUpIcon className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={index === config.fields.length - 1}
                      aria-label={intl.formatMessage(messages.moveCreateObjectFieldDown, {
                        index: index + 1,
                      })}
                      onClick={() => {
                        const fields = [...config.fields];
                        [fields[index], fields[index + 1]] = [fields[index + 1]!, fields[index]!];
                        onChangeConfig({ ...config, fields });
                      }}
                    >
                      <CaretDownIcon className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={intl.formatMessage(messages.removeCreateObjectField, {
                        index: index + 1,
                      })}
                      onClick={() =>
                        onChangeConfig({
                          ...config,
                          fields: config.fields.filter((_, fieldIndex) => fieldIndex !== index),
                        })
                      }
                    >
                      <TrashIcon className="size-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={config.fields.length >= 100}
              onClick={() =>
                onChangeConfig({
                  ...config,
                  fields: [
                    ...config.fields,
                    {
                      id: createObjectPortId(),
                      name: `field${config.fields.length + 1}`,
                      type: "unknown",
                    },
                  ],
                })
              }
            >
              <PlusIcon className="size-4" />
              <FormattedMessage {...messages.addCreateObjectField} />
            </Button>
          </div>
        ) : null}
        {config.kind === "logic.merge_objects" ? (
          <div className="grid gap-3">
            <SelectField
              id="vw-object-conflict-policy"
              label={intl.formatMessage(messages.mergeObjectsConflictPolicy)}
              value={config.conflictPolicy}
              items={[
                {
                  value: "reject",
                  label: intl.formatMessage(messages.mergeObjectsConflictReject),
                },
                {
                  value: "first_wins",
                  label: intl.formatMessage(messages.mergeObjectsConflictFirstWins),
                },
                {
                  value: "last_wins",
                  label: intl.formatMessage(messages.mergeObjectsConflictLastWins),
                },
              ]}
              onValueChange={(conflictPolicy) => {
                if (
                  conflictPolicy === "reject" ||
                  conflictPolicy === "first_wins" ||
                  conflictPolicy === "last_wins"
                )
                  onChangeConfig({ ...config, conflictPolicy });
              }}
            />
            <Label>
              <FormattedMessage {...messages.mergeObjectsInputs} />
            </Label>
            {config.inputs.map((objectInput, index) => (
              <div key={objectInput.id} className="grid gap-2">
                <div className="flex items-center gap-2">
                  <Input
                    aria-label={intl.formatMessage(messages.mergeObjectsInputName, {
                      index: index + 1,
                    })}
                    value={objectInput.name}
                    aria-invalid={invalidFields.has(`value.${objectInput.id}`) || undefined}
                    onChange={(event) =>
                      onChangeConfig({
                        ...config,
                        inputs: config.inputs.map((entry, inputIndex) =>
                          inputIndex === index ? { ...entry, name: event.target.value } : entry,
                        ),
                      })
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={index === 0}
                    aria-label={intl.formatMessage(messages.moveMergeObjectsInputUp, {
                      index: index + 1,
                    })}
                    onClick={() => {
                      const inputs = [...config.inputs];
                      [inputs[index - 1], inputs[index]] = [inputs[index]!, inputs[index - 1]!];
                      onChangeConfig({ ...config, inputs });
                    }}
                  >
                    <CaretUpIcon className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={index === config.inputs.length - 1}
                    aria-label={intl.formatMessage(messages.moveMergeObjectsInputDown, {
                      index: index + 1,
                    })}
                    onClick={() => {
                      const inputs = [...config.inputs];
                      [inputs[index], inputs[index + 1]] = [inputs[index + 1]!, inputs[index]!];
                      onChangeConfig({ ...config, inputs });
                    }}
                  >
                    <CaretDownIcon className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={config.inputs.length <= 2}
                    aria-label={intl.formatMessage(messages.removeMergeObjectsInput, {
                      index: index + 1,
                    })}
                    onClick={() =>
                      onChangeConfig({
                        ...config,
                        inputs: config.inputs.filter((_, inputIndex) => inputIndex !== index),
                      })
                    }
                  >
                    <TrashIcon className="size-4" />
                  </Button>
                </div>
                <WorkflowBoundField
                  id={`vw-merge-object-${objectInput.id}`}
                  label={objectInput.name}
                  value=""
                  onChange={() => {}}
                  editable={false}
                  invalid={invalidFields.has(`value.${objectInput.id}`)}
                  port={portFor(`value.${objectInput.id}`)}
                />
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={config.inputs.length >= 32}
              onClick={() =>
                onChangeConfig({
                  ...config,
                  inputs: [
                    ...config.inputs,
                    {
                      id: createObjectPortId(),
                      name: `Object ${config.inputs.length + 1}`,
                    },
                  ],
                })
              }
            >
              <PlusIcon className="size-4" />
              <FormattedMessage {...messages.addMergeObjectsInput} />
            </Button>
          </div>
        ) : null}
        {config.kind === "logic.for_each" ? (
          <TextAreaField
            id="vw-for-each-collection"
            label={intl.formatMessage(messages.forEachCollection)}
            value={config.collection}
            {...connectedInputProps("collection")}
            onChange={(value) => onChangeConfig({ ...config, collection: value })}
            placeholder="{{trigger.items}}"
          />
        ) : null}
        {config.kind === "logic.retry" ? (
          <>
            <TextField
              id="vw-retry-max-attempts"
              label={intl.formatMessage(messages.retryMaxAttempts)}
              value={String(config.maxAttempts ?? 3)}
              {...connectedInputProps("maxAttempts")}
              onChange={(value) =>
                onChangeConfig({
                  ...config,
                  maxAttempts: Number.parseInt(value, 10) || 1,
                })
              }
            />
            <TextField
              id="vw-retry-initial-delay"
              label={intl.formatMessage(messages.retryInitialDelay)}
              value={String(config.initialDelayMs ?? 1000)}
              {...connectedInputProps("initialDelayMs")}
              onChange={(value) =>
                onChangeConfig({
                  ...config,
                  initialDelayMs: Number.parseInt(value, 10) || 0,
                })
              }
            />
            <TextField
              id="vw-retry-backoff"
              label={intl.formatMessage(messages.retryBackoffMultiplier)}
              value={String(config.backoffMultiplier ?? 2)}
              {...connectedInputProps("backoffMultiplier")}
              onChange={(value) =>
                onChangeConfig({
                  ...config,
                  backoffMultiplier: Number.parseFloat(value) || 1,
                })
              }
            />
            <div className="flex items-center gap-2">
              <Checkbox
                id="vw-retry-ack-dup"
                checked={config.acknowledgeDuplicateRisk ?? false}
                onCheckedChange={(checked) =>
                  onChangeConfig({
                    ...config,
                    acknowledgeDuplicateRisk: checked === true,
                  })
                }
              />
              <Label htmlFor="vw-retry-ack-dup" className="text-sm font-normal">
                {intl.formatMessage(messages.retryAcknowledgeDuplicateRisk)}
              </Label>
            </div>
          </>
        ) : null}
        {config.kind === "flow.wait" ? (
          <>
            <SelectField
              id="vw-wait-mode"
              label={intl.formatMessage(messages.waitMode)}
              value={config.mode}
              items={[
                {
                  value: "duration",
                  label: intl.formatMessage(messages.waitModeDuration),
                },
                {
                  value: "timestamp",
                  label: intl.formatMessage(messages.waitModeTimestamp),
                },
                {
                  value: "condition",
                  label: intl.formatMessage(messages.waitModeCondition),
                },
              ]}
              onValueChange={(value) => {
                if (value === "duration") {
                  onChangeConfig({
                    kind: "flow.wait",
                    mode: "duration",
                    durationMs: config.mode === "duration" ? (config.durationMs ?? 60_000) : 60_000,
                  });
                  return;
                }

                if (value === "timestamp") {
                  onChangeConfig({
                    kind: "flow.wait",
                    mode: "timestamp",
                    timestamp:
                      config.mode === "timestamp"
                        ? config.timestamp
                        : new Date(Date.now() + 3_600_000).toISOString(),
                  });
                  return;
                }

                if (value === "condition") {
                  onChangeConfig({
                    kind: "flow.wait",
                    mode: "condition",
                    condition: config.mode === "condition" ? (config.condition ?? "") : "",
                    pollingIntervalMs:
                      config.mode === "condition" ? (config.pollingIntervalMs ?? 5_000) : 5_000,
                    timeoutMs:
                      config.mode === "condition" ? (config.timeoutMs ?? 300_000) : 300_000,
                  });
                }
              }}
            />

            {config.mode === "duration" ? (
              <TextField
                id="vw-wait-duration"
                label={intl.formatMessage(messages.waitDurationMs)}
                value={String(config.durationMs ?? 60_000)}
                {...connectedInputProps("durationMs")}
                onChange={(value) =>
                  onChangeConfig({
                    ...config,
                    durationMs: Number.parseInt(value, 10) || 0,
                  })
                }
              />
            ) : null}

            {config.mode === "timestamp" ? (
              <TextField
                id="vw-wait-timestamp"
                label={intl.formatMessage(messages.waitTimestamp)}
                value={config.timestamp ?? ""}
                {...connectedInputProps("timestamp")}
                onChange={(value) =>
                  onChangeConfig({
                    ...config,
                    timestamp: value,
                  })
                }
                placeholder="2026-10-01T10:00:00.000Z"
              />
            ) : null}

            {config.mode === "condition" ? (
              <>
                <TextAreaField
                  id="vw-wait-condition"
                  label={intl.formatMessage(messages.waitCondition)}
                  value={config.condition ?? ""}
                  {...connectedInputProps("condition")}
                  onChange={(value) =>
                    onChangeConfig({
                      ...config,
                      condition: value,
                    })
                  }
                  placeholder="{{nodes.http.json.status}} === ready"
                />

                <TextField
                  id="vw-wait-polling-interval"
                  label={intl.formatMessage(messages.waitPollingIntervalMs)}
                  value={String(config.pollingIntervalMs ?? 5_000)}
                  {...connectedInputProps("pollingIntervalMs")}
                  onChange={(value) =>
                    onChangeConfig({
                      ...config,
                      pollingIntervalMs: Number.parseInt(value, 10) || 0,
                    })
                  }
                />

                <TextField
                  id="vw-wait-timeout"
                  label={intl.formatMessage(messages.waitTimeoutMs)}
                  value={String(config.timeoutMs ?? 300_000)}
                  {...connectedInputProps("timeoutMs")}
                  onChange={(value) =>
                    onChangeConfig({
                      ...config,
                      timeoutMs: Number.parseInt(value, 10) || 0,
                    })
                  }
                />
              </>
            ) : null}
          </>
        ) : null}
        {config.kind === "action.notify_slack" ? (
          <>
            <TextField
              id="vw-slack-channel"
              label={intl.formatMessage(messages.slackChannelId)}
              value={config.channelId}
              {...connectedInputProps("channelId")}
              onChange={(value) => onChangeConfig({ ...config, channelId: value })}
            />
            <TextAreaField
              id="vw-slack-message"
              label={intl.formatMessage(messages.slackMessage)}
              value={config.message}
              {...connectedInputProps("message")}
              onChange={(value) => onChangeConfig({ ...config, message: value })}
            />
          </>
        ) : null}
        {config.kind === "action.notify_email" ? (
          <>
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">
                <FormattedMessage {...messages.emailProvider} />
              </Label>
              <Select
                value={config.provider}
                onValueChange={(value) => {
                  if (value !== "resend" && value !== "sendgrid") {
                    return;
                  }
                  onChangeConfig({ ...config, provider: value });
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {config.provider === "sendgrid"
                      ? intl.formatMessage(messages.emailProviderSendgrid)
                      : intl.formatMessage(messages.emailProviderResend)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="resend">
                    <FormattedMessage {...messages.emailProviderResend} />
                  </SelectItem>
                  <SelectItem value="sendgrid">
                    <FormattedMessage {...messages.emailProviderSendgrid} />
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <TextField
              id="vw-email-from"
              label={intl.formatMessage(messages.emailFrom)}
              value={config.from}
              {...connectedInputProps("from")}
              onChange={(value) => onChangeConfig({ ...config, from: value })}
              placeholder="notifications@company.com"
            />
            <TextAreaField
              id="vw-email-recipients"
              label={intl.formatMessage(messages.emailRecipients)}
              value={config.recipients}
              {...connectedInputProps("recipients")}
              onChange={(value) => onChangeConfig({ ...config, recipients: value })}
              placeholder="ops@company.com, dev@company.com"
            />
            <TextField
              id="vw-email-subject"
              label={intl.formatMessage(messages.emailSubject)}
              value={config.subject}
              {...connectedInputProps("subject")}
              onChange={(value) => onChangeConfig({ ...config, subject: value })}
            />
            <TextAreaField
              id="vw-email-message"
              label={intl.formatMessage(messages.emailMessage)}
              value={config.message}
              {...connectedInputProps("message")}
              onChange={(value) => onChangeConfig({ ...config, message: value })}
            />
          </>
        ) : null}
        {config.kind === "trigger.github" ? (
          <>
            <SelectField
              id="vw-github-repo"
              label={intl.formatMessage(messages.githubRepository)}
              value={config.githubInstallationRepositoryId}
              placeholder={intl.formatMessage(messages.selectRepository)}
              items={resources.repositories.map((repository) => ({
                value: repository.id,
                label: repository.fullName,
              }))}
              onValueChange={(value) => {
                if (!value) {
                  return;
                }
                onChangeConfig({
                  ...config,
                  githubInstallationRepositoryId: value,
                });
              }}
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
          <SelectField
            id="vw-source-project"
            label={intl.formatMessage(messages.sourceUploadProject)}
            value={config.projectId ?? ANY_PROJECT_VALUE}
            items={[
              {
                value: ANY_PROJECT_VALUE,
                label: intl.formatMessage(messages.anyProject),
              },
              ...resources.projects.map((project) => ({
                value: project.id,
                label: project.name,
              })),
            ]}
            onValueChange={(value) => {
              if (!value) {
                return;
              }
              onChangeConfig({
                ...config,
                projectId: value === ANY_PROJECT_VALUE ? undefined : value,
              });
            }}
          />
        ) : null}
        {config.kind === "action.content_sync" ? (
          <ContentSyncConfigFields
            config={config}
            organizationSlug={organizationSlug}
            onChangeConfig={onChangeConfig}
          />
        ) : null}
        {config.kind === "ai.agent" ? (
          <>
            <TextAreaField
              id="vw-ai-prompt"
              label={intl.formatMessage(messages.aiPrompt)}
              value={config.prompt}
              {...connectedInputProps("prompt")}
              onChange={(value) => onChangeConfig({ ...config, prompt: value })}
            />
          </>
        ) : null}
        {config.kind === "trigger.manual" || config.kind === "logic.try_catch" ? (
          <TypographyP size="small" tone="subtle" className="py-6 text-center text-balance">
            <FormattedMessage
              {...(config.kind === "trigger.manual" ? messages.noConfig : messages.noSettings)}
            />
          </TypographyP>
        ) : null}
        {wireOnlyInputs.map((field) => (
          <WorkflowBoundField
            key={field.name}
            id={`vw-port-${field.name}`}
            label={field.name.slice("value.".length)}
            value=""
            onChange={() => {}}
            editable={false}
            invalid={invalidFields.has(field.name)}
            port={portFor(field.name)}
          />
        ))}
        {onChangeContract ? (
          <WorkflowDataPanel
            section="settings"
            node={node}
            nodes={nodes}
            edges={edges}
            organizationSlug={organizationSlug}
            onChange={onChangeContract}
          />
        ) : null}
        {"onError" in config ? (
          <Collapsible
            open={failOpen}
            onOpenChange={setFailOpen}
            className="border-t border-border pt-2"
          >
            <CollapsibleTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-between px-1"
                />
              }
            >
              <span className="flex items-center gap-1.5">
                <CaretRightIcon className={cn("size-3.5", failOpen && "rotate-90")} />
                <FormattedMessage {...messages.ifStepFails} />
              </span>
              <span className="text-xs font-normal text-muted-foreground">
                {intl.formatMessage(errorBehaviorMessage(config.onError ?? "stop"))}
              </span>
            </CollapsibleTrigger>
            <CollapsibleContent className="grid gap-4 pt-3">
              <ErrorBehaviorField
                value={config.onError ?? "stop"}
                onChange={(onError) => onChangeConfig({ ...config, onError })}
              />
              {config.kind === "action.http" ? (
                <CheckboxField
                  id="vw-http-fail-on-error"
                  label={intl.formatMessage(messages.httpFailOnError)}
                  checked={config.failOnHttpError ?? true}
                  onCheckedChange={(checked) =>
                    onChangeConfig({ ...config, failOnHttpError: checked === true })
                  }
                />
              ) : null}
            </CollapsibleContent>
          </Collapsible>
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
      </TabsContent>
      <VisualWorkflowIssueList
        issues={issues}
        nodes={nodes}
        selectedNodeId={node.id}
        onSelectNode={
          onSelectNode
            ? (nodeId) => {
                showIssueTab();
                onSelectNode(nodeId);
              }
            : undefined
        }
        onShowNode={
          onShowNode
            ? (nodeId) => {
                showIssueTab();
                onShowNode(nodeId);
              }
            : undefined
        }
      />
    </Tabs>
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
              <TrashIcon className="size-4" />
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
        <PlusIcon className="size-4" />
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

function ContentSyncConfigFields({
  config,
  organizationSlug,
  onChangeConfig,
}: {
  config: Extract<VisualNodeConfig, { kind: "action.content_sync" }>;
  organizationSlug?: string;
  onChangeConfig: (config: VisualNodeConfig) => void;
}) {
  const intl = useIntl();
  const resources = useVisualWorkflowResourceOptions(organizationSlug);
  const resourceOptions = resources.resourceOptionsFor(config.provider);
  const selectedResource = resourceOptions.find((option) => option.id === config.connectionId);

  useEffect(() => {
    const firstResource = resourceOptions[0];
    if (!firstResource) {
      return;
    }

    const hasResource = config.connectionId.trim() && config.resourceKey.trim();
    if (hasResource) {
      if (config.projectFolder.trim()) {
        return;
      }
      onChangeConfig({
        ...config,
        projectFolder: defaultContentSyncProjectFolder({
          provider: config.provider,
          resourceKey: config.resourceKey.trim(),
        }),
      });
      return;
    }

    onChangeConfig({
      ...config,
      connectionId: firstResource.id,
      resourceKey: firstResource.resourceKey,
      projectFolder:
        config.projectFolder.trim() ||
        defaultContentSyncProjectFolder({
          provider: config.provider,
          resourceKey: firstResource.resourceKey,
        }),
    });
  }, [
    config.connectionId,
    config.projectFolder,
    config.provider,
    config.resourceKey,
    onChangeConfig,
    resourceOptions,
  ]);

  function applyResource(next: {
    provider: ContentSyncProvider;
    connectionId: string;
    resourceKey: string;
  }) {
    onChangeConfig({
      ...config,
      provider: next.provider,
      connectionId: next.connectionId,
      resourceKey: next.resourceKey,
      projectFolder:
        config.projectFolder ||
        defaultContentSyncProjectFolder({
          provider: next.provider,
          resourceKey: next.resourceKey,
        }),
    });
  }

  return (
    <>
      <SelectField
        id="vw-content-sync-project"
        label={intl.formatMessage(messages.contentSyncProject)}
        value={config.projectId}
        placeholder={intl.formatMessage(messages.selectProject)}
        items={resources.projects.map((project) => ({
          value: project.id,
          label: project.name,
        }))}
        onValueChange={(value) => {
          if (!value) {
            return;
          }
          onChangeConfig({ ...config, projectId: value });
        }}
      />
      <SelectField
        id="vw-content-sync-provider"
        label={intl.formatMessage(messages.contentSyncProvider)}
        value={config.provider}
        placeholder={intl.formatMessage(messages.selectProvider)}
        items={(resources.availableProviders.length > 0
          ? resources.availableProviders
          : CONTENT_SYNC_PROVIDERS
        ).map((provider) => ({
          value: provider,
          label: intl.formatMessage(contentSyncProviderMessage(provider)),
        }))}
        onValueChange={(value) => {
          if (!value || !isContentSyncProvider(value)) {
            return;
          }
          applyResource({
            provider: value,
            connectionId: "",
            resourceKey: "",
          });
        }}
      />
      <SelectField
        id="vw-content-sync-resource"
        label={intl.formatMessage(messages.contentSyncResource)}
        value={selectedResource?.id ?? ""}
        placeholder={intl.formatMessage(messages.selectResource)}
        items={resourceOptions.map((option) => ({
          value: option.id,
          label: option.label,
        }))}
        onValueChange={(value) => {
          const option = resourceOptions.find((entry) => entry.id === value);
          if (!option) {
            return;
          }
          applyResource({
            provider: config.provider,
            connectionId: option.id,
            resourceKey: option.resourceKey,
          });
        }}
      />
      {contentSyncNeedsProviderFolder(config.provider) ? (
        <TextField
          id="vw-content-sync-provider-folder"
          label={intl.formatMessage(messages.contentSyncProviderFolder)}
          value={config.providerFolder}
          onChange={(value) => onChangeConfig({ ...config, providerFolder: value })}
        />
      ) : null}
      <TextField
        id="vw-content-sync-project-folder"
        label={intl.formatMessage(messages.contentSyncProjectFolder)}
        value={config.projectFolder}
        onChange={(value) => onChangeConfig({ ...config, projectFolder: value })}
      />
    </>
  );
}

function SelectField({
  id,
  label,
  value,
  items,
  onValueChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  items: { value: string; label: string }[];
  onValueChange: (value: string | null) => void;
  placeholder?: string;
}) {
  const selected = items.find((item) => item.value === value);
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value || null} items={items} onValueChange={onValueChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder={placeholder}>{selected?.label ?? value}</SelectValue>
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

function ContractFieldList({
  label,
  fields,
}: {
  label: string;
  fields: readonly VisualSubworkflowField[];
}) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      {fields.length === 0 ? (
        <p className="text-xs text-muted-foreground">None</p>
      ) : (
        <ul className="grid gap-1 rounded-md border border-border p-2 text-xs">
          {fields.map((field) => (
            <li key={field.id ?? field.name} className="flex items-center justify-between gap-2">
              <span className="truncate font-mono">{field.name}</span>
              <span className="text-muted-foreground">
                {field.type}
                {field.required === false ? " · optional" : " · required"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  placeholder,
  disabled = false,
  description,
  invalid = false,
  port,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  description?: string;
  invalid?: boolean;
  /** Set for a setting that a wire or an earlier step's field can feed. */
  port?: BoundPort;
}) {
  if (port) {
    return (
      <WorkflowBoundField
        id={id}
        label={label}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        invalid={invalid}
        description={description}
        port={port}
      />
    );
  }
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
    </div>
  );
}

function TextAreaField({
  id,
  label,
  value,
  onChange,
  placeholder,
  disabled = false,
  description,
  invalid = false,
  port,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  description?: string;
  invalid?: boolean;
  /** Set for a setting that a wire or an earlier step's field can feed. */
  port?: BoundPort;
}) {
  if (port) {
    return (
      <WorkflowBoundField
        id={id}
        label={label}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        invalid={invalid}
        description={description}
        multiline
        port={port}
      />
    );
  }
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        value={value}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
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

const WORKFLOW_VALUE_TYPES: readonly WorkflowValueType[] = [
  "string",
  "number",
  "boolean",
  "object",
  "array",
  "unknown",
];

function isWorkflowValueType(value: string | null): value is WorkflowValueType {
  return WORKFLOW_VALUE_TYPES.includes(value as WorkflowValueType);
}

function defaultValueForType(type: WorkflowValueType): unknown {
  if (type === "number") return 0;
  if (type === "boolean") return false;
  if (type === "object") return {};
  if (type === "array") return [];
  return "";
}

function formatObjectDefault(value: unknown, type: WorkflowValueType): string {
  if (type === "string") return typeof value === "string" ? value : "";
  if (type === "number" || type === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function parseObjectDefault(value: string, type: WorkflowValueType): unknown {
  if (type === "string") return value;
  if (type === "number") return Number(value);
  if (type === "boolean") return value === "true";
  return JSON.parse(value);
}

function usesJsonObjectDefault(type: WorkflowValueType): boolean {
  return type === "object" || type === "array";
}

function tryParseJson(value: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(value) };
  } catch {
    return { ok: false };
  }
}

function ObjectDefaultInput({
  ariaLabel,
  value,
  type,
  disabled,
  invalid,
  onChange,
}: {
  ariaLabel: string;
  value: unknown;
  type: WorkflowValueType;
  disabled?: boolean;
  invalid?: boolean;
  onChange: (value: unknown) => void;
}) {
  const formatted = formatObjectDefault(value, type);
  const [draft, setDraft] = useState<string | null>(null);
  const display = draft ?? formatted;
  const jsonDraftInvalid = usesJsonObjectDefault(type) && draft !== null && !tryParseJson(draft).ok;

  return (
    <Input
      aria-label={ariaLabel}
      value={display}
      disabled={disabled}
      aria-invalid={invalid || jsonDraftInvalid || undefined}
      onChange={(event) => {
        const next = event.target.value;
        if (!usesJsonObjectDefault(type)) {
          setDraft(null);
          onChange(parseObjectDefault(next, type));
          return;
        }

        setDraft(next);
        const parsed = tryParseJson(next);
        if (parsed.ok) {
          onChange(parsed.value);
        }
      }}
      onBlur={() => {
        if (!usesJsonObjectDefault(type)) {
          return;
        }

        const parsed = tryParseJson(draft ?? formatted);
        if (parsed.ok) {
          onChange(parsed.value);
          setDraft(null);
        }
      }}
    />
  );
}

function isHttpAuthType(value: string): value is HttpAuthType {
  return value === "none" || value === "bearer" || value === "api_key";
}

function isErrorBehavior(value: string): value is VisualNodeErrorBehavior {
  return ERROR_BEHAVIORS.includes(value as VisualNodeErrorBehavior);
}

function isContentSyncProvider(value: string): value is ContentSyncProvider {
  return CONTENT_SYNC_PROVIDERS.includes(value as ContentSyncProvider);
}

function contentSyncProviderMessage(provider: ContentSyncProvider) {
  switch (provider) {
    case "github":
      return messages.providerGithub;
    case "gitlab":
      return messages.providerGitlab;
    case "contentful":
      return messages.providerContentful;
    case "intercom":
      return messages.providerIntercom;
  }
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

function titleForTrigger(type: VisualCatalogType) {
  switch (type) {
    case "trigger.manual":
      return messages.nodeManualTrigger;
    case "trigger.scheduled":
      return messages.nodeScheduledTrigger;
    case "trigger.github":
      return messages.nodeGithubTrigger;
    case "trigger.source_upload":
      return messages.nodeSourceUploadTrigger;
    default:
      return messages.triggerType;
  }
}
