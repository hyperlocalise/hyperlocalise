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
import type { UndoStackOptions } from "@/lib/undo-stack/undo-stack";

import {
  workspaceAutomationFormHasChanges,
  type WorkspaceAutomationFormState,
} from "./workspace-automation-view-model";

export type WorkspaceAutomationFormField = keyof WorkspaceAutomationFormState;

/** The part of the form a change belongs to, for naming it. */
export type WorkspaceAutomationChangeGroup =
  | "name"
  | "instructions"
  | "status"
  | "model"
  | "project"
  | "trigger"
  | "schedule"
  | "skills"
  | "tools"
  | "sync"
  | "settings";

/** What one undo step changed on the automation form, as the page describes it. */
export type WorkspaceAutomationFormChange =
  | {
      kind: "edit";
      fields: WorkspaceAutomationFormField[];
      group: WorkspaceAutomationChangeGroup;
      /** Set when the change is typing in one text field, so a burst merges into one step. */
      coalesceKey?: string;
    }
  | { kind: "discard"; fields: WorkspaceAutomationFormField[] }
  | { kind: "reload"; fields: WorkspaceAutomationFormField[] }
  /** Reserved for the assistant: one step per turn, described by what it said it did. */
  | { kind: "assistant"; fields: WorkspaceAutomationFormField[]; summary?: string };

/** Fields typed into a text box, where each keystroke is a change. */
export const WORKSPACE_AUTOMATION_TEXT_FIELDS: ReadonlySet<WorkspaceAutomationFormField> =
  new Set<WorkspaceAutomationFormField>([
    "name",
    "instructions",
    "emailFrom",
    "emailRecipients",
    "contentfulEntryId",
    "intercomSourceLocale",
    "intercomCollectionIds",
    "slackChannelId",
    "gitlabPathWithNamespace",
    "crowdinProjectId",
    "intercomHelpCenterId",
    "syncProviderFolder",
    "syncProjectFolder",
  ]);

const FIELD_GROUPS: Partial<Record<WorkspaceAutomationFormField, WorkspaceAutomationChangeGroup>> =
  {
    name: "name",
    instructions: "instructions",
    status: "status",
    model: "model",
    projectId: "project",
    kind: "trigger",
    triggerMode: "trigger",
    pushBranches: "trigger",
    githubEvents: "trigger",
    scheduledCadence: "schedule",
    scheduledHourUtc: "schedule",
    scheduledDayOfWeek: "schedule",
    scheduledTimezone: "schedule",
    skillIds: "skills",
    syncProvider: "sync",
    syncConnectionId: "sync",
    syncResourceKey: "sync",
    syncProviderFolder: "sync",
    syncProjectFolder: "sync",
    repositoryTargetKind: "tools",
    githubInstallationRepositoryId: "tools",
    gitlabEnabled: "tools",
    githubEnabled: "tools",
    slackEnabled: "tools",
    emailEnabled: "tools",
    githubCommentEnabled: "tools",
    contentfulEnabled: "tools",
    createNativeTmsJobEnabled: "tools",
    assignTranslateWithAgentEnabled: "tools",
    listIssuesEnabled: "tools",
    createIssueEnabled: "tools",
    knowledgeEnabled: "tools",
    knowledgeFilesEnabled: "tools",
    mcpEnabled: "tools",
    semrushEnabled: "tools",
    zernioEnabled: "tools",
    ahrefsEnabled: "tools",
    intercomEnabled: "tools",
    crowdinEnabled: "tools",
    webSearchEnabled: "tools",
  };

function fieldsOf(form: WorkspaceAutomationFormState): WorkspaceAutomationFormField[] {
  return Object.keys(form) as WorkspaceAutomationFormField[];
}

/** The fields whose values differ, in the form's own order. */
export function diffWorkspaceAutomationFormFields(
  before: WorkspaceAutomationFormState,
  after: WorkspaceAutomationFormState,
): WorkspaceAutomationFormField[] {
  const keys = new Set([...fieldsOf(before), ...fieldsOf(after)]);
  return [...keys].filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
}

/**
 * Names the part of the form a change touched. A switched-on or switched-off tool counts as a
 * tool change, and a setting inside a tool counts as a setting, so the first changed field wins.
 */
export function describeWorkspaceAutomationFormChange(
  before: WorkspaceAutomationFormState,
  after: WorkspaceAutomationFormState,
): WorkspaceAutomationFormChange {
  const fields = diffWorkspaceAutomationFormFields(before, after);
  const group = fields.map((field) => FIELD_GROUPS[field]).find((candidate) => candidate);
  const single = fields.length === 1 ? fields[0] : undefined;
  return {
    kind: "edit",
    fields,
    group: group ?? "settings",
    ...(single && WORKSPACE_AUTOMATION_TEXT_FIELDS.has(single)
      ? { coalesceKey: `text:${single}` }
      : {}),
  };
}

export function describeWorkspaceAutomationDiscard(
  before: WorkspaceAutomationFormState,
  after: WorkspaceAutomationFormState,
): WorkspaceAutomationFormChange {
  return { kind: "discard", fields: diffWorkspaceAutomationFormFields(before, after) };
}

export function describeWorkspaceAutomationReload(
  before: WorkspaceAutomationFormState,
  after: WorkspaceAutomationFormState,
): WorkspaceAutomationFormChange {
  return { kind: "reload", fields: diffWorkspaceAutomationFormFields(before, after) };
}

/**
 * Stack options for the automation form. The form is null on the saved automation's page until
 * its record has loaded, so both sides handle null.
 */
export const workspaceAutomationUndoStackOptions: UndoStackOptions<
  WorkspaceAutomationFormState | null,
  WorkspaceAutomationFormChange | null
> = {
  isEqual: (a, b) =>
    a === b || (a !== null && b !== null && !workspaceAutomationFormHasChanges(a, b)),
  describe: (before, after) =>
    before && after ? describeWorkspaceAutomationFormChange(before, after) : null,
  coalesceKeyOf: (change) => (change?.kind === "edit" ? change.coalesceKey : undefined),
};
