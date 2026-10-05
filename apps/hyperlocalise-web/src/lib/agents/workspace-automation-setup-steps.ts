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

import {
  listMissingWorkspaceAutomationSkillIntegrations,
  resolveWorkspaceAutomationSkills,
  type WorkspaceAutomationSkillConnections,
  type WorkspaceAutomationSkillIntegration,
} from "./workspace-automation-skills";
import {
  validateWorkspaceAutomationFormState,
  type WorkspaceAutomationFieldErrors,
  type WorkspaceAutomationFormState,
} from "./workspace-automation-view-model";

export type WorkspaceAutomationSetupStepField = keyof WorkspaceAutomationFieldErrors;

/** One thing left to do before the automation can be saved and can run. */
export type WorkspaceAutomationSetupStep =
  | { kind: "connect"; integration: WorkspaceAutomationSkillIntegration }
  | { kind: "field"; field: WorkspaceAutomationSetupStepField; message: string }
  | { kind: "repository_for_github_trigger" };

const INTEGRATION_NAMES: Record<WorkspaceAutomationSkillIntegration, string> = {
  github: "GitHub",
  crowdin: "Crowdin",
  contentful: "Contentful",
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
  for (const [field, message] of Object.entries(errors)) {
    if (message) {
      steps.push({ kind: "field", field: field as WorkspaceAutomationSetupStepField, message });
    }
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

  return steps;
}

/** Plain English for a step, for readers who do not see the editor's field messages. */
export function describeWorkspaceAutomationSetupStep(step: WorkspaceAutomationSetupStep): string {
  switch (step.kind) {
    case "connect":
      return `Connect ${INTEGRATION_NAMES[step.integration]} in Integrations.`;
    case "field":
      return step.message;
    case "repository_for_github_trigger":
      return "Add a skill that reads the repository or comments on pull requests. A GitHub trigger does not run without one.";
    default:
      return assertNever(step);
  }
}
