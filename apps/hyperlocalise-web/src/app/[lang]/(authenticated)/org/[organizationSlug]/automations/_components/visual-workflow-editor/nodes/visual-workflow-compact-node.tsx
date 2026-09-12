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
import { Add01Icon } from "@hugeicons/core-free-icons";
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
import { nodeSupportsErrorBranch } from "@/lib/visual-workflows/runtime/node-options";
import type { VisualWorkflowRfNode } from "@/lib/visual-workflows/schema/types";
import { cn } from "@/lib/primitives/cn";

import { useVisualWorkflowCanvasActions } from "../visual-workflow-canvas-actions";
import { visualWorkflowEditorMessages as messages } from "../visual-workflow-editor.messages";

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
  const title = intl.formatMessage(titleMessage(data.catalogType));
  const subtitle = data.previewSubtitle ?? resolveNodeSubtitle(data.config);

  const switchHandles =
    isSwitch && data.config.kind === "logic.switch"
      ? [
          ...data.config.cases.map((_, index) => ({
            id: String(index),
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
      {isTrigger ? (
        <span
          className="absolute top-2 left-2 text-primary"
          title={intl.formatMessage(messages.triggerBadge)}
        >
          <HugeiconsIcon icon={TRIGGER_BADGE_ICON} className="size-3.5" strokeWidth={2} />
        </span>
      ) : (
        <Handle className={HANDLE_CLASS} position={Position.Left} type="target" />
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
          <Handle className={HANDLE_CLASS} position={Position.Right} type="source" />
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
        <div className="pointer-events-none absolute inset-y-0 right-[-2.4rem] flex flex-col justify-around py-4 text-[10px] font-medium text-muted-foreground">
          <span>
            <FormattedMessage {...messages.trueHandle} />
          </span>
          <span>
            <FormattedMessage {...messages.falseHandle} />
          </span>
        </div>
      ) : null}

      {data.catalogType === "logic.for_each" ? (
        <div className="pointer-events-none absolute inset-y-0 right-[-3.5rem] flex flex-col justify-around py-4 text-[10px] font-medium text-muted-foreground">
          <span>
            <FormattedMessage
              defaultMessage="Each item"
              id="7eZfUxSh+m"
              description="Workflow loop body connection"
            />
          </span>
          <span>
            <FormattedMessage
              defaultMessage="Done"
              id="zZIbqHg71N"
              description="Workflow loop completion connection"
            />
          </span>
        </div>
      ) : null}
      {data.runStatus && data.runStatus !== "idle" ? (
        <p className="mt-2 text-center text-xs text-muted-foreground" role="status">
          {intl.formatMessage(nodeStatusMessages[data.runStatus])}
        </p>
      ) : null}
      {isSwitch ? (
        <div className="pointer-events-none absolute inset-y-0 right-[-2.8rem] flex flex-col justify-evenly py-2 text-[10px] font-medium text-muted-foreground">
          {switchHandles.map((handle) => (
            <span key={handle.id}>{handle.label}</span>
          ))}
        </div>
      ) : null}

      {showErrorHandle && !isIf && !isSwitch ? (
        <div className="pointer-events-none absolute top-[72%] right-[-2.6rem] text-[10px] font-medium text-destructive">
          <FormattedMessage {...messages.errorHandle} />
        </div>
      ) : null}

      {data.lastOutput && Object.keys(data.lastOutput).length > 0 ? (
        <div className="mt-2 max-h-16 overflow-hidden border-t border-border pt-2 text-left text-[10px] text-muted-foreground">
          <p className="line-clamp-3 font-mono break-all">{JSON.stringify(data.lastOutput)}</p>
        </div>
      ) : null}

      {data.hideAddAction ? null : (
        <button
          type="button"
          data-visual-workflow-add=""
          className="nodrag nopan absolute top-1/2 -right-3 z-10 flex size-6 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-sm hover:bg-muted"
          aria-label={intl.formatMessage(messages.addNode)}
          onClick={(event) => {
            event.stopPropagation();
            onAddFromNode({
              nodeId: id,
              handleId: isIf
                ? "true"
                : isSwitch
                  ? "0"
                  : data.catalogType === "logic.for_each"
                    ? "each"
                    : undefined,
            });
          }}
        >
          <HugeiconsIcon icon={Add01Icon} className="size-3.5" strokeWidth={2} />
        </button>
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
  }
}
