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
import { branchMatchesAutomationPatterns } from "@/lib/agents/github/github-repository-automation-settings";

import { isTriggerType } from "../catalog/node-catalog";
import type {
  CanonicalVisualWorkflowNode,
  VisualNodeConfig,
  VisualWorkflowDefinition,
  VisualWorkflowGithubTriggerEvent,
} from "../schema/types";
import type { VisualWorkflowRecord } from "../visual-workflow-types";

export function getVisualWorkflowTriggerNode(
  definition: VisualWorkflowDefinition,
): CanonicalVisualWorkflowNode | null {
  const triggers = definition.nodes.filter((node) => isTriggerType(node.type));
  return triggers.length === 1 ? (triggers[0] ?? null) : null;
}

export function resolveVisualWorkflowGithubEvents(
  events?: readonly VisualWorkflowGithubTriggerEvent[] | null,
): VisualWorkflowGithubTriggerEvent[] {
  if (!events || events.length === 0) {
    return ["push"];
  }
  return [...new Set(events)];
}

export function visualWorkflowGithubEventsInclude(
  events: readonly VisualWorkflowGithubTriggerEvent[] | undefined,
  event: VisualWorkflowGithubTriggerEvent,
): boolean {
  return resolveVisualWorkflowGithubEvents(events).includes(event);
}

export function resolveVisualWorkflowTriggerFingerprint(
  workflow: Pick<VisualWorkflowRecord, "id" | "definition">,
): string | null {
  const trigger = getVisualWorkflowTriggerNode(workflow.definition);
  if (!trigger) {
    return null;
  }

  switch (trigger.config.kind) {
    case "trigger.manual":
      return `manual:${workflow.id}`;
    case "trigger.scheduled":
      return `scheduled:${workflow.id}`;
    case "trigger.github":
      return [
        "github",
        trigger.config.githubInstallationRepositoryId,
        resolveVisualWorkflowGithubEvents(trigger.config.events).join(","),
      ].join(":");
    case "trigger.source_upload":
      return trigger.config.projectId
        ? `source_upload:${workflow.id}:${trigger.config.projectId}`
        : `source_upload:${workflow.id}`;
    default:
      return null;
  }
}

export function visualWorkflowShouldDispatchOnGithubPush(
  workflow: VisualWorkflowRecord,
  input: { githubInstallationRepositoryId: string; branch: string },
): boolean {
  if (workflow.status !== "active") {
    return false;
  }

  const trigger = getVisualWorkflowTriggerNode(workflow.definition);
  if (!trigger || trigger.config.kind !== "trigger.github") {
    return false;
  }

  if (trigger.config.githubInstallationRepositoryId !== input.githubInstallationRepositoryId) {
    return false;
  }

  if (!visualWorkflowGithubEventsInclude(trigger.config.events, "push")) {
    return false;
  }

  return branchMatchesAutomationPatterns(input.branch, trigger.config.branches);
}

export function visualWorkflowShouldDispatchOnGithubPullRequest(
  workflow: VisualWorkflowRecord,
  input: { githubInstallationRepositoryId: string; baseBranch: string },
): boolean {
  if (workflow.status !== "active") {
    return false;
  }

  const trigger = getVisualWorkflowTriggerNode(workflow.definition);
  if (!trigger || trigger.config.kind !== "trigger.github") {
    return false;
  }

  if (trigger.config.githubInstallationRepositoryId !== input.githubInstallationRepositoryId) {
    return false;
  }

  if (!visualWorkflowGithubEventsInclude(trigger.config.events, "pull_request")) {
    return false;
  }

  return branchMatchesAutomationPatterns(input.baseBranch, trigger.config.branches);
}

export function visualWorkflowShouldDispatchOnSourceUpload(
  workflow: VisualWorkflowRecord,
  input: { projectId: string },
): boolean {
  if (workflow.status !== "active") {
    return false;
  }

  const trigger = getVisualWorkflowTriggerNode(workflow.definition);
  if (!trigger || trigger.config.kind !== "trigger.source_upload") {
    return false;
  }

  if (trigger.config.projectId && trigger.config.projectId !== input.projectId) {
    return false;
  }

  return true;
}

export function validateVisualWorkflowTriggerConfig(
  config: VisualNodeConfig,
): { ok: true } | { ok: false; message: string } {
  switch (config.kind) {
    case "trigger.github":
      if (!config.githubInstallationRepositoryId.trim()) {
        return { ok: false, message: "GitHub repository is required." };
      }
      if (config.branches.length === 0) {
        return { ok: false, message: "At least one branch pattern is required." };
      }
      return { ok: true };
    case "trigger.scheduled":
      return { ok: true };
    case "trigger.source_upload":
      return { ok: true };
    case "trigger.manual":
      return { ok: true };
    default:
      return { ok: true };
  }
}

export function validateActiveVisualWorkflowTrigger(
  definition: VisualWorkflowDefinition,
): { ok: true } | { ok: false; message: string } {
  const trigger = getVisualWorkflowTriggerNode(definition);
  if (!trigger) {
    return { ok: false, message: "Workflow must have exactly one trigger node." };
  }

  if (trigger.config.kind === "trigger.manual") {
    return {
      ok: false,
      message:
        "Active workflows require a production trigger (schedule, GitHub, or source upload).",
    };
  }

  const triggerValidation = validateVisualWorkflowTriggerConfig(trigger.config);
  if (!triggerValidation.ok) {
    return triggerValidation;
  }

  return { ok: true };
}
