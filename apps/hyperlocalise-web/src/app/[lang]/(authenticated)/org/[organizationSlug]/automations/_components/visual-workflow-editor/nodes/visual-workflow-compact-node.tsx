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
import { WarningCircleIcon } from "@phosphor-icons/react";
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
import {
  getVisualWorkflowDataPorts,
  type VisualWorkflowDataPort,
} from "@/lib/visual-workflows/editor/visual-workflow-data-ports";
import { isExecutionHandleConnected } from "@/lib/visual-workflows/editor/visual-workflow-execution-ports";
import { nodeSupportsErrorBranch } from "@/lib/visual-workflows/runtime/node-options";
import type {
  VisualWorkflowRfEdge,
  VisualWorkflowRfNode,
} from "@/lib/visual-workflows/schema/types";
import { cn } from "@/lib/primitives/cn";

import { useVisualWorkflowCanvasActions } from "../visual-workflow-canvas-actions";
import { visualWorkflowEditorMessages as messages } from "../visual-workflow-editor.messages";
import { VisualWorkflowQuickAddButton } from "./visual-workflow-quick-add-button";
import { createElement, Fragment, type ComponentProps, type CSSProperties } from "react";

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
// thing to grab; its shape is a glyph inside it, drawn in the handle's text colour.
const HANDLE_CLASS = cn(
  "group/handle size-2.5! border-0! bg-transparent!",
  "transition-colors duration-100 motion-reduce:transition-none",
  // A target larger than the glyph, so it can be grabbed without aiming.
  "after:absolute after:-inset-[7px] after:rounded-full after:content-['']",
  // Where a connection being dragged would land: green once it is one the canvas allows.
  "[&.connectingto.valid]:text-emerald-500",
);

// The glyph grows by its width and height, not by a scale. While a scale animates, the browser
// draws the glyph and everything painted over it in layers of their own, snapped to whole pixels,
// and on a canvas that sits at a fraction of a pixel the rest of the step visibly jumps.
const HANDLE_GLYPH_CLASS = cn(
  // The pointer has to reach the handle itself, which is what React Flow looks for under it.
  "pointer-events-none absolute top-1/2 left-1/2 size-(--handle-glyph) -translate-1/2 overflow-visible",
  // As quick as the app's menus and popovers; its 150ms default reads as slow on a change of size.
  "transition-[width,height] duration-100 motion-reduce:transition-none",
  // Under the pointer, and where a connection being dragged starts from.
  "group-[:not(.connectingto):hover]/handle:size-[calc(var(--handle-glyph)*1.5)]",
  "group-[.connectingfrom]/handle:size-[calc(var(--handle-glyph)*1.5)]",
  // Where a connection being dragged would land: dimmed until it is one the canvas allows.
  "group-[.connectingto]/handle:size-[calc(var(--handle-glyph)*1.25)]",
  "group-[.connectingto]/handle:opacity-30 group-[.connectingto.valid]/handle:opacity-100",
);

// The app's primary, destructive and muted colours are far heavier than the data ports' type
// colours. Mixed with the background they sit at the same strength, and stay opaque, so neither
// the card's border nor a step's glow shows through.
const EXECUTION_GLYPH_TONE_CLASS =
  "text-[color:color-mix(in_oklab,currentColor_60%,var(--background))]";

/**
 * The shape inside a handle: hollow until a wire is attached to the handle, then filled. Its
 * outline and fill are the handle's text colour, so a tone class and the drag feedback reach both.
 */
function HandleGlyph({
  shape,
  connected,
  className,
}: {
  shape: "arrow" | "dot";
  connected: boolean;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={cn(HANDLE_GLYPH_CLASS, className)}
      fill={connected ? "currentColor" : "var(--card)"}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinejoin="round"
      aria-hidden
    >
      {shape === "arrow" ? (
        <path d="M3.5 2.5 13.5 8 3.5 13.5Z" />
      ) : (
        <circle cx="8" cy="8" r="5.5" />
      )}
    </svg>
  );
}

type WorkflowHandleProps = ComponentProps<typeof Handle> & {
  /** Whether a wire is attached. Tests read it from `data-connected`. */
  connected: boolean;
};

/**
 * Where the workflow runs into or out of a step: an arrow pointing the way it runs, so it cannot
 * be taken for a data port. `className` sets its place and, with a text colour, its tone.
 */
function ExecutionHandle({ className, connected, ...props }: WorkflowHandleProps) {
  return (
    <Handle
      {...props}
      data-connected={connected ? "" : undefined}
      className={cn(HANDLE_CLASS, "text-primary", className)}
    >
      <HandleGlyph
        shape="arrow"
        connected={connected}
        className={cn(EXECUTION_GLYPH_TONE_CLASS, "[--handle-glyph:14px]")}
      />
    </Handle>
  );
}

/** Where a value enters or leaves a step: a round dot, in its type's colour through `className`. */
function DataHandle({ className, connected, ...props }: WorkflowHandleProps) {
  return (
    <Handle
      {...props}
      data-connected={connected ? "" : undefined}
      className={cn(HANDLE_CLASS, className)}
    >
      <HandleGlyph shape="dot" connected={connected} className="[--handle-glyph:12px]" />
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

// A step's execution handles and their labels are placed down its top part, above its data ports,
// so the two kinds of handle never land on one spot of the card's edge. Without data ports that
// part is the whole card.
const EXECUTION_ZONE_VARIABLE = "--execution-zone";
// The card's padding, the icon, title and subtitle, and the gap above the data ports.
const EXECUTION_ZONE_MIN_HEIGHT = 104;
const EXECUTION_ZONE_INSET = 24;
const EXECUTION_HANDLE_PITCH = 24;
// The row of the execution input and the main output on a step with data ports: beside the title,
// clear of the data ports below.
const EXECUTION_MAIN_ROW_TOP = 64;
// The rows start below the marks in the card's top corners, so the first label never runs under
// the issue mark.
const EXECUTION_ZONE_TOP_INSET = 12;

function executionTop(fraction: number): CSSProperties {
  return {
    top: `calc(${EXECUTION_ZONE_TOP_INSET}px + (var(${EXECUTION_ZONE_VARIABLE}) - ${EXECUTION_ZONE_TOP_INSET}px) * ${fraction})`,
  };
}

/** Where `count` handles go when spread evenly down the execution zone. */
function spreadTop(index: number, count: number): CSSProperties {
  return executionTop((index + 1) / (count + 1));
}

const TRY_CATCH_HANDLES = [
  { id: "try", ariaLabel: "Try", message: messages.tryHandle },
  { id: "success", ariaLabel: "Success", message: messages.successHandle },
  { id: "catch", ariaLabel: "Catch", message: messages.catchHandle, className: "text-destructive" },
  {
    id: "finally",
    ariaLabel: "Finally",
    message: messages.finallyHandle,
    className: "text-muted-foreground",
  },
];

/** One way the workflow can leave a step, as drawn on the card's right edge. */
type ExecutionOutput = {
  id: string;
  /** Shown inside the card beside the handle. The main output of an ordinary step has none. */
  label: string | null;
  ariaLabel: string | undefined;
  /** Its row, from the top of the execution zone. React Flow's own middle when absent. */
  top: CSSProperties | undefined;
  /** A text colour for the handle and its label. */
  className?: string;
};

// A port's row starts inside the card's padding. This puts its dot on the card's edge, where the
// execution handles are, and clear of the port's name and type.
const DATA_PORT_EDGE_CLASS = { input: "-left-3!", output: "-right-3!" };

// A label beside an execution handle, inside the card at the handle's row.
const EXECUTION_LABEL_CLASS =
  "pointer-events-none absolute flex -translate-y-1/2 items-center gap-1 text-[10px] font-medium text-muted-foreground";

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
          connected={connected}
          className={cn(DATA_PORT_EDGE_CLASS.input, DATA_TYPE_CLASS[port.type])}
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
          connected={connected}
          className={cn(DATA_PORT_EDGE_CLASS.output, DATA_TYPE_CLASS[port.type])}
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
  const isTerminal = ["flow.stop", "flow.return", "flow.fail"].includes(data.catalogType);
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
  const title = intl.formatMessage(titleMessage(data.catalogType));
  const subtitle = data.previewSubtitle ?? resolveNodeSubtitle(data.config);

  const mergeInputs = data.config.kind === "logic.merge" ? data.config.inputs : [];
  const outputs: ExecutionOutput[] = (() => {
    if (isTerminal) {
      return [];
    }
    if (data.config.kind === "logic.sequence") {
      const { outputs } = data.config;
      return outputs.map((output, index) => ({
        id: output.id,
        label: output.label,
        ariaLabel: `Sequence output: ${output.label}`,
        top: spreadTop(index, outputs.length),
      }));
    }
    if (data.config.kind === "logic.switch") {
      const handles = [
        ...data.config.cases.map((caseEntry, index) => ({
          id: caseEntry.id,
          label: intl.formatMessage(messages.switchCaseHandle, { index: index + 1 }),
        })),
        { id: "default", label: intl.formatMessage(messages.switchDefaultHandle) },
      ];
      return handles.map((handle, index) => ({
        ...handle,
        ariaLabel: handle.label,
        top: spreadTop(index, handles.length),
        className: handle.id === "default" ? "text-muted-foreground" : undefined,
      }));
    }
    if (data.catalogType === "logic.if") {
      return [
        {
          id: "true",
          label: intl.formatMessage(messages.trueHandle),
          ariaLabel: "true",
          top: executionTop(0.35),
        },
        {
          id: "false",
          label: intl.formatMessage(messages.falseHandle),
          ariaLabel: "false",
          top: executionTop(0.65),
          className: "text-muted-foreground",
        },
      ];
    }
    if (data.catalogType === "logic.for_each") {
      return [
        {
          id: "each",
          label: intl.formatMessage(messages.eachHandle),
          ariaLabel: "Each item",
          top: executionTop(0.35),
        },
        {
          id: "done",
          label: intl.formatMessage(messages.doneHandle),
          ariaLabel: "Done",
          top: executionTop(0.65),
        },
      ];
    }
    if (data.catalogType === "logic.retry") {
      return [
        {
          id: "attempt",
          label: intl.formatMessage(messages.attemptHandle),
          ariaLabel: "Attempt",
          top: spreadTop(0, 3),
        },
        {
          id: "succeeded",
          label: intl.formatMessage(messages.succeededHandle),
          ariaLabel: "Succeeded",
          top: spreadTop(1, 3),
        },
        {
          id: "exhausted",
          label: intl.formatMessage(messages.exhaustedHandle),
          ariaLabel: "Exhausted",
          top: spreadTop(2, 3),
          className: "text-muted-foreground",
        },
      ];
    }
    if (data.catalogType === "flow.wait" || data.catalogType === "logic.merge") {
      return [
        {
          id: "completed",
          label: intl.formatMessage(messages.completedHandle),
          ariaLabel: "Completed",
          top: spreadTop(0, 3),
        },
        {
          id: "timed_out",
          label: intl.formatMessage(messages.timedOutHandle),
          ariaLabel: "Timed out",
          top: spreadTop(1, 3),
          className: "text-muted-foreground",
        },
        {
          id: "error",
          label: intl.formatMessage(messages.errorHandle),
          ariaLabel: "Error",
          top: spreadTop(2, 3),
          className: "text-destructive",
        },
      ];
    }
    if (data.catalogType === "logic.try_catch") {
      return TRY_CATCH_HANDLES.map((handle, index) => ({
        id: handle.id,
        label: intl.formatMessage(handle.message),
        ariaLabel: handle.ariaLabel,
        top: spreadTop(index, TRY_CATCH_HANDLES.length),
        className: handle.className,
      }));
    }
    return [
      {
        id: "success",
        label: null,
        ariaLabel: "Execution success",
        top: hasDataPorts ? { top: EXECUTION_MAIN_ROW_TOP } : undefined,
      },
      ...(nodeSupportsErrorBranch(data.config)
        ? [
            {
              id: "error",
              label: intl.formatMessage(messages.errorHandle),
              ariaLabel: undefined,
              top: executionTop(hasDataPorts ? 0.88 : 0.75),
              className: "text-destructive",
            },
          ]
        : []),
    ];
  })();
  const showAddButtons = !data.hideAddAction && outputs.length > 0;
  const hasOutputLabels = outputs.some((output) => output.label !== null);

  const addFromHandle = (handleId?: string) => {
    onAddFromNode({
      nodeId: id,
      handleId,
    });
  };

  // The most handles that are spread evenly down one side of the step.
  const spreadExecutionHandleCount = Math.max(
    mergeInputs.length,
    data.config.kind === "logic.sequence" || data.config.kind === "logic.switch"
      ? outputs.length
      : 0,
    data.catalogType === "logic.try_catch" ? TRY_CATCH_HANDLES.length : 0,
  );
  const executionZoneHeight = hasDataPorts
    ? Math.max(EXECUTION_ZONE_MIN_HEIGHT, (spreadExecutionHandleCount + 1) * EXECUTION_HANDLE_PITCH)
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
          <Fragment key={input.id}>
            <ExecutionHandle
              id={input.id}
              position={Position.Left}
              type="target"
              aria-label={`Merge input: ${input.name}`}
              style={spreadTop(index, mergeInputs.length)}
              connected={isExecutionHandleConnected(edges, id, "target", input.id)}
            />
            <div
              className={cn(EXECUTION_LABEL_CLASS, "left-3")}
              style={spreadTop(index, mergeInputs.length)}
            >
              <span className="max-w-14 truncate">{input.name}</span>
            </div>
          </Fragment>
        ))
      ) : (
        <ExecutionHandle
          id="input"
          style={hasDataPorts ? { top: EXECUTION_MAIN_ROW_TOP } : undefined}
          position={Position.Left}
          type="target"
          aria-label="Execution input"
          connected={isExecutionHandleConnected(edges, id, "target", "input")}
        />
      )}
      {outputs.map((output) => (
        <Fragment key={output.id}>
          <ExecutionHandle
            id={output.id}
            position={Position.Right}
            type="source"
            aria-label={output.ariaLabel}
            className={output.className}
            style={output.top}
            connected={isExecutionHandleConnected(edges, id, "source", output.id)}
          />
          {output.label !== null || showAddButtons ? (
            <div
              className={cn(EXECUTION_LABEL_CLASS, "right-3", output.className)}
              style={output.top ?? { top: "50%" }}
            >
              {showAddButtons ? (
                <VisualWorkflowQuickAddButton
                  className="pointer-events-auto size-5"
                  handleId={output.id}
                  label={
                    output.label === null
                      ? intl.formatMessage(messages.addNode)
                      : intl.formatMessage(messages.addNodeFromHandle, { handle: output.label })
                  }
                  onAdd={addFromHandle}
                />
              ) : null}
              {output.label !== null ? (
                <span className="max-w-16 truncate">{output.label}</span>
              ) : null}
            </div>
          ) : null}
        </Fragment>
      ))}

      <div
        className={cn(
          "flex min-w-0 flex-col items-center justify-center gap-1.5 pt-1 text-center",
          // Clear of the handle labels, which sit inside the card's sides.
          mergeInputs.length > 0 ? "pl-14" : null,
          hasOutputLabels ? "pr-20" : showAddButtons ? "pr-7" : null,
        )}
        style={
          executionZoneHeight
            ? { minHeight: executionZoneHeight - EXECUTION_ZONE_INSET }
            : undefined
        }
      >
        {createElement(catalog.icon, { className: "size-7 text-foreground" })}
        <p className="max-w-full truncate text-sm font-medium text-foreground" title={title}>
          {title}
        </p>
        <p className="max-w-full truncate text-xs text-muted-foreground" title={subtitle}>
          {subtitle}
        </p>
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
      {data.runStatus && data.runStatus !== "idle" ? (
        <p className="mt-2 text-center text-xs text-muted-foreground" role="status">
          {intl.formatMessage(nodeStatusMessages[data.runStatus])}
        </p>
      ) : null}

      {data.lastOutput && Object.keys(data.lastOutput).length > 0 ? (
        <div className="mt-2 max-h-16 overflow-hidden border-t border-border pt-2 text-left text-[10px] text-muted-foreground">
          <p className="line-clamp-3 font-mono break-all">{JSON.stringify(data.lastOutput)}</p>
        </div>
      ) : null}
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
