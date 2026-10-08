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
import { assertNever } from "@/lib/primitives/assert-never/assert-never";

import { hasWorkspaceAutomationScheduledWorkflow } from "./workspace-automation-scheduled-workflow";
import { listWorkspaceAutomationSetupFieldOwners } from "./workspace-automation-skill-form";
import {
  listMissingWorkspaceAutomationSkillIntegrations,
  resolveWorkspaceAutomationSkills,
  type WorkspaceAutomationSkillConnections,
  type WorkspaceAutomationSkillIntegration,
} from "./workspace-automation-skills";
import {
  formStateToWorkspaceAutomationPayload,
  validateWorkspaceAutomationFormState,
  type WorkspaceAutomationFieldErrors,
  type WorkspaceAutomationFormState,
} from "./workspace-automation-view-model";

export type WorkspaceAutomationSetupStepField = keyof WorkspaceAutomationFieldErrors;

/** One thing left to do before the automation can be saved and can run. */
export type WorkspaceAutomationSetupStep =
  | { kind: "connect"; integration: WorkspaceAutomationSkillIntegration }
  | {
      kind: "field";
      field: WorkspaceAutomationSetupStepField;
      message: string;
      /** Attached skills whose tools own the field. Absent for a field of the setup as a whole. */
      skillIds?: string[];
    }
  | { kind: "repository_for_github_trigger" }
  /** Advice only: the setup can be saved, but its runs would have nothing to send. */
  | { kind: "nothing_to_deliver" };

export const WORKSPACE_AUTOMATION_INTEGRATION_NAMES: Record<
  WorkspaceAutomationSkillIntegration,
  string
> = {
  github: "GitHub",
  crowdin: "Crowdin",
  contentful: "Contentful",
  intercom: "Intercom",
  slack: "Slack",
  email: "an email provider (Resend or SendGrid)",
};

/**
 * What the setup still needs, in the order to deal with it: integrations to connect, then what
 * the editor's own validation reports. A connection status that is not known adds no step.
 */
export function listWorkspaceAutomationSetupSteps(input: {
  form: WorkspaceAutomationFormState;
  connections?: WorkspaceAutomationSkillConnections;
}): WorkspaceAutomationSetupStep[] {
  const { form } = input;
  const steps: WorkspaceAutomationSetupStep[] = [];

  const missingIntegrations = new Set(
    resolveWorkspaceAutomationSkills(form.skillIds).flatMap((skill) =>
      listMissingWorkspaceAutomationSkillIntegrations(skill, input.connections ?? {}),
    ),
  );
  for (const integration of missingIntegrations) {
    steps.push({ kind: "connect", integration });
  }

  const errors = validateWorkspaceAutomationFormState(form);
  for (const [key, message] of Object.entries(errors)) {
    if (!message) {
      continue;
    }
    const field = key as WorkspaceAutomationSetupStepField;
    const skillIds = listWorkspaceAutomationSetupFieldOwners(form.skillIds, field);
    steps.push({ kind: "field", field, message, ...(skillIds.length > 0 ? { skillIds } : {}) });
  }

  // GitHub events are matched to an automation by its repository, which only a GitHub tool sets.
  if (
    form.kind !== "content_sync" &&
    form.triggerMode === "github" &&
    !form.githubEnabled &&
    !form.githubCommentEnabled
  ) {
    steps.push({ kind: "repository_for_github_trigger" });
  }

  if (hasNothingToDeliver(form)) {
    steps.push({ kind: "nothing_to_deliver" });
  }

  return steps;
}

/**
 * Every attached skill only sends results out, nothing produces any, and there are no
 * instructions to act on. A schedule in this state is refused by the editor's own validation.
 */
function hasNothingToDeliver(form: WorkspaceAutomationFormState): boolean {
  if (form.kind === "content_sync" || form.triggerMode === "scheduled") {
    return false;
  }
  const attached = resolveWorkspaceAutomationSkills(form.skillIds);
  if (attached.length === 0 || form.instructions.trim()) {
    return false;
  }
  if (attached.some((skill) => skill.category !== "report")) {
    return false;
  }
  const payload = formStateToWorkspaceAutomationPayload(form);
  return (
    payload.kind !== "content_sync" && !hasWorkspaceAutomationScheduledWorkflow(payload.toolConfig)
  );
}

/** Plain English for a step, for readers who do not see the editor's field messages. */
export function describeWorkspaceAutomationSetupStep(step: WorkspaceAutomationSetupStep): string {
  switch (step.kind) {
    case "connect":
      return `Connect ${WORKSPACE_AUTOMATION_INTEGRATION_NAMES[step.integration]} in Integrations.`;
    case "field":
      return step.message;
    case "repository_for_github_trigger":
      return "Add a skill that reads the repository or comments on pull requests. A GitHub trigger does not run without one.";
    case "nothing_to_deliver":
      return "Nothing produces a result to send yet. Add a skill that reviews, summarises or researches something, or write instructions.";
    default:
      return assertNever(step);
  }
}
