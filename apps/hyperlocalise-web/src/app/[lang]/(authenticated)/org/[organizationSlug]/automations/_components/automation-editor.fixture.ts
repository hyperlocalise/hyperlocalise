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
import {
  applyTemplateToWorkspaceAutomationFormState,
  createDefaultWorkspaceAutomationFormState,
  createWorkspaceAutomationFormStateFromRecord,
  createWorkspaceAutomationFormStateFromTemplate,
} from "@/lib/agents/workspace-automation-view-model";
import { getWorkspaceAutomationTemplate } from "@/lib/agents/workspace-automation-templates";
import type { WorkspaceAutomationRunRecord } from "@/lib/agents/workspace-automation-types";

import { createAutomationSummary } from "./automations.fixture";
import { intercomApiArticlesFixture, intercomSupportHelpCenter } from "./intercom-api.fixture";

export const automationEditorNativeProjectsFixture = [
  {
    id: "project_website",
    name: "Website",
    source: "github",
    sourceLocale: "en",
    targetLocales: ["fr-FR", "de-DE", "ja-JP"],
  },
  {
    id: "project_mobile",
    name: "Mobile app",
    source: "contentful",
    sourceLocale: "en-US",
    targetLocales: ["es-ES", "pt-BR"],
  },
  {
    id: "project_help_center",
    name: "Help Center",
    source: "file_upload",
    sourceLocale: "en",
    targetLocales: ["de", "fr"],
  },
];

export const automationEditorCrowdinProjectsFixture = [
  {
    id: "ext:crowdin:42",
    name: "Marketing Crowdin",
    source: "external_tms",
    externalProviderKind: "crowdin",
    sourceLocale: "en",
    targetLocales: ["de", "fr"],
  },
];

export const automationEditorProjectsFixture = [
  ...automationEditorNativeProjectsFixture,
  ...automationEditorCrowdinProjectsFixture,
];

export const automationEditorRepositoriesFixture = [
  {
    id: "22222222-2222-4222-8222-222222222222",
    fullName: "acme/website",
    enabled: true,
    archived: false,
    defaultBranch: "main",
  },
  {
    id: "55555555-5555-4555-8555-555555555555",
    fullName: "acme/mobile",
    enabled: true,
    archived: false,
    defaultBranch: "develop",
  },
];

export const automationEditorSlackChannelsFixture = [
  { id: "C01234567", name: "localization", private: false },
  { id: "C07654321", name: "release-updates", private: true },
];

export const automationEditorContentfulConnectionsFixture = [
  {
    id: "contentful_conn_001",
    displayName: "Marketing space",
    contentTypeIds: ["article", "landingPage"],
    enabled: true,
  },
];

export const automationRunsFixture: WorkspaceAutomationRunRecord[] = [
  {
    id: "run_001",
    automationId: "11111111-1111-4111-8111-111111111111",
    organizationId: "org_001",
    triggerSource: "github",
    status: "succeeded",
    idempotencyKey: null,
    inputSnapshot: {},
    outputSummary: {
      orchestratorEnqueuedAt: "2026-06-07T11:55:02.000Z",
      orchestratorStepResults: {
        use_github_repository: {
          branch: "main",
          digest:
            "Reviewed 12 changed locale files. Two keys in fr-FR are missing the {count} placeholder and one German string still has the English source text.",
          repositoryFullName: "acme/website",
          lookbackHours: null,
        },
        create_issue: {
          createdCount: 1,
          completed: true,
          issues: [{ title: "fr-FR: missing {count} placeholder", status: "open" }],
        },
        notify_slack: { sent: true, channelId: "C01234567" },
      },
      targetLocales: ["de-DE", "fr-FR"],
    },
    error: null,
    githubRepositoryAutomationJobId: null,
    startedAt: "2026-06-07T11:55:00.000Z",
    completedAt: "2026-06-07T12:00:00.000Z",
    createdAt: "2026-06-07T11:55:00.000Z",
    updatedAt: "2026-06-07T12:00:00.000Z",
  },
  {
    id: "run_002",
    automationId: "11111111-1111-4111-8111-111111111111",
    organizationId: "org_001",
    triggerSource: "scheduled",
    status: "failed",
    idempotencyKey: null,
    inputSnapshot: {},
    outputSummary: {},
    error: { message: "GitHub sync failed" },
    githubRepositoryAutomationJobId: null,
    startedAt: "2026-06-06T09:00:00.000Z",
    completedAt: "2026-06-06T09:04:00.000Z",
    createdAt: "2026-06-06T09:00:00.000Z",
    updatedAt: "2026-06-06T09:04:00.000Z",
  },
  {
    id: "run_003",
    automationId: "11111111-1111-4111-8111-111111111111",
    organizationId: "org_001",
    triggerSource: "manual",
    status: "running",
    idempotencyKey: "manual-1",
    inputSnapshot: {},
    outputSummary: {},
    error: null,
    githubRepositoryAutomationJobId: null,
    startedAt: "2026-06-05T14:00:00.000Z",
    completedAt: null,
    createdAt: "2026-06-05T14:00:00.000Z",
    updatedAt: "2026-06-05T14:00:00.000Z",
  },
];

export const createEmptyAutomationFormFixture = () => createDefaultWorkspaceAutomationFormState();

export const createGithubAutomationFormFixture = () => {
  const template = getWorkspaceAutomationTemplate("validate-localisation-on-push");
  if (!template) {
    throw new Error("validate-localisation-on-push template is missing");
  }

  return applyTemplateToWorkspaceAutomationFormState(
    createDefaultWorkspaceAutomationFormState(),
    template,
  );
};

export const createContentfulAutomationFormFixture = () => {
  const form = createWorkspaceAutomationFormStateFromTemplate("translate-contentful-article");
  if (!form) {
    throw new Error("translate-contentful-article template is missing");
  }

  return form;
};

export const createDetailAutomationFormFixture = () =>
  createWorkspaceAutomationFormStateFromRecord(createAutomationSummary());

export const createScheduledAutomationFormFixture = () =>
  createWorkspaceAutomationFormStateFromRecord(
    createAutomationSummary({
      name: "Weekly translation sync",
      triggerConfig: {
        mode: "scheduled",
        schedule: {
          cadence: "weekly",
          hourUtc: 9,
          dayOfWeek: 1,
          timezone: "UTC",
        },
      },
    }),
  );

export const createManualAutomationFormFixture = () =>
  createWorkspaceAutomationFormStateFromRecord(
    createAutomationSummary({
      name: "Manual release checklist",
      triggerConfig: { mode: "manual" },
    }),
  );

export const createIntercomAutomationRecord = () =>
  createAutomationSummary({
    id: "66666666-6666-4666-8666-666666666666",
    skillIds: ["translate-intercom-articles"],
    name: "Translate Intercom Help Center articles",
    instructions:
      "Import Intercom Help Center articles into the Help Center project each week. Open native jobs for de and fr. Push approved translations only when requested.",
    projectId: "project_help_center",
    triggerConfig: {
      mode: "scheduled",
      schedule: {
        cadence: "weekly",
        hourUtc: 6,
        dayOfWeek: 1,
        timezone: "UTC",
      },
    },
    repositoryTarget: { kind: "none" },
    toolConfig: {
      github: {
        enabled: false,
        mode: "sync",
        pushSource: false,
        pullTranslations: false,
        validation: false,
      },
      slack: { enabled: false },
      email: { enabled: false, provider: "resend" },
      contentful: {
        enabled: false,
        sourceLocale: "en",
        contentTypeIds: [],
        targetLocales: [],
        fieldMode: "auto",
        overwriteDraftLocales: false,
        runQa: true,
        writeDrafts: true,
      },
      intercom: {
        enabled: true,
        restEndpoint: "us",
        helpCenterId: intercomSupportHelpCenter.id,
        helpCenterLocales: [...intercomSupportHelpCenter.locales],
        collectionIds: ["38"],
        sourceLocale: intercomSupportHelpCenter.defaultLocale ?? "en",
        targetLocales: ["de", "fr"],
        includeDrafts: false,
        overwriteIntercomDrafts: false,
        workosUserId: "user_001",
      },
    },
  });

export const createIntercomAutomationFormFixture = () => {
  const form = createWorkspaceAutomationFormStateFromTemplate("translate-intercom-articles");
  if (!form) {
    throw new Error("translate-intercom-articles template is missing");
  }

  return {
    ...form,
    name: "Translate Intercom Help Center articles",
    projectId: "project_help_center",
    intercomHelpCenterId: intercomSupportHelpCenter.id,
    intercomHelpCenterLocales: [...intercomSupportHelpCenter.locales],
    intercomSourceLocale: intercomSupportHelpCenter.defaultLocale ?? "en",
    intercomTargetLocales: ["de", "fr"],
    intercomCollectionIds: ["38"],
  };
};

const intercomGettingStarted = intercomApiArticlesFixture[0];

export const intercomAutomationRunsFixture: WorkspaceAutomationRunRecord[] = [
  {
    id: "run_intercom_push_001",
    automationId: "66666666-6666-4666-8666-666666666666",
    organizationId: "org_001",
    triggerSource: "manual",
    status: "succeeded",
    idempotencyKey: "intercom-push-1",
    inputSnapshot: { operation: "push_approved" },
    outputSummary: {
      orchestratorEnqueuedAt: "2026-06-14T09:12:00.000Z",
      orchestratorStepResults: {
        push_intercom_translations: {
          summary:
            "Pushed approved drafts to Intercom for Getting started with Acme (de, fr) from Help Center 123.",
          pushed: 2,
          skipped: 0,
          failed: 0,
          articles: [
            {
              articleId: intercomGettingStarted.id,
              title: intercomGettingStarted.title,
              locales: ["de", "fr"],
            },
          ],
        },
      },
    },
    error: null,
    githubRepositoryAutomationJobId: null,
    startedAt: "2026-06-14T09:10:00.000Z",
    completedAt: "2026-06-14T09:12:20.000Z",
    createdAt: "2026-06-14T09:10:00.000Z",
    updatedAt: "2026-06-14T09:12:20.000Z",
  },
  {
    id: "run_intercom_import_001",
    automationId: "66666666-6666-4666-8666-666666666666",
    organizationId: "org_001",
    triggerSource: "scheduled",
    status: "succeeded",
    idempotencyKey: "intercom-import-weekly",
    inputSnapshot: {},
    outputSummary: {
      orchestratorEnqueuedAt: "2026-06-09T06:00:02.000Z",
      orchestratorStepResults: {
        import_intercom_articles: {
          summary:
            "Imported 2 published articles from Customer Support into Help Center (skipped 1 draft).",
          imported: 2,
          skipped: 1,
          failed: 0,
          articles: intercomApiArticlesFixture
            .filter((article) => article.state === "published")
            .map((article) => ({
              articleId: article.id,
              title: article.title,
              path: `intercom/${intercomSupportHelpCenter.id}/${article.id}.md`,
            })),
        },
        create_native_tms_job: {
          created: true,
          jobId: "job_help_center_001",
          targetLocales: ["de", "fr"],
        },
      },
    },
    error: null,
    githubRepositoryAutomationJobId: null,
    startedAt: "2026-06-09T06:00:00.000Z",
    completedAt: "2026-06-09T06:04:00.000Z",
    createdAt: "2026-06-09T06:00:00.000Z",
    updatedAt: "2026-06-09T06:04:00.000Z",
  },
];

export const createMemoriesAutomationFormFixture = () => ({
  ...createGithubAutomationFormFixture(),
  knowledgeEnabled: true,
});
