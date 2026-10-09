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

import { workspaceAutomationFormStateSchema } from "./workspace-automation-form-schema";
import type { WorkspaceAutomationSkillDefaults } from "./workspace-automation-skill-form";
import type { WorkspaceAutomationSkillConnections } from "./workspace-automation-skills";

export const WORKSPACE_AUTOMATION_EDITOR_CONTEXT_KIND = "automation-editor";

const MAX_ID_CHARS = 255;
const MAX_NAME_CHARS = 500;
const MAX_TIME_ZONE_CHARS = 64;
const MAX_REPOSITORIES = 20;

const id = z.string().min(1).max(MAX_ID_CHARS);

const connectionsSchema = z.object({
  github: z.boolean().optional(),
  crowdin: z.boolean().optional(),
  contentful: z.boolean().optional(),
  intercom: z.boolean().optional(),
  slack: z.boolean().optional(),
  email: z.boolean().optional(),
}) satisfies z.ZodType<WorkspaceAutomationSkillConnections>;

const defaultsSchema = z.object({
  githubInstallationRepositoryId: id.optional(),
  crowdinProjectId: id.optional(),
  contentfulConnectionId: id.optional(),
}) satisfies z.ZodType<WorkspaceAutomationSkillDefaults>;

/**
 * What an open automation setup page tells the chat agent with each turn. It describes the page
 * at that moment and is never stored.
 */
export const workspaceAutomationEditorContextSchema = z.object({
  kind: z.literal(WORKSPACE_AUTOMATION_EDITOR_CONTEXT_KIND),
  /** Names one mounted editor, so a change is applied only to the page it was made for. */
  editorSessionId: id,
  mode: z.enum(["create", "detail"]),
  /** The saved automation the page shows. Null while a new one has not been saved. */
  automationId: id.nullable().default(null),
  form: workspaceAutomationFormStateSchema,
  /** A missing integration means its status is not known yet. */
  connections: connectionsSchema,
  /** Settings to prefill because the workspace has exactly one choice. */
  defaults: defaultsSchema,
  timeZone: z.string().min(1).max(MAX_TIME_ZONE_CHARS),
  /** Display name of the project the automation is in, when the page knows it. */
  projectName: z.string().min(1).max(MAX_NAME_CHARS).nullable().optional(),
  /** Display names for the repositories the form or the defaults refer to. */
  repositories: z
    .array(z.object({ id, name: z.string().min(1).max(MAX_NAME_CHARS) }))
    .max(MAX_REPOSITORIES),
});

export type WorkspaceAutomationEditorContext = z.infer<
  typeof workspaceAutomationEditorContextSchema
>;

/** A setting the workspace has exactly one choice for, or nothing. */
function onlyChoice(ids: readonly string[]): string | undefined {
  const unique = [...new Set(ids.filter((id) => id.length > 0))];
  return unique.length === 1 ? unique[0] : undefined;
}

/**
 * Builds what the setup page tells the agent. A setting is offered as a default only when the
 * workspace has exactly one choice for it, so nothing is picked for the person from several.
 */
export function buildWorkspaceAutomationEditorContext(input: {
  editorSessionId: string;
  mode: WorkspaceAutomationEditorContext["mode"];
  automationId?: string | null;
  form: WorkspaceAutomationEditorContext["form"];
  connections: WorkspaceAutomationSkillConnections;
  timeZone: string;
  /** Connected repositories. Only a selectable one can be offered as the default. */
  repositories: ReadonlyArray<{ id: string; name: string; selectable: boolean }>;
  crowdinProjectIds: readonly string[];
  contentfulConnectionIds: readonly string[];
  /** Display name of the project the automation is in, when the page knows it. */
  projectName?: string | null;
}): WorkspaceAutomationEditorContext {
  const defaultRepositoryId = onlyChoice(
    input.repositories
      .filter((repository) => repository.selectable)
      .map((repository) => repository.id),
  );
  const namedRepositoryIds = new Set(
    [input.form.githubInstallationRepositoryId, defaultRepositoryId].filter(Boolean),
  );

  return {
    kind: WORKSPACE_AUTOMATION_EDITOR_CONTEXT_KIND,
    editorSessionId: input.editorSessionId,
    mode: input.mode,
    automationId: input.automationId ?? null,
    form: input.form,
    connections: input.connections,
    defaults: {
      githubInstallationRepositoryId: defaultRepositoryId,
      crowdinProjectId: onlyChoice(input.crowdinProjectIds),
      contentfulConnectionId: onlyChoice(input.contentfulConnectionIds),
    },
    timeZone: input.timeZone,
    projectName: input.projectName?.trim() || null,
    repositories: input.repositories
      .filter((repository) => namedRepositoryIds.has(repository.id))
      .map((repository) => ({ id: repository.id, name: repository.name })),
  };
}
