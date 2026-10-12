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
import { CircleIcon, PlayIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { Handle, Position, useEdges, type NodeProps } from "@xyflow/react";
import { defineMessages, FormattedMessage, useIntl } from "react-intl";

import { Card } from "@/components/ui/card";
import {
  catalogItemByType,
  getVisualNodeDimensions,
  isTriggerType,
  resolveNodeSubtitle,
  TRIGGER_BADGE_ICON,
} from "@/lib/visual-workflows/catalog/node-catalog";
import { getPrimaryExecutionSourceHandle } from "@/lib/visual-workflows/validation/execution-handles";
import {
  getVisualWorkflowDataPorts,
  type VisualWorkflowDataPort,
} from "@/lib/visual-workflows/editor/visual-workflow-data-ports";
import { nodeSupportsErrorBranch } from "@/lib/visual-workflows/runtime/node-options";
import type {
  VisualWorkflowRfEdge,
  VisualWorkflowRfNode,
} from "@/lib/visual-workflows/schema/types";
import { cn } from "@/lib/primitives/cn";

import { useVisualWorkflowCanvasActions } from "../visual-workflow-canvas-actions";
import { visualWorkflowEditorMessages as messages } from "../visual-workflow-editor.messages";
import { VisualWorkflowQuickAddButton } from "./visual-workflow-quick-add-button";
import { createElement, type ComponentProps, type CSSProperties } from "react";

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
// React Flow draws a handle as a dot of its own, and its stylesheet, being in no cascade layer,
// outranks Tailwind's utilities. The `!` classes switch that dot off and leave the handle as the
// thing to grab; its shape is a Phosphor icon inside it, in the handle's text colour.
const HANDLE_CLASS = cn(
  "group/handle size-2.5! border-0! bg-transparent!",
  "transition-colors duration-100 motion-reduce:transition-none",
  // A target larger than the icon, so it can be grabbed without aiming.
  "after:absolute after:-inset-[7px] after:rounded-full after:content-['']",
  // Where a connection being dragged would land: green once it is one the canvas allows.
  "[&.connectingto.valid]:text-emerald-500",
);

// The icon grows by its width and height, not by a scale. While a scale animates, the browser
// draws the icon and everything painted over it in layers of their own, snapped to whole pixels,
// and on a canvas that sits at a fraction of a pixel the rest of the step visibly jumps.
const HANDLE_ICON_CLASS = cn(
  // The pointer has to reach the handle itself, which is what React Flow looks for under it.
  "pointer-events-none absolute top-1/2 left-1/2 size-(--handle-icon) -translate-1/2",
  // As quick as the app's menus and popovers; its 150ms default reads as slow on a change of size.
  "transition-[width,height] duration-100 motion-reduce:transition-none",
  // Under the pointer, and where a connection starts from by drag or by click.
  "group-[:not(.connectingto):hover]/handle:size-[calc(var(--handle-icon)*1.5)]",
  "group-[.connectingfrom]/handle:size-[calc(var(--handle-icon)*1.5)]",
  "group-[.clickconnecting]/handle:size-[calc(var(--handle-icon)*1.5)]",
  // Where a connection being dragged would land: dimmed until it is one the canvas allows.
  "group-[.connectingto]/handle:size-[calc(var(--handle-icon)*1.25)]",
  "group-[.connectingto]/handle:opacity-30 group-[.connectingto.valid]/handle:opacity-100",
);

// The app's primary, destructive and muted colours are far heavier than the data ports' type
// colours. Mixed with the background they sit at the same strength, and stay opaque, so neither
// the card's border nor a step's glow shows through.
const EXECUTION_ICON_TONE_CLASS =
  "text-[color:color-mix(in_oklab,currentColor_60%,var(--background))]";

/**
 * Where the workflow runs into or out of a step: an arrow pointing the way it runs, so it cannot
 * be taken for a data port. `className` sets its place and, with a text colour, its tone.
 */
function ExecutionHandle({ className, ...props }: ComponentProps<typeof Handle>) {
  return (
    <Handle {...props} className={cn(HANDLE_CLASS, "text-primary", className)}>
      <PlayIcon
        weight="fill"
        className={cn(HANDLE_ICON_CLASS, EXECUTION_ICON_TONE_CLASS, "[--handle-icon:14px]")}
        aria-hidden
      />
    </Handle>
  );
}

/** Where a value enters or leaves a step: a round dot, in its type's colour through `className`. */
function DataHandle({ className, ...props }: ComponentProps<typeof Handle>) {
  return (
    <Handle {...props} className={cn(HANDLE_CLASS, className)}>
      <CircleIcon
        weight="fill"
        className={cn(HANDLE_ICON_CLASS, "[--handle-icon:12px]")}
        aria-hidden
      />
    </Handle>
  );
}

// A step's state is marked with a soft glow, not a hard outline: the canvas moves by fractions of
// a pixel, and a thin bright line flickers between two and three pixels wide as it does.
const STEP_GLOW_CLASS = {
  // Inside the card, so it never mixes with the selection's glow around it.
  issue: "inset-shadow-[0_0_6px_1px_color-mix(in_oklab,var(--destructive)_50%,transparent)]",
  selected: "shadow-[0_0_6px_1px_color-mix(in_oklab,var(--ring)_50%,transparent)]",
};

const DATA_TYPE_CLASS: Record<VisualWorkflowDataPort["type"], string> = {
  string: "text-blue-500",
  number: "text-amber-500",
  boolean: "text-violet-500",
  object: "text-emerald-500",
  array: "text-pink-500",
  unknown: "text-slate-500",
};

// A step's execution dots and their labels are placed down its top part, above its data ports, so
// the two kinds of dot never land on one spot of the card's edge. Without data ports that part is
// the whole card.
const EXECUTION_ZONE_VARIABLE = "--execution-zone";
// The card's padding, the icon, title and subtitle, and the gap above the data ports.
const EXECUTION_ZONE_MIN_HEIGHT = 104;
const EXECUTION_ZONE_INSET = 24;
const EXECUTION_DOT_PITCH = 24;

function executionTop(fraction: number): CSSProperties {
  return { top: `calc(var(${EXECUTION_ZONE_VARIABLE}) * ${fraction})` };
}

const TRY_CATCH_HANDLES = [
  { id: "try", label: "Try" },
  { id: "success", label: "Success" },
  { id: "catch", label: "Catch", className: "text-destructive" },
  { id: "finally", label: "Finally", className: "text-muted-foreground" },
];

// A port's row starts inside the card's padding. This puts its dot on the card's edge, where the
// execution dots are, and clear of the port's name and type.
const DATA_PORT_EDGE_CLASS = { input: "-left-3!", output: "-right-3!" };

function DataPortLabel({
  port,
  direction,
}: {
  port: VisualWorkflowDataPort;
  direction: "input" | "output";
}) {
  const connected = port.connectionCount > 0;

  return (
    <div
      className={cn(
        "relative flex min-h-6 items-center gap-1.5 text-[10px]",
        direction === "output" ? "justify-end text-right" : null,
      )}
      title={`${port.label}: ${port.type}${port.optional ? " (optional)" : ""}`}
    >
      {direction === "input" ? (
        <DataHandle
          id={port.id}
          type="target"
          position={Position.Left}
          className={cn(
            DATA_PORT_EDGE_CLASS.input,
            DATA_TYPE_CLASS[port.type],
            connected ? "ring-2 ring-primary/30" : null,
          )}
          aria-label={`Data input: ${port.label}, ${port.type}${port.optional ? ", optional" : ""}`}
        />
      ) : null}

      <span className="min-w-0 truncate font-medium">{port.label}</span>
      <span className="shrink-0 text-muted-foreground">{port.type}</span>

      {direction === "output" ? (
        <DataHandle
          id={port.id}
          type="source"
          position={Position.Right}
          className={cn(
            DATA_PORT_EDGE_CLASS.output,
            DATA_TYPE_CLASS[port.type],
            connected ? "ring-2 ring-primary/30" : null,
          )}
          aria-label={`Data output: ${port.label}, ${port.type}${
            port.optional ? ", optional" : ""
          }`}
        />
      ) : null}
    </div>
  );
}

export function VisualWorkflowCompactNode({ id, data, selected }: NodeProps<VisualWorkflowRfNode>) {
  const intl = useIntl();
  const edges = useEdges<VisualWorkflowRfEdge>();
  const { onAddFromNode, issueNodeIds } = useVisualWorkflowCanvasActions();
  const hasIssue = issueNodeIds.has(id);
  const catalog = catalogItemByType(data.catalogType);
  const isTrigger = isTriggerType(data.catalogType);
  const isIf = data.catalogType === "logic.if";
  const isSwitch = data.catalogType === "logic.switch";
  const isTerminal = ["flow.stop", "flow.return", "flow.fail"].includes(data.catalogType);
  const showErrorHandle = nodeSupportsErrorBranch(data.config);
  const dataPorts = getVisualWorkflowDataPorts({
    node: {
      id,
      type: data.catalogType,
      position: { x: 0, y: 0 },
      data,
    },
    edges,
  });
  const hasDataPorts = dataPorts.inputs.length > 0 || dataPorts.outputs.length > 0;
  const hasSingleExecutionOutput =
    !isIf &&
    !isSwitch &&
    data.catalogType !== "logic.for_each" &&
    data.catalogType !== "logic.retry" &&
    data.catalogType !== "flow.wait" &&
    data.catalogType !== "logic.merge" &&
    data.catalogType !== "logic.sequence" &&
    data.catalogType !== "logic.try_catch";
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
            : data.catalogType === "flow.wait"
              ? intl.formatMessage(messages.completedHandle)
              : data.catalogType === "logic.try_catch"
                ? intl.formatMessage(messages.tryHandle)
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

  const mergeInputs = data.config.kind === "logic.merge" ? data.config.inputs : [];
  const sequenceOutputs = data.config.kind === "logic.sequence" ? data.config.outputs : [];
  // The most dots that are spread evenly down one side of the step.
  const spreadExecutionDotCount = Math.max(
    mergeInputs.length,
    sequenceOutputs.length,
    switchHandles.length,
    data.catalogType === "logic.try_catch" ? TRY_CATCH_HANDLES.length : 0,
  );
  const executionZoneHeight = hasDataPorts
    ? Math.max(EXECUTION_ZONE_MIN_HEIGHT, (spreadExecutionDotCount + 1) * EXECUTION_DOT_PITCH)
    : null;

  return (
    <Card
      aria-busy={data.runStatus === "running"}
      style={
        {
          minHeight: getVisualNodeDimensions(data.catalogType, data.config).height,
          [EXECUTION_ZONE_VARIABLE]: executionZoneHeight ? `${executionZoneHeight}px` : "100%",
        } as CSSProperties
      }
      className={cn(
        "relative w-[280px] gap-0 overflow-visible! rounded-xl p-3 shadow-sm",
        hasIssue ? STEP_GLOW_CLASS.issue : null,
        selected ? STEP_GLOW_CLASS.selected : null,
        data.runStatus === "running" ? "ring-2 ring-primary/70" : null,
        data.runStatus === "succeeded" ? "border-grove-700/40 bg-grove-100/60" : null,
        data.runStatus === "failed" ? "border-destructive/40 bg-destructive/5" : null,
      )}
    >
      {hasIssue ? (
        <span
          className="absolute top-2 right-2 text-destructive"
          title={intl.formatMessage(messages.stepHasIssue)}
        >
          <WarningCircleIcon className="size-3.5" />
        </span>
      ) : null}
      {isTrigger ? (
        <span
          className="absolute top-2 left-2 text-primary"
          title={intl.formatMessage(messages.triggerBadge)}
        >
          {createElement(TRIGGER_BADGE_ICON, { className: "size-3.5" })}
        </span>
      ) : data.config.kind === "logic.merge" ? (
        mergeInputs.map((input, index) => (
          <ExecutionHandle
            key={input.id}
            id={input.id}
            position={Position.Left}
            type="target"
            aria-label={`Merge input: ${input.name}`}
            style={executionTop((index + 1) / (mergeInputs.length + 1))}
          />
        ))
      ) : (
        <ExecutionHandle
          id="input"
          className={hasDataPorts ? "top-16!" : undefined}
          position={Position.Left}
          type="target"
          aria-label="Execution input"
        />
      )}
      {data.config.kind === "logic.sequence" ? (
        sequenceOutputs.map((output, index) => (
          <ExecutionHandle
            aria-label={`Sequence output: ${output.label}`}
            id={output.id}
            key={output.id}
            position={Position.Right}
            style={executionTop((index + 1) / (sequenceOutputs.length + 1))}
            type="source"
          />
        ))
      ) : isIf ? (
        <>
          <ExecutionHandle
            style={executionTop(0.35)}
            id="true"
            position={Position.Right}
            type="source"
          />
          <ExecutionHandle
            className="text-muted-foreground"
            style={executionTop(0.65)}
            id="false"
            position={Position.Right}
            type="source"
          />
        </>
      ) : data.catalogType === "logic.for_each" ? (
        <>
          <ExecutionHandle
            style={executionTop(0.35)}
            id="each"
            position={Position.Right}
            type="source"
            aria-label="Each item"
          />
          <ExecutionHandle
            style={executionTop(0.65)}
            id="done"
            position={Position.Right}
            type="source"
            aria-label="Done"
          />
        </>
      ) : data.catalogType === "logic.retry" ? (
        <>
          <ExecutionHandle
            style={executionTop(0.28)}
            id="attempt"
            position={Position.Right}
            type="source"
            aria-label="Attempt"
          />
          <ExecutionHandle
            style={executionTop(0.5)}
            id="succeeded"
            position={Position.Right}
            type="source"
            aria-label="Succeeded"
          />
          <ExecutionHandle
            className="text-muted-foreground"
            style={executionTop(0.72)}
            id="exhausted"
            position={Position.Right}
            type="source"
            aria-label="Exhausted"
          />
        </>
      ) : data.catalogType === "flow.wait" ? (
        <>
          <ExecutionHandle
            style={executionTop(0.28)}
            id="completed"
            position={Position.Right}
            type="source"
            aria-label="Completed"
          />
          <ExecutionHandle
            className="text-muted-foreground"
            style={executionTop(0.5)}
            id="timed_out"
            position={Position.Right}
            type="source"
            aria-label="Timed out"
          />
          <ExecutionHandle
            className="text-destructive"
            style={executionTop(0.72)}
            id="error"
            position={Position.Right}
            type="source"
            aria-label="Error"
          />
        </>
      ) : data.catalogType === "logic.merge" ? (
        <>
          <ExecutionHandle
            style={executionTop(0.28)}
            id="completed"
            position={Position.Right}
            type="source"
            aria-label="Completed"
          />
          <ExecutionHandle
            className="text-muted-foreground"
            style={executionTop(0.5)}
            id="timed_out"
            position={Position.Right}
            type="source"
            aria-label="Timed out"
          />
          <ExecutionHandle
            className="text-destructive"
            style={executionTop(0.72)}
            id="error"
            position={Position.Right}
            type="source"
            aria-label="Error"
          />
        </>
      ) : data.catalogType === "logic.try_catch" ? (
        <>
          {TRY_CATCH_HANDLES.map((handle, index) => (
            <ExecutionHandle
              aria-label={handle.label}
              className={handle.className}
              id={handle.id}
              key={handle.id}
              position={Position.Right}
              style={executionTop((index + 1) / (TRY_CATCH_HANDLES.length + 1))}
              type="source"
            />
          ))}
        </>
      ) : isSwitch ? (
        switchHandles.map((handle, index) => (
          <ExecutionHandle
            key={handle.id}
            className={handle.id === "default" ? "text-muted-foreground" : undefined}
            id={handle.id}
            position={Position.Right}
            type="source"
            style={executionTop((index + 1) / (switchHandles.length + 1))}
          />
        ))
      ) : isTerminal ? null : (
        <>
          <ExecutionHandle
            id="success"
            className={hasDataPorts ? "top-16!" : undefined}
            position={Position.Right}
            type="source"
            aria-label="Execution success"
          />
          {showErrorHandle ? (
            <ExecutionHandle
              className="text-destructive"
              style={executionTop(hasDataPorts ? 0.88 : 0.75)}
              id="error"
              position={Position.Right}
              type="source"
            />
          ) : null}
        </>
      )}

      <div
        className="flex flex-col items-center justify-center gap-1.5 pt-1 text-center"
        style={
          executionZoneHeight
            ? { minHeight: executionZoneHeight - EXECUTION_ZONE_INSET }
            : undefined
        }
      >
        {createElement(catalog.icon, { className: "size-7 text-foreground" })}
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>

      {hasDataPorts ? (
        <div className="mt-3 grid grid-cols-2 gap-3 border-t border-border pt-2">
          <div className="min-w-0">
            <p className="mb-1 text-left text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
              <FormattedMessage
                defaultMessage="Inputs"
                id="xOduwNEWmK"
                description="Workflow node data input ports heading"
              />
            </p>

            <div className="space-y-0.5">
              {dataPorts.inputs.map((port) => (
                <DataPortLabel key={`data-input-${port.id}`} port={port} direction="input" />
              ))}
            </div>
          </div>

          <div className="min-w-0">
            <p className="mb-1 text-right text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
              <FormattedMessage
                defaultMessage="Outputs"
                id="AfVZqT7lYf"
                description="Workflow node data output ports heading"
              />
            </p>

            <div className="space-y-0.5">
              {dataPorts.outputs.map((port) => (
                <DataPortLabel key={`data-output-${port.id}`} port={port} direction="output" />
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {isIf ? (
        <div className="pointer-events-none absolute top-0 h-(--execution-zone) right-[-4.25rem] flex flex-col justify-around py-4 text-[10px] font-medium text-muted-foreground">
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
        <div className="pointer-events-none absolute top-0 h-(--execution-zone) right-[-5.25rem] flex flex-col justify-around py-4 text-[10px] font-medium text-muted-foreground">
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
        <div className="pointer-events-none absolute top-0 h-(--execution-zone) right-[-5.5rem] flex flex-col justify-evenly py-2 text-[10px] font-medium text-muted-foreground">
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
      {data.catalogType === "flow.wait" ? (
        <div className="pointer-events-none absolute top-0 h-(--execution-zone) right-[-5.5rem] flex flex-col justify-evenly py-2 text-[10px] font-medium text-muted-foreground">
          <span>
            <FormattedMessage {...messages.completedHandle} />
          </span>

          <span className="flex items-center gap-1">
            <FormattedMessage {...messages.timedOutHandle} />
            {data.hideAddAction ? null : (
              <VisualWorkflowQuickAddButton
                className="pointer-events-auto size-5"
                handleId="timed_out"
                label={intl.formatMessage(messages.addNodeFromHandle, {
                  handle: intl.formatMessage(messages.timedOutHandle),
                })}
                onAdd={addFromHandle}
              />
            )}
          </span>
          <span className="flex items-center gap-1 text-destructive">
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
          </span>
        </div>
      ) : null}
      {data.catalogType === "logic.try_catch" ? (
        <div className="pointer-events-none absolute top-0 h-(--execution-zone) right-[-5.5rem] flex flex-col justify-evenly py-2 text-[10px] font-medium text-muted-foreground">
          {[
            { id: "try", message: messages.tryHandle, destructive: false },
            { id: "success", message: messages.successHandle, destructive: false },
            { id: "catch", message: messages.catchHandle, destructive: true },
            { id: "finally", message: messages.finallyHandle, destructive: false },
          ].map((handle) => (
            <span
              className={cn("flex items-center gap-1", handle.destructive && "text-destructive")}
              key={handle.id}
            >
              <FormattedMessage {...handle.message} />
              {data.hideAddAction ? null : (
                <VisualWorkflowQuickAddButton
                  className="pointer-events-auto size-5"
                  handleId={handle.id}
                  label={intl.formatMessage(messages.addNodeFromHandle, {
                    handle: intl.formatMessage(handle.message),
                  })}
                  onAdd={addFromHandle}
                />
              )}
            </span>
          ))}
        </div>
      ) : null}
      {data.runStatus && data.runStatus !== "idle" ? (
        <p className="mt-2 text-center text-xs text-muted-foreground" role="status">
          {intl.formatMessage(nodeStatusMessages[data.runStatus])}
        </p>
      ) : null}
      {isSwitch ? (
        <div className="pointer-events-none absolute top-0 h-(--execution-zone) right-[-4.5rem] flex flex-col justify-evenly py-2 text-[10px] font-medium text-muted-foreground">
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

      {data.config.kind === "logic.sequence" ? (
        <div className="pointer-events-none absolute top-0 h-(--execution-zone) right-[-7rem] flex flex-col justify-evenly py-2 text-[10px] font-medium text-muted-foreground">
          {sequenceOutputs.map((output) => (
            <span key={output.id} className="flex items-center gap-1">
              {output.label}
              {data.hideAddAction || output.id === primaryHandle ? null : (
                <VisualWorkflowQuickAddButton
                  className="pointer-events-auto size-5"
                  handleId={output.id}
                  label={intl.formatMessage(messages.addNodeFromHandle, {
                    handle: output.label,
                  })}
                  onAdd={addFromHandle}
                />
              )}
            </span>
          ))}
        </div>
      ) : null}

      {showErrorHandle &&
      !isIf &&
      !isSwitch &&
      data.catalogType !== "logic.retry" &&
      data.catalogType !== "flow.wait" ? (
        <div
          className="pointer-events-none absolute right-[-4.5rem] flex items-center gap-1 text-[10px] font-medium text-destructive"
          style={executionTop(hasDataPorts ? 0.78 : 0.72)}
        >
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

      {data.hideAddAction ||
      isTerminal ||
      data.catalogType === "logic.try_catch" ||
      (data.config.kind === "logic.sequence" && sequenceOutputs.length === 0) ? null : (
        <VisualWorkflowQuickAddButton
          className={cn(
            "absolute -right-3 -translate-y-1/2",
            hasDataPorts && hasSingleExecutionOutput ? "top-16" : "top-1/2",
          )}
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
    case "action.content_sync":
      return messages.nodeContentSync;
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
    case "flow.wait":
      return messages.nodeWait;
    case "flow.stop":
      return messages.nodeStop;
    case "flow.return":
      return messages.nodeReturn;
    case "flow.fail":
      return messages.nodeFail;
    case "logic.merge":
      return messages.nodeMerge;
    case "logic.sequence":
      return messages.nodeSequence;
    case "logic.try_catch":
      return messages.nodeTryCatch;
  }
}
