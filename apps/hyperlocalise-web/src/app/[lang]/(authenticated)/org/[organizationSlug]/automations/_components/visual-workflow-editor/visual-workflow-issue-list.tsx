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
import { useIntl } from "react-intl";

import type {
  VisualWorkflowRfNode,
  VisualWorkflowValidationIssue,
} from "@/lib/visual-workflows/schema/types";
import type { VisualWorkflowV3ValidationIssue } from "@/lib/visual-workflows/validation/validate-workflow-v3";

import { visualWorkflowEditorMessages as messages } from "./visual-workflow-editor.messages";
import { visualWorkflowNodeTitleMessage } from "./visual-workflow-node-picker";

type VisualWorkflowIssue = VisualWorkflowValidationIssue | VisualWorkflowV3ValidationIssue;

function issueKey(issue: VisualWorkflowIssue) {
  return `${issue.code}-${issue.nodeId ?? issue.edgeId ?? "all"}-${issue.field ?? ""}-${issue.reason ?? ""}`;
}

/**
 * What stops the workflow from being published. An issue about a step names the step and, where
 * the validator knows it, the setting at fault; when `onSelectNode` is given it is a button that
 * selects the step.
 */
export function VisualWorkflowIssueList({
  issues,
  nodes,
  onSelectNode,
}: {
  issues: readonly VisualWorkflowIssue[];
  nodes: readonly VisualWorkflowRfNode[];
  onSelectNode?: (nodeId: string) => void;
}) {
  const intl = useIntl();
  // The validators can report one problem with one step more than once.
  const lines = [...new Map(issues.map((issue) => [issueKey(issue), issue])).values()];

  if (lines.length === 0) {
    return null;
  }

  return (
    <div
      data-testid="visual-workflow-validation-issues"
      className="border-t border-border px-4 py-3 text-sm text-destructive"
    >
      {lines.map((issue) => {
        const message =
          issue.reason === "literal_credential"
            ? intl.formatMessage(messages.issueLiteralCredential)
            : issue.field && issue.reason === "required"
              ? intl.formatMessage(messages.issueFieldRequired, { field: issue.field })
              : issue.field && issue.reason === "invalid"
                ? intl.formatMessage(messages.issueFieldInvalid, { field: issue.field })
                : intl.formatMessage(issueMessage(issue.code));
        const node = issue.nodeId ? nodes.find((entry) => entry.id === issue.nodeId) : undefined;
        if (!node) {
          return <p key={issueKey(issue)}>{message}</p>;
        }
        const step = (
          <>
            <span className="font-medium">
              {intl.formatMessage(visualWorkflowNodeTitleMessage(node.data.catalogType))}
            </span>
            <span>{message}</span>
          </>
        );
        return onSelectNode ? (
          <button
            key={issueKey(issue)}
            type="button"
            className="-mx-2 flex w-[calc(100%+1rem)] flex-col rounded-lg border border-transparent px-2 py-1 text-left hover:border-destructive/30 hover:bg-destructive/5"
            onClick={() => onSelectNode(node.id)}
          >
            {step}
          </button>
        ) : (
          <p key={issueKey(issue)} className="flex flex-col py-1">
            {step}
          </p>
        );
      })}
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
