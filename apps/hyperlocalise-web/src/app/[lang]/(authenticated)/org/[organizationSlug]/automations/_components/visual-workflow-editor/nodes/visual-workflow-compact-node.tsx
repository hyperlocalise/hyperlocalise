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
import { HugeiconsIcon } from "@hugeicons/react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { defineMessages, FormattedMessage, useIntl } from "react-intl";

import { Card } from "@/components/ui/card";
import {
  catalogItemByType,
  isTriggerType,
  resolveNodeSubtitle,
  TRIGGER_BADGE_ICON,
} from "@/lib/visual-workflows/catalog/node-catalog";
import { getPrimaryExecutionSourceHandle } from "@/lib/visual-workflows/validation/execution-handles";
import {
  getWorkflowOutputFields,
  NODE_CONTRACTS,
} from "@/lib/visual-workflows/catalog/node-contracts";
import { nodeSupportsErrorBranch } from "@/lib/visual-workflows/runtime/node-options";
import type { VisualWorkflowRfNode } from "@/lib/visual-workflows/schema/types";
import { cn } from "@/lib/primitives/cn";

import { useVisualWorkflowCanvasActions } from "../visual-workflow-canvas-actions";
import { visualWorkflowEditorMessages as messages } from "../visual-workflow-editor.messages";
import { VisualWorkflowQuickAddButton } from "./visual-workflow-quick-add-button";

const nodeStatusMessages = defineMessages({
  running: { defaultMessage: "Running", id: "ZWQ+8S8rpv", description: "Workflow node status" },
  succeeded: { defaultMessage: "Succeeded", id: "Xrszg9pweO", description: "Workflow node status" },
  failed: { defaultMessage: "Failed", id: "0McReeKvvn", description: "Workflow node status" },
  skipped: { defaultMessage: "Skipped", id: "M4fWpCxmyH", description: "Workflow node status" },
  blocked: { defaultMessage: "Blocked", id: "7l8Z5CE6R2", description: "Workflow node status" },
  cancelled: { defaultMessage: "Cancelled", id: "d+3V9LkYqX", description: "Workflow node status" },
  handled_error: {
    defaultMessage: "Handled error",
    id: "oTsWk//pCE",
    description: "Workflow node status",
  },
  needs_attention: {
    defaultMessage: "Needs attention",
    id: "42qlKZdHsf",
    description: "Workflow node status",
  },
});
const HANDLE_CLASS = "size-2.5! border-2 border-background bg-primary";

export function VisualWorkflowCompactNode({ id, data, selected }: NodeProps<VisualWorkflowRfNode>) {
  const intl = useIntl();
  const { onAddFromNode } = useVisualWorkflowCanvasActions();
  const catalog = catalogItemByType(data.catalogType);
  const isTrigger = isTriggerType(data.catalogType);
  const isIf = data.catalogType === "logic.if";
  const isSwitch = data.catalogType === "logic.switch";
  const showErrorHandle = nodeSupportsErrorBranch(data.config);
  const dataInputs = NODE_CONTRACTS[data.catalogType].inputs;
  const dataOutputs = getWorkflowOutputFields({
    id,
    type: data.catalogType,
    config: data.config,
    inputs: data.inputs,
    outputFields: data.outputFields,
    bodyNodeIds: data.bodyNodeIds,
    collect: data.collect,
  });
  const title = intl.formatMessage(titleMessage(data.catalogType));
  const subtitle = data.previewSubtitle ?? resolveNodeSubtitle(data.config);
  const primaryHandle = getPrimaryExecutionSourceHandle({
    type: data.catalogType,
    config: data.config,
  });
  const primaryHandleLabel = isIf
    ? intl.formatMessage(messages.trueHandle)
    : isSwitch && primaryHandle === "default"
      ? intl.formatMessage(messages.switchDefaultHandle)
      : isSwitch
        ? intl.formatMessage(messages.switchCaseHandle, { index: 1 })
        : data.catalogType === "logic.for_each"
          ? intl.formatMessage(messages.eachHandle)
          : data.catalogType === "logic.retry"
            ? intl.formatMessage(messages.attemptHandle)
            : null;

  const addFromHandle = (handleId?: string) => {
    onAddFromNode({
      nodeId: id,
      handleId,
    });
  };

  const switchHandles =
    isSwitch && data.config.kind === "logic.switch"
      ? [
          ...data.config.cases.map((caseEntry, index) => ({
            id: caseEntry.id,
            label: intl.formatMessage(messages.switchCaseHandle, { index: index + 1 }),
          })),
          { id: "default", label: intl.formatMessage(messages.switchDefaultHandle) },
        ]
      : [];

  return (
    <Card
      aria-busy={data.runStatus === "running"}
      className={cn(
        "relative w-[200px] gap-0 overflow-visible! rounded-xl p-3 shadow-sm",
        selected ? "ring-2 ring-ring" : null,
        data.runStatus === "running" ? "ring-2 ring-primary/70" : null,
        data.runStatus === "succeeded" ? "border-grove-700/40 bg-grove-100/60" : null,
        data.runStatus === "failed" ? "border-destructive/40 bg-destructive/5" : null,
      )}
    >
      {dataInputs.map((input, index) => (
        <Handle
          key={`data-input-${input.name}`}
          id={input.name}
          type="target"
          position={Position.Top}
          className={cn(HANDLE_CLASS, "bg-sky-500")}
          style={{ left: `${((index + 1) / (dataInputs.length + 1)) * 100}%` }}
          aria-label={`Data input: ${input.name}`}
          title={input.name}
        />
      ))}
      {dataOutputs.map((output, index) => (
        <Handle
          key={`data-output-${output.path}`}
          id={output.path}
          type="source"
          position={Position.Bottom}
          className={cn(HANDLE_CLASS, "bg-sky-500")}
          style={{ left: `${((index + 1) / (dataOutputs.length + 1)) * 100}%` }}
          aria-label={`Data output: ${output.path}`}
          title={output.path}
        />
      ))}
      {isTrigger ? (
        <span
          className="absolute top-2 left-2 text-primary"
          title={intl.formatMessage(messages.triggerBadge)}
        >
          <HugeiconsIcon icon={TRIGGER_BADGE_ICON} className="size-3.5" strokeWidth={2} />
        </span>
      ) : (
        <Handle
          id="input"
          className={HANDLE_CLASS}
          position={Position.Left}
          type="target"
          aria-label="Execution input"
        />
      )}

      {isIf ? (
        <>
          <Handle
            className={cn(HANDLE_CLASS, "top-[35%]!")}
            id="true"
            position={Position.Right}
            type="source"
          />
          <Handle
            className={cn(HANDLE_CLASS, "top-[65%]! bg-muted-foreground")}
            id="false"
            position={Position.Right}
            type="source"
          />
        </>
      ) : data.catalogType === "logic.for_each" ? (
        <>
          <Handle
            className={cn(HANDLE_CLASS, "top-[35%]!")}
            id="each"
            position={Position.Right}
            type="source"
            aria-label="Each item"
          />
          <Handle
            className={cn(HANDLE_CLASS, "top-[65%]!")}
            id="done"
            position={Position.Right}
            type="source"
            aria-label="Done"
          />
        </>
      ) : data.catalogType === "logic.retry" ? (
        <>
          <Handle
            className={cn(HANDLE_CLASS, "top-[28%]!")}
            id="attempt"
            position={Position.Right}
            type="source"
            aria-label="Attempt"
          />
          <Handle
            className={cn(HANDLE_CLASS, "top-[50%]!")}
            id="succeeded"
            position={Position.Right}
            type="source"
            aria-label="Succeeded"
          />
          <Handle
            className={cn(HANDLE_CLASS, "top-[72%]! bg-muted-foreground")}
            id="exhausted"
            position={Position.Right}
            type="source"
            aria-label="Exhausted"
          />
        </>
      ) : isSwitch ? (
        switchHandles.map((handle, index) => (
          <Handle
            key={handle.id}
            className={cn(HANDLE_CLASS, handle.id === "default" ? "bg-muted-foreground" : null)}
            id={handle.id}
            position={Position.Right}
            type="source"
            style={{
              top: `${((index + 1) / (switchHandles.length + 1)) * 100}%`,
            }}
          />
        ))
      ) : (
        <>
          <Handle
            id="success"
            className={HANDLE_CLASS}
            position={Position.Right}
            type="source"
            aria-label="Execution success"
          />
          {showErrorHandle ? (
            <Handle
              className={cn(HANDLE_CLASS, "top-[75%]! bg-destructive")}
              id="error"
              position={Position.Right}
              type="source"
            />
          ) : null}
        </>
      )}

      <div className="flex flex-col items-center gap-1.5 pt-1 text-center">
        <HugeiconsIcon icon={catalog.icon} className="size-7 text-foreground" strokeWidth={1.6} />
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>

      {isIf ? (
        <div className="pointer-events-none absolute inset-y-0 right-[-4.25rem] flex flex-col justify-around py-4 text-[10px] font-medium text-muted-foreground">
          <span>
            <FormattedMessage {...messages.trueHandle} />
          </span>
          <span className="flex items-center gap-1">
            <FormattedMessage {...messages.falseHandle} />
            {data.hideAddAction ? null : (
              <VisualWorkflowQuickAddButton
                className="pointer-events-auto size-5"
                handleId="false"
                label={intl.formatMessage(messages.addNodeFromHandle, {
                  handle: intl.formatMessage(messages.falseHandle),
                })}
                onAdd={addFromHandle}
              />
            )}
          </span>
        </div>
      ) : null}

      {data.catalogType === "logic.for_each" ? (
        <div className="pointer-events-none absolute inset-y-0 right-[-5.25rem] flex flex-col justify-around py-4 text-[10px] font-medium text-muted-foreground">
          <span>
            <FormattedMessage {...messages.eachHandle} />
          </span>
          <span className="flex items-center gap-1">
            <FormattedMessage {...messages.doneHandle} />
            {data.hideAddAction ? null : (
              <VisualWorkflowQuickAddButton
                className="pointer-events-auto size-5"
                handleId="done"
                label={intl.formatMessage(messages.addNodeFromHandle, {
                  handle: intl.formatMessage(messages.doneHandle),
                })}
                onAdd={addFromHandle}
              />
            )}
          </span>
        </div>
      ) : null}
      {data.catalogType === "logic.retry" ? (
        <div className="pointer-events-none absolute inset-y-0 right-[-5.5rem] flex flex-col justify-evenly py-2 text-[10px] font-medium text-muted-foreground">
          <span>
            <FormattedMessage {...messages.attemptHandle} />
          </span>
          <span className="flex items-center gap-1">
            <FormattedMessage {...messages.succeededHandle} />
            {data.hideAddAction ? null : (
              <VisualWorkflowQuickAddButton
                className="pointer-events-auto size-5"
                handleId="succeeded"
                label={intl.formatMessage(messages.addNodeFromHandle, {
                  handle: intl.formatMessage(messages.succeededHandle),
                })}
                onAdd={addFromHandle}
              />
            )}
          </span>
          <span className="flex items-center gap-1">
            <FormattedMessage {...messages.exhaustedHandle} />
            {data.hideAddAction ? null : (
              <VisualWorkflowQuickAddButton
                className="pointer-events-auto size-5"
                handleId="exhausted"
                label={intl.formatMessage(messages.addNodeFromHandle, {
                  handle: intl.formatMessage(messages.exhaustedHandle),
                })}
                onAdd={addFromHandle}
              />
            )}
          </span>
        </div>
      ) : null}
      {data.runStatus && data.runStatus !== "idle" ? (
        <p className="mt-2 text-center text-xs text-muted-foreground" role="status">
          {intl.formatMessage(nodeStatusMessages[data.runStatus])}
        </p>
      ) : null}
      {isSwitch ? (
        <div className="pointer-events-none absolute inset-y-0 right-[-4.5rem] flex flex-col justify-evenly py-2 text-[10px] font-medium text-muted-foreground">
          {switchHandles.map((handle) => (
            <span key={handle.id} className="flex items-center gap-1">
              {handle.label}
              {data.hideAddAction || handle.id === primaryHandle ? null : (
                <VisualWorkflowQuickAddButton
                  className="pointer-events-auto size-5"
                  handleId={handle.id}
                  label={intl.formatMessage(messages.addNodeFromHandle, { handle: handle.label })}
                  onAdd={addFromHandle}
                />
              )}
            </span>
          ))}
        </div>
      ) : null}

      {showErrorHandle && !isIf && !isSwitch && data.catalogType !== "logic.retry" ? (
        <div className="pointer-events-none absolute top-[72%] right-[-4.5rem] flex items-center gap-1 text-[10px] font-medium text-destructive">
          <FormattedMessage {...messages.errorHandle} />
          {data.hideAddAction ? null : (
            <VisualWorkflowQuickAddButton
              className="pointer-events-auto size-5"
              handleId="error"
              label={intl.formatMessage(messages.addNodeFromHandle, {
                handle: intl.formatMessage(messages.errorHandle),
              })}
              onAdd={addFromHandle}
            />
          )}
        </div>
      ) : null}

      {data.lastOutput && Object.keys(data.lastOutput).length > 0 ? (
        <div className="mt-2 max-h-16 overflow-hidden border-t border-border pt-2 text-left text-[10px] text-muted-foreground">
          <p className="line-clamp-3 font-mono break-all">{JSON.stringify(data.lastOutput)}</p>
        </div>
      ) : null}

      {data.hideAddAction ? null : (
        <VisualWorkflowQuickAddButton
          className="absolute top-1/2 -right-3 -translate-y-1/2"
          handleId={primaryHandle ?? undefined}
          label={
            primaryHandleLabel
              ? intl.formatMessage(messages.addNodeFromHandle, { handle: primaryHandleLabel })
              : intl.formatMessage(messages.addNode)
          }
          onAdd={addFromHandle}
        />
      )}
    </Card>
  );
}

function titleMessage(type: VisualWorkflowRfNode["data"]["catalogType"]) {
  switch (type) {
    case "trigger.manual":
      return messages.nodeManualTrigger;
    case "trigger.scheduled":
      return messages.nodeScheduledTrigger;
    case "trigger.github":
      return messages.nodeGithubTrigger;
    case "trigger.source_upload":
      return messages.nodeSourceUploadTrigger;
    case "action.http":
      return messages.nodeHttp;
    case "action.notify_slack":
      return messages.nodeNotifySlack;
    case "action.notify_email":
      return messages.nodeNotifyEmail;
    case "logic.if":
      return messages.nodeIf;
    case "logic.switch":
      return messages.nodeSwitch;
    case "logic.set":
      return messages.nodeSet;
    case "ai.agent":
      return messages.nodeAi;
    case "logic.for_each":
      return messages.nodeLoop;
    case "logic.retry":
      return messages.nodeRetry;
  }
}
