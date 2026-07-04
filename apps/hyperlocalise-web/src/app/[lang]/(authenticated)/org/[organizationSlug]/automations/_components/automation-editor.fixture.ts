import {
  createDefaultWorkspaceAutomationFormState,
  createWorkspaceAutomationFormStateFromRecord,
  createWorkspaceAutomationFormStateFromTemplate,
} from "@/lib/agents/workspace-automation-view-model";
import type { WorkspaceAutomationRunRecord } from "@/lib/agents/workspace-automations";

import { createAutomationSummary } from "./automations.fixture";

export const automationEditorProjectsFixture = [
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
    outputSummary: { validatedFiles: 12 },
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

export const createEmptyAutomationFormFixture = createDefaultWorkspaceAutomationFormState();

export const createGithubAutomationFormFixture = () => {
  const form = createWorkspaceAutomationFormStateFromTemplate("validate-localisation-on-push");
  if (!form) {
    throw new Error("validate-localisation-on-push template is missing");
  }

  return form;
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
