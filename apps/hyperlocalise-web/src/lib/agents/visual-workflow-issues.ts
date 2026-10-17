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
import { VISUAL_NODE_DESCRIPTIONS } from "@/lib/visual-workflows/catalog/node-descriptions";
import type {
  VisualCatalogType,
  VisualWorkflowV3Definition,
} from "@/lib/visual-workflows/schema/types";
import {
  validateVisualWorkflowV3Definition,
  type VisualWorkflowV3ValidationIssue,
} from "@/lib/visual-workflows/validation/validate-workflow-v3";

const TRIGGER_RULES =
  "A workflow has exactly one trigger, and every other step must be reached from it through connections.";
const ENDING_RULES = "It ends the workflow, so nothing can follow it.";

/**
 * What a step of each type needs of the steps and connections around it, which its settings do
 * not show. Types not listed have no such rules.
 */
export const VISUAL_WORKFLOW_STEP_RULES: Partial<Record<VisualCatalogType, string>> = {
  "trigger.manual": TRIGGER_RULES,
  "trigger.scheduled": TRIGGER_RULES,
  "trigger.github": TRIGGER_RULES,
  "trigger.source_upload": TRIGGER_RULES,
  "logic.for_each":
    "At least one step must be connected to Each item. Those steps run once per item and connect only to each other: none of them may connect to a step outside the loop. The flow carries on after the loop from Done, which runs once at the end. A Loop cannot sit inside another Loop or a Retry, nor hold a Retry.",
  "logic.retry":
    "At least one step must be connected to Attempt. Those steps are tried again when one of them fails, and connect only to each other. The flow carries on from Succeeded, or from Exhausted when every attempt failed. A Retry cannot sit inside another Retry or a Loop, nor hold a Loop. When the steps it repeats send or change something, the person accepts on the Retry step that a retry may do that twice.",
  "logic.try_catch":
    "At least one step must be connected to Try. Those steps connect only to each other. Catch runs when one of them fails, Success when none does, and Finally after either. The Try steps of two Try / Catch steps may sit one wholly inside the other, never partly.",
  "logic.merge":
    "Its execution inputs are a list, each with its own id that the block gives: connect each incoming path into one of those, not into a plain input.",
  "logic.create_object":
    "Each field is a data input with its own id: connect a value into that field, or set a defaultValue on it. The constructed object is the step's value output.",
  "logic.merge_objects":
    "Each object to merge is a data input with its own id: connect an object into that input. At least two objects are required. Overlapping keys follow conflictPolicy. The merged object is the step's value output.",
  "flow.stop": ENDING_RULES,
  "flow.fail": ENDING_RULES,
  "flow.return": `${ENDING_RULES} Each of its required output fields needs a data connection.`,
  "flow.call_workflow": "Each required input of the called workflow needs a data connection.",
};

type Issue = VisualWorkflowV3ValidationIssue;

/** The steps of a region type, the output that leads into them, and how the type is named. */
const REGIONS = {
  invalid_loop: { type: "logic.for_each", output: "Each item", carriesOn: "Done" },
  invalid_retry: { type: "logic.retry", output: "Attempt", carriesOn: "Succeeded or Exhausted" },
  invalid_try_catch_region: {
    type: "logic.try_catch",
    output: "Try",
    carriesOn: "Success, Catch or Finally",
  },
} as const;

function stepName(definition: VisualWorkflowV3Definition, nodeId: string): string {
  const node = definition.nodes.find((entry) => entry.id === nodeId);
  return node
    ? `${VISUAL_NODE_DESCRIPTIONS[node.type].title} [${node.id}]`
    : `the step [${nodeId}]`;
}

function connectionOf(definition: VisualWorkflowV3Definition, edgeId: string | undefined) {
  const edge = edgeId ? definition.edges.find((entry) => entry.id === edgeId) : undefined;
  if (!edge) return null;
  return {
    name: `the connection from ${stepName(definition, edge.source)} to ${stepName(definition, edge.target)}`,
    from: stepName(definition, edge.source),
    to: stepName(definition, edge.target),
    sourcePort: edge.sourcePortId,
    targetPort: edge.targetPortId,
  };
}

function explainRegionIssue(
  definition: VisualWorkflowV3Definition,
  issue: Issue,
  region: (typeof REGIONS)[keyof typeof REGIONS],
): string {
  const title = VISUAL_NODE_DESCRIPTIONS[region.type].title;
  const connection = connectionOf(definition, issue.edgeId);
  if (connection) {
    return `${connection.name} crosses the edge of a ${title}'s ${region.output} steps. Only the ${title}'s ${region.output} output leads into them, they connect only to each other, and the flow carries on after them from ${region.carriesOn}.`;
  }
  if (!issue.nodeId) {
    return `A ${title}'s ${region.output} steps are not set up as its own.`;
  }
  const node = definition.nodes.find((entry) => entry.id === issue.nodeId);
  if (node?.type === region.type) {
    return `${stepName(definition, issue.nodeId)} has no step connected to its ${region.output} output. A ${title} needs at least one there.`;
  }
  return `${stepName(definition, issue.nodeId)} is one of a ${title}'s ${region.output} steps but is not reached through that output alone, or belongs to another ${title} as well.`;
}

/** One sentence on what an issue means, with the step, setting or connection it is about. */
function explainIssue(definition: VisualWorkflowV3Definition, issue: Issue): string {
  const step = issue.nodeId ? stepName(definition, issue.nodeId) : "a step";
  const setting = issue.field ? `${issue.field} on ${step}` : null;
  const connection = connectionOf(definition, issue.edgeId);
  switch (issue.code) {
    case "missing_trigger":
      return "The workflow has no trigger. It needs exactly one, which starts it.";
    case "multiple_triggers":
      return "The workflow has more than one trigger. It can have only one.";
    case "orphan_node":
      return `${step} cannot be reached from the trigger: no connection leads to it from the trigger, directly or through other steps.`;
    case "invalid_edge":
      return `${connection?.name ?? "A connection"} leads to or from a step that is not in the workflow.`;
    case "invalid_trigger_config":
    case "invalid_node_config":
      if (issue.reason === "literal_credential") {
        return `${step} has a password, token or key typed into its settings. It must sign in with a saved credential instead, which the person picks.`;
      }
      if (setting && issue.reason === "required") {
        return `${setting} is empty and must be set.`;
      }
      if (setting) {
        return `${setting} is not valid.`;
      }
      return `${step}'s settings are not valid.`;
    case "invalid_binding":
      return `${setting ?? step} reads a value that may not be there when it runs: from a step that is not in the workflow or does not always run before it, a step outside the loop it collects from, or a value of the wrong type.`;
    case "invalid_loop":
    case "invalid_retry":
    case "invalid_try_catch_region":
      return explainRegionIssue(definition, issue, REGIONS[issue.code]);
    case "invalid_retry_policy":
      return `${step}'s number of attempts, delay or backoff is out of range.`;
    case "nested_for_each":
      return `${step} is a Loop among another Loop's Each item steps. Loops cannot be nested.`;
    case "nested_retry":
      return `${step} is a Retry among another Retry's Attempt steps. Retries cannot be nested.`;
    case "retry_foreach_nesting":
      return `${step} puts a Loop and a Retry one inside the other, which is not allowed.`;
    case "non_idempotent_retry":
      return `${step} repeats steps that send or change something, so a retry could do it twice. The person accepts that risk on the Retry step.`;
    case "overlapping_try_catch_region":
      return `${step}'s Try steps partly overlap another Try / Catch step's. One must sit wholly inside the other.`;
    case "duplicate_id":
      return `Two steps have the id ${issue.nodeId ?? "of another"}.`;
    case "cycle":
    case "execution_cycle":
      return `The flow goes round in a circle${issue.nodeId ? ` through ${step}` : ""}. A step that repeats goes after a Loop or a Retry instead.`;
    case "invalid_handle":
    case "invalid_source_port":
      return connection
        ? `${connection.name} leaves ${connection.from} from ${connection.sourcePort}, which it does not have.`
        : `A connection leaves ${step} from an output it does not have.`;
    case "invalid_target_port":
      return connection
        ? `${connection.name} goes into ${connection.targetPort} on ${connection.to}, which it does not have.`
        : `A connection goes into an input ${step} does not have.`;
    case "conflicting_data_input":
      return `${connection ? `${connection.targetPort} on ${connection.to}` : `An input of ${step}`} gets a value from more than one place, such as two data connections. It can take one.`;
    case "incompatible_data_types":
      return connection
        ? `${connection.name} carries ${connection.sourcePort}, whose type ${connection.targetPort} does not take.`
        : `A data connection into ${step} carries a value of a type its input does not take.`;
    case "terminal_node_outgoing_edge":
      return `${step} ends the workflow, so nothing can follow it: ${connection?.name ?? "the connection out of it"} must go.`;
    case "missing_required_input":
      return `${setting ?? `An input of ${step}`} needs a data connection.`;
    case "subworkflow_not_found":
      return `${step} calls a workflow that no longer exists.`;
    case "subworkflow_version_not_found":
      return `${step} calls a version of its workflow that does not exist.`;
    case "subworkflow_contract_mismatch":
      return `${step}'s inputs or outputs no longer match those of the workflow it calls.`;
    case "recursive_subworkflow":
      return `${step} calls a workflow that leads back to this one.`;
    case "subworkflow_depth_exceeded":
      return `${step} starts a chain of workflow calls that goes too deep.`;
    default:
      return `An issue of type ${String((issue as { code: unknown }).code)} on ${connection?.name ?? step}. The page lists it; say only that, without guessing its cause.`;
  }
}

/**
 * What stops the workflow from being published, one sentence each, as the canvas lists it but
 * worded for the model: the step, setting or connection at fault and what is wrong with it. An
 * issue the validators report more than once is given once.
 */
export function describeVisualWorkflowIssues(definition: VisualWorkflowV3Definition): string[] {
  const seen = new Set<string>();
  const described: string[] = [];
  for (const issue of validateVisualWorkflowV3Definition(definition)) {
    const key = [issue.code, issue.nodeId, issue.edgeId, issue.field, issue.reason].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    // A sentence may open with a connection's name; a setting's key keeps its case.
    const text = explainIssue(definition, issue);
    described.push(text.startsWith("the ") ? `T${text.slice(1)}` : text);
  }
  return described;
}
