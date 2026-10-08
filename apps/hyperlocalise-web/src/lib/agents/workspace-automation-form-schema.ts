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

import { EMAIL_PROVIDER_SLUGS } from "@/lib/email/constants";

import {
  contentSyncProviderSchema,
  workspaceAutomationGithubTriggerEventSchema,
  workspaceAutomationKindSchema,
  workspaceAutomationModelSchema,
  workspaceAutomationWebSearchProviderSchema,
} from "./workspace-automation-types";
import type { WorkspaceAutomationFormState } from "./workspace-automation-view-model";

// The editor does not limit what is typed, so these only bound the size of what is accepted.
const MAX_TEXT_CHARS = 2_000;
const MAX_INSTRUCTIONS_CHARS = 100_000;
const MAX_LIST_ITEMS = 200;
const MAX_SKILL_IDS = 64;
const MAX_GITHUB_EVENTS = 8;

const flag = z.boolean();
const text = z.string().max(MAX_TEXT_CHARS);
const textList = z.array(text).max(MAX_LIST_ITEMS);

const formStateShape = {
  kind: workspaceAutomationKindSchema,
  name: text,
  instructions: z.string().max(MAX_INSTRUCTIONS_CHARS),
  skillIds: z.array(text).max(MAX_SKILL_IDS),
  model: workspaceAutomationModelSchema,
  status: z.enum(["active", "paused"]),
  projectId: text,
  syncProvider: contentSyncProviderSchema,
  syncConnectionId: text,
  syncResourceKey: text,
  syncProviderFolder: text,
  syncProjectFolder: text,
  triggerMode: z.enum(["manual", "scheduled", "github", "contentful", "source_upload", "web_chat"]),
  pushBranches: textList,
  githubEvents: z.array(workspaceAutomationGithubTriggerEventSchema).max(MAX_GITHUB_EVENTS),
  scheduledCadence: z.enum(["hourly", "daily", "weekly"]),
  scheduledHourUtc: z.number().int().min(0).max(23),
  scheduledDayOfWeek: z.number().int().min(0).max(6),
  scheduledTimezone: text,
  repositoryTargetKind: z.enum(["none", "github", "gitlab"]),
  githubInstallationRepositoryId: text,
  gitlabEnabled: flag,
  gitlabPathWithNamespace: text,
  githubEnabled: flag,
  githubMode: z.enum(["agent", "sync"]),
  pushSourceEnabled: flag,
  pullTranslationsEnabled: flag,
  validationEnabled: flag,
  slackEnabled: flag,
  slackChannelId: text,
  emailEnabled: flag,
  emailProvider: z.enum(EMAIL_PROVIDER_SLUGS),
  emailFrom: text,
  emailRecipients: textList,
  githubCommentEnabled: flag,
  contentfulEnabled: flag,
  contentfulConnectionId: text,
  contentfulSourceLocale: text,
  contentfulEntryId: text,
  contentfulContentTypeIds: textList,
  contentfulTargetLocales: textList,
  contentfulFieldMode: z.enum(["auto", "configured"]),
  contentfulOverwriteDraftLocales: flag,
  contentfulRunQa: flag,
  contentfulWriteDrafts: flag,
  createNativeTmsJobEnabled: flag,
  createNativeTmsJobUseProjectTargetLocales: flag,
  createNativeTmsJobTargetLocales: textList,
  assignTranslateWithAgentEnabled: flag,
  listIssuesEnabled: flag,
  createIssueEnabled: flag,
  knowledgeEnabled: flag,
  knowledgeAllowUpdates: flag,
  knowledgeFilesEnabled: flag,
  mcpEnabled: flag,
  mcpConnectionId: text,
  semrushEnabled: flag,
  semrushConnectionId: text,
  zernioEnabled: flag,
  zernioConnectionId: text,
  ahrefsEnabled: flag,
  crowdinEnabled: flag,
  crowdinProjectId: text,
  intercomEnabled: flag,
  intercomRestEndpoint: z.enum(["us", "eu", "au"]),
  intercomHelpCenterId: text,
  intercomHelpCenterLocales: textList,
  intercomSourceLocale: text,
  intercomTargetLocales: textList,
  intercomCollectionIds: textList,
  intercomIncludeDrafts: flag,
  intercomOverwriteIntercomDrafts: flag,
  webSearchEnabled: flag,
  webSearchProvider: workspaceAutomationWebSearchProviderSchema,
  // Listing every field here keeps the schema in step with the form: a field added to the form,
  // or removed from it, fails the type check until this is updated.
} satisfies Record<keyof WorkspaceAutomationFormState, z.ZodType>;

/** The editor's form state as received from a browser. Unknown keys are dropped. */
export const workspaceAutomationFormStateSchema = z.object(
  formStateShape,
) satisfies z.ZodType<WorkspaceAutomationFormState>;
