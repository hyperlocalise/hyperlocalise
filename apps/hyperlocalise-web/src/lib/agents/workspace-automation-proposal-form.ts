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
import {
  createDefaultWorkspaceAutomationFormState,
  type WorkspaceAutomationFormState,
  type WorkspaceAutomationTriggerMode,
} from "./workspace-automation-view-model";

const DEFAULT_PUSH_BRANCHES = ["main"];

/** What happened to one skill: in the setup, or left out with the reason. */
export type WorkspaceAutomationProposalSkillOutcome = {
  id: string;
  name: string;
  state: "added" | "kept" | "needs_connection" | "not_applicable";
  /** Integrations to connect before a `needs_connection` skill can be attached. */
  missingIntegrations?: WorkspaceAutomationSkillIntegration[];
  /** What the skill does that cannot be undone. */
  risk?: string;
};

export type WorkspaceAutomationChangeLeftOutReason = "needs_connection" | "wrong_trigger";

/** Something the person set by hand that a change would take away. */
export type WorkspaceAutomationReplacedSetting = "gitlab" | "github_sync" | "other";

export type WorkspaceAutomationChangeReplaces = {
  skills: Array<{ id: string; name: string }>;
  settings: WorkspaceAutomationReplacedSetting[];
};

type WorkspaceAutomationChangeItemState = {
  /** Names the item within its proposal. */
  key: string;
  status: "applied" | "left_out";
  reason?: WorkspaceAutomationChangeLeftOutReason;
  /** What the change took from the person, so the reply can say so. */
  replaces?: WorkspaceAutomationChangeReplaces;
};

/** One thing a proposal changes, as the page lists it. */
export type WorkspaceAutomationChangeItem = WorkspaceAutomationChangeItemState &
  (
    | { kind: "name" | "instructions"; before: string; after: string }
    | {
        kind: "trigger";
        before: WorkspaceAutomationTriggerSummary;
        after: WorkspaceAutomationTriggerSummary;
        /** The skill the trigger was set for, when the request named no trigger. */
        forSkillId?: string;
      }
    | {
        kind: "skill_added";
        skillId: string;
        skillName: string;
        risk?: string;
        missingIntegrations?: WorkspaceAutomationSkillIntegration[];
      }
    | { kind: "skill_removed"; skillId: string; skillName: string }
  );

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
  /** Every change this call looked at, in the order it was made or left out. */
  items: WorkspaceAutomationChangeItem[];
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

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

const REPLACED_SETTING_BY_FIELD: Partial<
  Record<keyof WorkspaceAutomationFormState, WorkspaceAutomationReplacedSetting>
> = {
  gitlabEnabled: "gitlab",
  gitlabPathWithNamespace: "gitlab",
  // Only GitLab holds a repository target that a skill's tool then replaces.
  repositoryTargetKind: "gitlab",
  githubMode: "github_sync",
  pushSourceEnabled: "github_sync",
  pullTranslationsEnabled: "github_sync",
  validationEnabled: "github_sync",
};

/**
 * What attaching a skill would take from the person: a field that already holds something other
 * than the form's default and would end up different. Fields a skill fills in from the default
 * are not counted.
 */
function listReplacedSettings(
  current: WorkspaceAutomationFormState,
  candidate: WorkspaceAutomationFormState,
): WorkspaceAutomationReplacedSetting[] {
  const defaults = createDefaultWorkspaceAutomationFormState();
  const replaced = new Set<WorkspaceAutomationReplacedSetting>();
  for (const field of Object.keys(current) as Array<keyof WorkspaceAutomationFormState>) {
    if (
      field === "skillIds" ||
      sameValue(current[field], candidate[field]) ||
      sameValue(current[field], defaults[field])
    ) {
      continue;
    }
    replaced.add(REPLACED_SETTING_BY_FIELD[field] ?? "other");
  }
  return [...replaced];
}

/**
 * Applies a proposal to the form and says what happened to each change. Every change the
 * proposal asks for is made; the page's undo takes a turn back. A skill is attached only when it
 * runs on the trigger and none of its integrations is known to be disconnected; otherwise it is
 * left out with the reason. Run with the same inputs in the browser and on the server, it gives
 * the same form and outcome.
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
  const items: WorkspaceAutomationChangeItem[] = [];
  const addedSkillIds = new Set<string>();
  const skillName = (skillId: string) => getWorkspaceAutomationSkill(skillId)?.name ?? skillId;

  if (available) {
    for (const kind of ["name", "instructions"] as const) {
      const after = proposal[kind];
      const before = form[kind];
      if (after === null || after === before) {
        continue;
      }
      form = { ...form, [kind]: after };
      items.push({ key: kind, kind, status: "applied", before, after });
    }

    // A skill the new trigger cannot run goes with the trigger change, not on its own.
    const removedForTrigger = new Set(
      proposal.notes
        .filter((note) => note.code === "skill_removed_for_trigger")
        .map((note) => note.skillId),
    );
    for (const skillId of proposal.removeSkillIds) {
      const key = `skill_removed:${skillId}`;
      if (removedForTrigger.has(skillId) || !form.skillIds.includes(skillId)) {
        continue;
      }
      form = removeSkillFromWorkspaceAutomationForm(form, skillId);
      removedSkills.push({ id: skillId, name: skillName(skillId) });
      items.push({
        key,
        kind: "skill_removed",
        status: "applied",
        skillId,
        skillName: skillName(skillId),
      });
    }

    if (proposal.trigger) {
      const before = summarizeWorkspaceAutomationFormTrigger(form);
      let candidate = applyProposalTrigger(form, proposal.trigger);
      // Skills attached by hand since the assistant read the page are checked here too.
      const dropped = resolveWorkspaceAutomationSkills(candidate.skillIds)
        .filter((skill) => !workspaceAutomationSkillSupportsTrigger(skill, candidate.triggerMode))
        .map((skill) => ({ id: skill.id, name: skill.name }));
      for (const skill of dropped) {
        candidate = removeSkillFromWorkspaceAutomationForm(candidate, skill.id);
      }
      const after = summarizeWorkspaceAutomationFormTrigger(candidate);

      if (!sameValue(before, after) || dropped.length > 0) {
        const forSkillId = proposal.notes.find(
          (note) => note.code === "trigger_set_for_skill",
        )?.skillId;
        const replaces = dropped.length > 0 ? { skills: dropped, settings: [] } : undefined;
        form = candidate;
        removedSkills.push(...dropped);
        items.push({
          key: "trigger",
          kind: "trigger",
          status: "applied",
          before,
          after,
          ...(forSkillId ? { forSkillId } : {}),
          ...(replaces ? { replaces } : {}),
        });
      }
    }

    for (const skillId of proposal.addSkillIds) {
      const key = `skill_added:${skillId}`;
      const skill = getWorkspaceAutomationSkill(skillId);
      if (!skill || form.skillIds.includes(skillId)) {
        continue;
      }
      const item = { key, kind: "skill_added" as const, skillId, skillName: skill.name };
      if (!workspaceAutomationSkillSupportsTrigger(skill, form.triggerMode)) {
        items.push({ ...item, status: "left_out", reason: "wrong_trigger" });
        continue;
      }
      const missingIntegrations = listMissingWorkspaceAutomationSkillIntegrations(
        skill,
        connections,
      );
      if (missingIntegrations.length > 0) {
        items.push({
          ...item,
          status: "left_out",
          reason: "needs_connection",
          missingIntegrations,
        });
        continue;
      }

      const candidate = addSkillToWorkspaceAutomationForm(form, skillId, input.defaults);
      const replacedSettings = listReplacedSettings(form, candidate);
      const replaces =
        replacedSettings.length > 0 ? { skills: [], settings: replacedSettings } : undefined;
      form = candidate;
      addedSkillIds.add(skillId);
      items.push({
        ...item,
        status: "applied",
        ...(skill.risk ? { risk: skill.risk } : {}),
        ...(replaces ? { replaces } : {}),
      });
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
  const notAttached = items.flatMap((item): WorkspaceAutomationProposalSkillOutcome[] => {
    if (item.kind !== "skill_added" || item.status === "applied") {
      return [];
    }
    return [
      {
        id: item.skillId,
        name: item.skillName,
        state: item.reason === "needs_connection" ? "needs_connection" : "not_applicable",
        ...(item.missingIntegrations ? { missingIntegrations: item.missingIntegrations } : {}),
        ...(item.risk ? { risk: item.risk } : {}),
      },
    ];
  });

  return {
    form,
    outcome: {
      changed: JSON.stringify(form) !== JSON.stringify(input.form),
      name: form.name,
      trigger: summarizeWorkspaceAutomationFormTrigger(form),
      skills: [...attached, ...notAttached],
      removedSkills,
      setupSteps: listWorkspaceAutomationSetupSteps({ form, connections }),
      items,
    },
  };
}
