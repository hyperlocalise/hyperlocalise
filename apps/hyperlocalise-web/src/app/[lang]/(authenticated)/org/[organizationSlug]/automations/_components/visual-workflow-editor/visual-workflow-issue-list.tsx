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
import { CaretLeftIcon, CaretRightIcon, CrosshairSimpleIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { FormattedMessage, useIntl, type IntlShape } from "react-intl";

import { Button } from "@/components/ui/button";
import type {
  VisualWorkflowRfNode,
  VisualWorkflowValidationIssue,
} from "@/lib/visual-workflows/schema/types";
import type { VisualWorkflowV3ValidationIssue } from "@/lib/visual-workflows/validation/validate-workflow-v3";

import { visualWorkflowEditorMessages as messages } from "./visual-workflow-editor.messages";
import { visualWorkflowNodeTitleMessage } from "./visual-workflow-node-picker";

type VisualWorkflowIssue = VisualWorkflowValidationIssue | VisualWorkflowV3ValidationIssue;

/** One place the pager stops at: a step with everything wrong with it, or one issue about no step. */
type IssueStop = {
  key: string;
  node: VisualWorkflowRfNode | null;
  issues: VisualWorkflowIssue[];
};

function issueKey(issue: VisualWorkflowIssue) {
  return `${issue.code}-${issue.nodeId ?? issue.edgeId ?? "all"}-${issue.field ?? ""}-${issue.reason ?? ""}`;
}

function stopKeyForNode(nodeId: string) {
  return `step-${nodeId}`;
}

function listIssueStops(
  issues: readonly VisualWorkflowIssue[],
  nodes: readonly VisualWorkflowRfNode[],
): IssueStop[] {
  const stops = new Map<string, IssueStop>();
  // The validators can report one problem with one step more than once.
  for (const issue of new Map(issues.map((entry) => [issueKey(entry), entry])).values()) {
    const node = issue.nodeId ? nodes.find((entry) => entry.id === issue.nodeId) : undefined;
    const key = node ? stopKeyForNode(node.id) : issueKey(issue);
    const stop = stops.get(key) ?? { key, node: node ?? null, issues: [] };
    stop.issues.push(issue);
    stops.set(key, stop);
  }
  return [...stops.values()];
}

function issueText(intl: IntlShape, issue: VisualWorkflowIssue) {
  if (issue.reason === "literal_credential") {
    return intl.formatMessage(messages.issueLiteralCredential);
  }
  if (issue.field && issue.reason === "required") {
    return intl.formatMessage(messages.issueFieldRequired, { field: issue.field });
  }
  if (issue.field && issue.reason === "invalid") {
    return intl.formatMessage(messages.issueFieldInvalid, { field: issue.field });
  }
  return intl.formatMessage(issueMessage(issue.code));
}

/**
 * What stops the workflow from being published, one step at a time: the step's name with what is
 * wrong with it and, where the validator knows it, the setting at fault. With more than one stop,
 * arrows move between them and select the step they land on; when `onSelectNode` is given, the
 * stop itself is a button that selects its step, and when `onShowNode` is given a button beside it
 * brings the step into view on the canvas.
 */
export function VisualWorkflowIssueList({
  issues,
  nodes,
  selectedNodeId,
  onSelectNode,
  onShowNode,
}: {
  issues: readonly VisualWorkflowIssue[];
  nodes: readonly VisualWorkflowRfNode[];
  /** The step whose settings are open, which the pager starts at and follows. */
  selectedNodeId?: string | null;
  onSelectNode?: (nodeId: string) => void;
  onShowNode?: (nodeId: string) => void;
}) {
  const intl = useIntl();
  const stops = listIssueStops(issues, nodes);
  const selectedStopKey = selectedNodeId ? stopKeyForNode(selectedNodeId) : null;
  // The stop by its key, and its place for when a fix takes that stop away.
  const [position, setPosition] = useState({ key: selectedStopKey, index: 0 });
  const [followedNodeId, setFollowedNodeId] = useState(selectedNodeId);
  if (followedNodeId !== selectedNodeId) {
    setFollowedNodeId(selectedNodeId);
    const index = stops.findIndex((stop) => stop.key === selectedStopKey);
    if (index >= 0) {
      setPosition({ key: selectedStopKey, index });
    }
  }

  if (stops.length === 0) {
    return null;
  }

  const found = stops.findIndex((stop) => stop.key === position.key);
  const index = found >= 0 ? found : Math.min(position.index, stops.length - 1);
  const stop = stops[index]!;
  const go = (offset: number) => {
    const nextIndex = (index + offset + stops.length) % stops.length;
    const next = stops[nextIndex]!;
    setPosition({ key: next.key, index: nextIndex });
    if (next.node) {
      onSelectNode?.(next.node.id);
    }
  };
  const node = stop.node;
  const lines = stop.issues.map((issue) => (
    <span key={issueKey(issue)}>{issueText(intl, issue)}</span>
  ));

  return (
    <div
      data-testid="visual-workflow-validation-issues"
      className="border-t border-border px-4 py-3 text-sm text-destructive"
    >
      {stops.length > 1 ? (
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="text-xs font-medium">
            <FormattedMessage
              {...messages.issuePosition}
              values={{ current: index + 1, total: stops.length }}
            />
          </span>
          <span className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={intl.formatMessage(messages.previousIssue)}
              onClick={() => go(-1)}
            >
              <CaretLeftIcon />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={intl.formatMessage(messages.nextIssue)}
              onClick={() => go(1)}
            >
              <CaretRightIcon />
            </Button>
          </span>
        </div>
      ) : null}
      {!node ? (
        <p className="flex flex-col">{lines}</p>
      ) : (
        <div className="flex items-start gap-1">
          {onSelectNode ? (
            <button
              type="button"
              className="-ms-2 flex min-w-0 flex-1 flex-col rounded-lg border border-transparent px-2 py-1 text-left hover:border-destructive/30 hover:bg-destructive/5"
              onClick={() => onSelectNode(node.id)}
            >
              <span className="font-medium">
                {intl.formatMessage(visualWorkflowNodeTitleMessage(node.data.catalogType))}
              </span>
              {lines}
            </button>
          ) : (
            <p className="flex min-w-0 flex-1 flex-col py-1">
              <span className="font-medium">
                {intl.formatMessage(visualWorkflowNodeTitleMessage(node.data.catalogType))}
              </span>
              {lines}
            </p>
          )}
          {onShowNode ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="mt-1"
              aria-label={intl.formatMessage(messages.showStepOnCanvas)}
              title={intl.formatMessage(messages.showStepOnCanvas)}
              onClick={() => onShowNode(node.id)}
            >
              <CrosshairSimpleIcon />
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}

function issueMessage(code: VisualWorkflowIssue["code"]) {
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
    case "nested_retry":
      return messages.nestedRetry;
    case "invalid_retry":
      return messages.invalidRetry;
    case "retry_foreach_nesting":
      return messages.retryForEachNesting;
    case "non_idempotent_retry":
      return messages.nonIdempotentRetry;
    case "invalid_retry_policy":
      return messages.invalidRetryPolicy;
    case "invalid_try_catch_region":
      return messages.invalidTryCatchRegion;
    case "overlapping_try_catch_region":
      return messages.overlappingTryCatchRegion;
    default:
      return messages.invalidNodeConfig;
  }
}
