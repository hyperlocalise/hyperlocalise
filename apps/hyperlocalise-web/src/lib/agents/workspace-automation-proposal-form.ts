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

import type {
  WorkspaceAutomationProposal,
  WorkspaceAutomationProposalBase,
  WorkspaceAutomationProposalTrigger,
} from "./workspace-automation-proposal";
import {
  listWorkspaceAutomationSetupSteps,
  type WorkspaceAutomationSetupStep,
} from "./workspace-automation-setup-steps";
import {
  addSkillToWorkspaceAutomationForm,
  removeSkillFromWorkspaceAutomationForm,
  type WorkspaceAutomationSkillDefaults,
} from "./workspace-automation-skill-form";
import {
  getWorkspaceAutomationSkill,
  listMissingWorkspaceAutomationSkillIntegrations,
  resolveWorkspaceAutomationSkills,
  workspaceAutomationSkillSupportsTrigger,
  type WorkspaceAutomationSkillConnections,
  type WorkspaceAutomationSkillIntegration,
} from "./workspace-automation-skills";
import {
  DEFAULT_WORKSPACE_AUTOMATION_GITHUB_EVENTS,
  type WorkspaceAutomationGithubTriggerEvent,
} from "./workspace-automation-types";
import type {
  WorkspaceAutomationFormState,
  WorkspaceAutomationTriggerMode,
} from "./workspace-automation-view-model";

const DEFAULT_PUSH_BRANCHES = ["main"];

/** What happened to one skill: in the setup, or asked for and left out with the reason. */
export type WorkspaceAutomationProposalSkillOutcome = {
  id: string;
  name: string;
  state: "added" | "kept" | "needs_connection" | "not_applicable";
  /** Integrations to connect before a `needs_connection` skill can be attached. */
  missingIntegrations?: WorkspaceAutomationSkillIntegration[];
  /** What the skill does that cannot be undone. */
  risk?: string;
};

/** When the setup runs, read from the form after the change. */
export type WorkspaceAutomationTriggerSummary =
  | { mode: Exclude<WorkspaceAutomationTriggerMode, "scheduled" | "github"> }
  | {
      mode: "scheduled";
      cadence: WorkspaceAutomationFormState["scheduledCadence"];
      /** Wall-clock hour in `timeZone`. Absent for an hourly schedule. */
      hour?: number;
      /** 0 is Sunday. Present for a weekly schedule only. */
      dayOfWeek?: number;
      timeZone: string;
    }
  | {
      mode: "github";
      events: WorkspaceAutomationGithubTriggerEvent[];
      branches: string[];
    };

export type WorkspaceAutomationProposalOutcome = {
  /** False when the proposal left the form as it was. */
  changed: boolean;
  name: string;
  trigger: WorkspaceAutomationTriggerSummary;
  /** Every attached skill, then the ones that were asked for and not attached. */
  skills: WorkspaceAutomationProposalSkillOutcome[];
  removedSkills: Array<{ id: string; name: string }>;
  setupSteps: WorkspaceAutomationSetupStep[];
};

/** Content-sync and web-chat automations are set up by hand. */
export function isWorkspaceAutomationAssistantForm(
  form: Pick<WorkspaceAutomationFormState, "kind" | "triggerMode">,
): boolean {
  return form.kind !== "content_sync" && form.triggerMode !== "web_chat";
}

export function toWorkspaceAutomationProposalBase(
  form: Pick<WorkspaceAutomationFormState, "triggerMode" | "skillIds">,
  timeZone: string,
): WorkspaceAutomationProposalBase {
  return { triggerMode: form.triggerMode, skillIds: form.skillIds, timeZone };
}

export function summarizeWorkspaceAutomationFormTrigger(
  form: WorkspaceAutomationFormState,
): WorkspaceAutomationTriggerSummary {
  switch (form.triggerMode) {
    case "scheduled":
      return {
        mode: "scheduled",
        cadence: form.scheduledCadence,
        ...(form.scheduledCadence === "hourly" ? {} : { hour: form.scheduledHourUtc }),
        ...(form.scheduledCadence === "weekly" ? { dayOfWeek: form.scheduledDayOfWeek } : {}),
        timeZone: form.scheduledTimezone.trim() || "UTC",
      };
    case "github":
      return { mode: "github", events: form.githubEvents, branches: form.pushBranches };
    case "manual":
    case "contentful":
    case "source_upload":
    case "web_chat":
      return { mode: form.triggerMode };
    default:
      return assertNever(form.triggerMode);
  }
}

/** Sets the trigger's own fields. Tools are switched on by skills, never from here. */
function applyProposalTrigger(
  form: WorkspaceAutomationFormState,
  trigger: WorkspaceAutomationProposalTrigger,
): WorkspaceAutomationFormState {
  switch (trigger.mode) {
    case "scheduled":
      return {
        ...form,
        triggerMode: "scheduled",
        scheduledCadence: trigger.cadence ?? form.scheduledCadence,
        scheduledHourUtc: trigger.hour ?? form.scheduledHourUtc,
        scheduledDayOfWeek: trigger.dayOfWeek ?? form.scheduledDayOfWeek,
        scheduledTimezone: trigger.timeZone ?? form.scheduledTimezone,
      };
    case "github":
      return {
        ...form,
        triggerMode: "github",
        githubEvents:
          trigger.events ??
          (form.githubEvents.length > 0
            ? form.githubEvents
            : [...DEFAULT_WORKSPACE_AUTOMATION_GITHUB_EVENTS]),
        pushBranches:
          trigger.branches ??
          (form.pushBranches.length > 0 ? form.pushBranches : [...DEFAULT_PUSH_BRANCHES]),
      };
    case "manual":
    case "contentful":
    case "source_upload":
      return { ...form, triggerMode: trigger.mode };
    default:
      return assertNever(trigger);
  }
}

/**
 * Applies a proposal to the form and says what happened. A skill is attached only when it runs on
 * the trigger and none of its integrations is known to be disconnected. Run with the same inputs
 * in the browser and on the server, it gives the same form and the same outcome.
 */
export function applyWorkspaceAutomationProposal(input: {
  form: WorkspaceAutomationFormState;
  proposal: WorkspaceAutomationProposal;
  defaults?: WorkspaceAutomationSkillDefaults;
  connections?: WorkspaceAutomationSkillConnections;
}): { form: WorkspaceAutomationFormState; outcome: WorkspaceAutomationProposalOutcome } {
  const { proposal } = input;
  const connections = input.connections ?? {};
  const available = isWorkspaceAutomationAssistantForm(input.form);
  let form = input.form;
  const removedSkills: Array<{ id: string; name: string }> = [];
  const leftOut: WorkspaceAutomationProposalSkillOutcome[] = [];
  const addedSkillIds = new Set<string>();

  if (available) {
    if (proposal.name !== null) {
      form = { ...form, name: proposal.name };
    }
    if (proposal.instructions !== null) {
      form = { ...form, instructions: proposal.instructions };
    }

    for (const skillId of proposal.removeSkillIds) {
      if (!form.skillIds.includes(skillId)) {
        continue;
      }
      form = removeSkillFromWorkspaceAutomationForm(form, skillId);
      removedSkills.push({
        id: skillId,
        name: getWorkspaceAutomationSkill(skillId)?.name ?? skillId,
      });
    }

    if (proposal.trigger) {
      form = applyProposalTrigger(form, proposal.trigger);
    }

    for (const skillId of proposal.addSkillIds) {
      const skill = getWorkspaceAutomationSkill(skillId);
      if (!skill || form.skillIds.includes(skillId)) {
        continue;
      }
      if (!workspaceAutomationSkillSupportsTrigger(skill, form.triggerMode)) {
        leftOut.push({ id: skill.id, name: skill.name, state: "not_applicable" });
        continue;
      }
      const missingIntegrations = listMissingWorkspaceAutomationSkillIntegrations(
        skill,
        connections,
      );
      if (missingIntegrations.length > 0) {
        leftOut.push({
          id: skill.id,
          name: skill.name,
          state: "needs_connection",
          missingIntegrations,
        });
        continue;
      }
      form = addSkillToWorkspaceAutomationForm(form, skillId, input.defaults);
      addedSkillIds.add(skillId);
    }
  }

  const attached = resolveWorkspaceAutomationSkills(form.skillIds).map(
    (skill): WorkspaceAutomationProposalSkillOutcome => ({
      id: skill.id,
      name: skill.name,
      state: addedSkillIds.has(skill.id) ? "added" : "kept",
      ...(skill.risk ? { risk: skill.risk } : {}),
    }),
  );

  return {
    form,
    outcome: {
      changed: JSON.stringify(form) !== JSON.stringify(input.form),
      name: form.name,
      trigger: summarizeWorkspaceAutomationFormTrigger(form),
      skills: [...attached, ...leftOut],
      removedSkills,
      setupSteps: listWorkspaceAutomationSetupSteps({ form, connections }),
    },
  };
}
