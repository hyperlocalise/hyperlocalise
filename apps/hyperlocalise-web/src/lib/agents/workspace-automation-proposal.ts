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
import { z } from "zod";

import { assertNever } from "@/lib/primitives/assert-never/assert-never";

import { isValidAutomationTimeZone } from "./automation-time-zones";
import {
  getWorkspaceAutomationSkill,
  MAX_WORKSPACE_AUTOMATION_SKILLS,
  workspaceAutomationSkillSupportsTrigger,
  type WorkspaceAutomationSkillTrigger,
} from "./workspace-automation-skills";
import {
  branchPatternSchema,
  WORKSPACE_AUTOMATION_INSTRUCTIONS_MAX_CHARS,
  WORKSPACE_AUTOMATION_NAME_MAX_CHARS,
  workspaceAutomationGithubTriggerEventSchema,
  type WorkspaceAutomationGithubTriggerEvent,
} from "./workspace-automation-types";

/** Triggers a proposal may choose. Web chat runs a different agent and is set up by hand. */
export const WORKSPACE_AUTOMATION_PROPOSAL_TRIGGER_MODES = [
  "manual",
  "scheduled",
  "github",
  "contentful",
  "source_upload",
] as const;

export type WorkspaceAutomationProposalTriggerMode =
  (typeof WORKSPACE_AUTOMATION_PROPOSAL_TRIGGER_MODES)[number];

const SCHEDULE_CADENCES = ["hourly", "daily", "weekly"] as const;
const MAX_BRANCH_PATTERNS = 32;
const MAX_SKILL_ID_CHARS = 64;
const MAX_TIME_ZONE_CHARS = 64;
const MAX_PROPOSAL_NOTES = 32;
const PULL_REQUEST_COMMENT_SKILL_ID = "comment-on-pull-request";

/** The skill that does a trigger's work. The editor's trigger menu switches the same tools on. */
export const WORKSPACE_AUTOMATION_TRIGGER_WORK_SKILL_IDS: Partial<
  Record<WorkspaceAutomationProposalTriggerMode, string>
> = {
  source_upload: "translate-uploaded-source",
  contentful: "translate-contentful-entries",
};

/**
 * What the model writes. Every key is present and null means "leave as it is". Ids are plain
 * strings so one wrong id does not reject the whole call; the normaliser drops what it cannot use.
 */
export const workspaceAutomationProposalInputSchema = z.object({
  name: z.string().nullable().describe("A short name for the automation, or null to keep it."),
  instructions: z
    .string()
    .nullable()
    .describe(
      "Extra guidance for the automation's agent that the skills do not already cover, or null to keep it. An empty string clears it.",
    ),
  trigger: z
    .object({
      mode: z.enum(WORKSPACE_AUTOMATION_PROPOSAL_TRIGGER_MODES),
      cadence: z.enum(SCHEDULE_CADENCES).nullable().describe("Scheduled only."),
      hour: z
        .number()
        .int()
        .min(0)
        .max(23)
        .nullable()
        .describe("Scheduled daily or weekly only: the hour on a 24-hour clock in timeZone."),
      dayOfWeek: z
        .number()
        .int()
        .min(0)
        .max(6)
        .nullable()
        .describe("Scheduled weekly only: 0 is Sunday, 1 is Monday, 6 is Saturday."),
      timeZone: z
        .string()
        .nullable()
        .describe("Scheduled only: an IANA time zone, or null for the person's own."),
      githubEvents: z
        .array(workspaceAutomationGithubTriggerEventSchema)
        .nullable()
        .describe("GitHub only."),
      branches: z
        .array(z.string())
        .nullable()
        .describe("GitHub only: branch names or patterns such as main or release/*."),
    })
    .nullable()
    .describe("When the automation runs, or null to keep the current trigger."),
  addSkillIds: z.array(z.string()).describe("Ids of skills to attach."),
  removeSkillIds: z.array(z.string()).describe("Ids of attached skills to detach."),
});

export type WorkspaceAutomationProposalInput = z.infer<
  typeof workspaceAutomationProposalInputSchema
>;

export const WORKSPACE_AUTOMATION_PROPOSAL_NOTE_CODES = [
  "unknown_skill",
  "skill_in_both_lists",
  "skill_already_attached",
  "skill_not_attached",
  "trigger_set_for_skill",
  "skill_added_for_trigger",
  "skill_removed_for_trigger",
  "time_zone_not_recognised",
  "branch_pattern_dropped",
] as const;

const proposalNoteSchema = z.object({
  code: z.enum(WORKSPACE_AUTOMATION_PROPOSAL_NOTE_CODES),
  skillId: z.string().max(MAX_SKILL_ID_CHARS).optional(),
});

export type WorkspaceAutomationProposalNote = z.infer<typeof proposalNoteSchema>;

const proposalTriggerSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("manual") }),
  z.object({
    mode: z.literal("scheduled"),
    cadence: z.enum(SCHEDULE_CADENCES).nullable(),
    hour: z.number().int().min(0).max(23).nullable(),
    dayOfWeek: z.number().int().min(0).max(6).nullable(),
    timeZone: z.string().min(1).max(MAX_TIME_ZONE_CHARS).nullable(),
  }),
  z.object({
    mode: z.literal("github"),
    events: z.array(workspaceAutomationGithubTriggerEventSchema).min(1).max(2).nullable(),
    branches: z.array(branchPatternSchema).min(1).max(MAX_BRANCH_PATTERNS).nullable(),
  }),
  z.object({ mode: z.literal("contentful") }),
  z.object({ mode: z.literal("source_upload") }),
]);

export type WorkspaceAutomationProposalTrigger = z.infer<typeof proposalTriggerSchema>;

const proposalSkillIdsSchema = z
  .array(z.string().min(1).max(MAX_SKILL_ID_CHARS))
  .max(MAX_WORKSPACE_AUTOMATION_SKILLS);

/** A change to an automation's setup that is safe to apply: known skills, valid trigger values. */
export const workspaceAutomationProposalSchema = z.object({
  name: z.string().min(1).max(WORKSPACE_AUTOMATION_NAME_MAX_CHARS).nullable(),
  instructions: z.string().max(WORKSPACE_AUTOMATION_INSTRUCTIONS_MAX_CHARS).nullable(),
  trigger: proposalTriggerSchema.nullable(),
  addSkillIds: proposalSkillIdsSchema,
  removeSkillIds: proposalSkillIdsSchema,
  notes: z.array(proposalNoteSchema).max(MAX_PROPOSAL_NOTES),
});

export type WorkspaceAutomationProposal = z.infer<typeof workspaceAutomationProposalSchema>;

/** The parts of the current setup a proposal is checked against. */
export type WorkspaceAutomationProposalBase = {
  triggerMode: WorkspaceAutomationSkillTrigger;
  skillIds: readonly string[];
  /** Used for a new schedule that names no time zone. */
  timeZone: string;
};

function uniqueKnownSkillIds(
  skillIds: readonly string[],
  notes: WorkspaceAutomationProposalNote[],
): string[] {
  const known: string[] = [];
  for (const raw of skillIds) {
    const skillId = raw.trim();
    if (!skillId || known.includes(skillId)) {
      continue;
    }
    if (!getWorkspaceAutomationSkill(skillId)) {
      notes.push({ code: "unknown_skill", skillId: skillId.slice(0, MAX_SKILL_ID_CHARS) });
      continue;
    }
    known.push(skillId);
  }
  return known;
}

function normalizeBranches(
  branches: readonly string[] | null,
  notes: WorkspaceAutomationProposalNote[],
): string[] | null {
  if (!branches) {
    return null;
  }

  const valid: string[] = [];
  let dropped = false;
  for (const raw of branches) {
    const parsed = branchPatternSchema.safeParse(raw);
    if (!parsed.success) {
      dropped = true;
      continue;
    }
    if (!valid.includes(parsed.data)) {
      valid.push(parsed.data);
    }
  }
  if (dropped || valid.length > MAX_BRANCH_PATTERNS) {
    notes.push({ code: "branch_pattern_dropped" });
  }

  return valid.length > 0 ? valid.slice(0, MAX_BRANCH_PATTERNS) : null;
}

function normalizeTimeZone(
  timeZone: string | null,
  base: WorkspaceAutomationProposalBase,
  notes: WorkspaceAutomationProposalNote[],
): string | null {
  const requested = timeZone?.trim() ?? "";
  if (requested) {
    if (requested.length <= MAX_TIME_ZONE_CHARS && isValidAutomationTimeZone(requested)) {
      return requested;
    }
    notes.push({ code: "time_zone_not_recognised" });
  }

  // An existing schedule keeps its zone; a new one starts in the person's own.
  if (base.triggerMode === "scheduled") {
    return null;
  }
  return isValidAutomationTimeZone(base.timeZone) ? base.timeZone : null;
}

function normalizeTrigger(
  trigger: NonNullable<WorkspaceAutomationProposalInput["trigger"]>,
  base: WorkspaceAutomationProposalBase,
  addSkillIds: readonly string[],
  notes: WorkspaceAutomationProposalNote[],
): WorkspaceAutomationProposalTrigger {
  switch (trigger.mode) {
    case "scheduled": {
      const cadence = trigger.cadence;
      return {
        mode: "scheduled",
        cadence,
        hour: cadence === "hourly" ? null : trigger.hour,
        dayOfWeek: cadence === "weekly" ? trigger.dayOfWeek : null,
        timeZone: normalizeTimeZone(trigger.timeZone, base, notes),
      };
    }
    case "github": {
      const requested = trigger.githubEvents ? [...new Set(trigger.githubEvents)] : [];
      return {
        mode: "github",
        events: requested.length > 0 ? requested : defaultGithubEvents(base, addSkillIds),
        branches: normalizeBranches(trigger.branches, notes),
      };
    }
    case "manual":
    case "contentful":
    case "source_upload":
      return { mode: trigger.mode };
    default:
      return assertNever(trigger.mode);
  }
}

/** A new GitHub trigger for the pull request comment runs on pull requests, as in the editor. */
function defaultGithubEvents(
  base: WorkspaceAutomationProposalBase,
  addSkillIds: readonly string[],
): WorkspaceAutomationGithubTriggerEvent[] | null {
  if (base.triggerMode !== "github" && addSkillIds.includes(PULL_REQUEST_COMMENT_SKILL_ID)) {
    return ["pull_request"];
  }
  return null;
}

/** The trigger a skill needs when the setup is still on the untouched manual default. */
function resolveImpliedTrigger(
  base: WorkspaceAutomationProposalBase,
  addSkillIds: readonly string[],
  notes: WorkspaceAutomationProposalNote[],
): WorkspaceAutomationProposalTrigger | null {
  if (base.triggerMode !== "manual") {
    return null;
  }

  for (const skillId of addSkillIds) {
    const skill = getWorkspaceAutomationSkill(skillId);
    const mode = skill?.triggers[0];
    if (!skill || !mode || workspaceAutomationSkillSupportsTrigger(skill, "manual")) {
      continue;
    }
    notes.push({ code: "trigger_set_for_skill", skillId });
    switch (mode) {
      case "github":
        return { mode, events: defaultGithubEvents(base, addSkillIds), branches: null };
      case "scheduled":
        return { mode, cadence: null, hour: null, dayOfWeek: null, timeZone: null };
      case "contentful":
      case "source_upload":
        return { mode };
      // A skill never lists manual first here, and web chat is not offered.
      case "manual":
      case "web_chat":
        return null;
      default:
        return assertNever(mode);
    }
  }

  return null;
}

/**
 * Turns what the model wrote into a change that can be applied as it stands: unknown and
 * contradictory skill ids are dropped, trigger values are checked, a trigger a skill needs is made
 * explicit, the skill a new trigger needs is attached, and attached skills the new trigger cannot
 * run are detached.
 */
export function normalizeWorkspaceAutomationProposal(
  input: WorkspaceAutomationProposalInput,
  base: WorkspaceAutomationProposalBase,
): WorkspaceAutomationProposal {
  const notes: WorkspaceAutomationProposalNote[] = [];
  const requestedAdd = uniqueKnownSkillIds(input.addSkillIds, notes);
  const requestedRemove = uniqueKnownSkillIds(input.removeSkillIds, notes);

  const addSkillIds: string[] = [];
  for (const skillId of requestedAdd) {
    if (requestedRemove.includes(skillId)) {
      notes.push({ code: "skill_in_both_lists", skillId });
    } else if (base.skillIds.includes(skillId)) {
      notes.push({ code: "skill_already_attached", skillId });
    } else {
      addSkillIds.push(skillId);
    }
  }

  const removeSkillIds: string[] = [];
  for (const skillId of requestedRemove) {
    if (requestedAdd.includes(skillId)) {
      continue;
    }
    if (base.skillIds.includes(skillId)) {
      removeSkillIds.push(skillId);
    } else {
      notes.push({ code: "skill_not_attached", skillId });
    }
  }

  const trigger = input.trigger
    ? normalizeTrigger(input.trigger, base, addSkillIds, notes)
    : resolveImpliedTrigger(base, addSkillIds, notes);

  if (trigger && trigger.mode !== base.triggerMode) {
    for (const skillId of base.skillIds) {
      const skill = getWorkspaceAutomationSkill(skillId);
      if (
        skill &&
        !removeSkillIds.includes(skillId) &&
        !workspaceAutomationSkillSupportsTrigger(skill, trigger.mode)
      ) {
        removeSkillIds.push(skillId);
        notes.push({ code: "skill_removed_for_trigger", skillId });
      }
    }
  }

  const workSkillId =
    trigger && trigger.mode !== base.triggerMode
      ? WORKSPACE_AUTOMATION_TRIGGER_WORK_SKILL_IDS[trigger.mode]
      : undefined;
  if (
    workSkillId &&
    !base.skillIds.includes(workSkillId) &&
    !addSkillIds.includes(workSkillId) &&
    !requestedRemove.includes(workSkillId)
  ) {
    addSkillIds.push(workSkillId);
    notes.push({ code: "skill_added_for_trigger", skillId: workSkillId });
  }

  const name = input.name?.trim().slice(0, WORKSPACE_AUTOMATION_NAME_MAX_CHARS) ?? "";

  return {
    name: name || null,
    instructions:
      input.instructions === null
        ? null
        : input.instructions.trim().slice(0, WORKSPACE_AUTOMATION_INSTRUCTIONS_MAX_CHARS),
    trigger,
    addSkillIds: addSkillIds.slice(0, MAX_WORKSPACE_AUTOMATION_SKILLS),
    removeSkillIds: removeSkillIds.slice(0, MAX_WORKSPACE_AUTOMATION_SKILLS),
    notes: notes.slice(0, MAX_PROPOSAL_NOTES),
  };
}

/** True when applying the proposal would change nothing. */
export function isWorkspaceAutomationProposalEmpty(proposal: WorkspaceAutomationProposal) {
  return (
    proposal.name === null &&
    proposal.instructions === null &&
    proposal.trigger === null &&
    proposal.addSkillIds.length === 0 &&
    proposal.removeSkillIds.length === 0
  );
}
