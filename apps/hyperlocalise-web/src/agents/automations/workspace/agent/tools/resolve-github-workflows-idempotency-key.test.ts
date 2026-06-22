import { describe, expect, it } from "vite-plus/test";

import type {
  WorkspaceAutomationRecord,
  WorkspaceAutomationRunRecord,
} from "@/lib/agents/workspace-automations";
import { buildWorkspaceContentfulWebhookAutomationIdempotencyKey } from "@/lib/agents/workspace-automation-idempotency";

import { createWorkspaceOrchestratorSession } from "../context";
import { resolveGithubWorkflowsIdempotencyKey } from "./resolve-github-workflows-idempotency-key";

function baseAutomation(): WorkspaceAutomationRecord {
  return {
    id: "automation-1",
    organizationId: "org-1",
    authorUserId: null,
    status: "active",
    name: "Contentful + GitHub automation",
    instructions: "",
    triggerConfig: { mode: "contentful" },
    repositoryTarget: { kind: "github", githubInstallationRepositoryId: "repo-install-1" },
    toolConfig: {
      contentful: {
        enabled: true,
        connectionId: "conn-1",
        projectId: "project-1",
        sourceLocale: "en",
        targetLocales: ["de"],
        contentTypeIds: [],
        fieldMode: "auto",
        overwriteDraftLocales: false,
        runQa: true,
        writeDrafts: true,
      },
      github: {
        enabled: true,
        mode: "sync",
        projectId: "project-1",
        pushSource: true,
        pullTranslations: false,
        validation: false,
      },
    },
    configVersion: 3,
    nextRunAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function baseRun(
  overrides: Partial<WorkspaceAutomationRunRecord> = {},
): WorkspaceAutomationRunRecord {
  return {
    id: "run-1",
    automationId: "automation-1",
    organizationId: "org-1",
    triggerSource: "contentful",
    status: "queued",
    inputSnapshot: {
      connectionId: "conn-1",
      entryId: "entry-1",
      contentTypeId: "blogPost",
      contentfulWebhookEventId: "webhook-event-1",
    },
    outputSummary: {},
    error: null,
    githubRepositoryAutomationJobId: null,
    idempotencyKey: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("resolveGithubWorkflowsIdempotencyKey", () => {
  it("uses a stable contentful webhook key so workflow-step retries dedupe GitHub jobs", () => {
    const session = createWorkspaceOrchestratorSession({
      organizationId: "org-1",
      automation: baseAutomation(),
      run: baseRun(),
      plan: { tools: ["run_contentful_translation", "run_github_workflows"] },
      repository: {
        id: "repo-install-1",
        githubInstallationId: "install-1",
        githubRepositoryId: "12345",
      },
      composedInstructions: "Run the automation.",
    });

    const expected = buildWorkspaceContentfulWebhookAutomationIdempotencyKey({
      automationId: "automation-1",
      configVersion: 3,
      contentfulWebhookEventId: "webhook-event-1",
    });

    const firstAttempt = resolveGithubWorkflowsIdempotencyKey({
      session,
      configVersion: 3,
      repositoryId: "repo-install-1",
      githubRepositoryId: "12345",
    });
    const retryAttempt = resolveGithubWorkflowsIdempotencyKey({
      session,
      configVersion: 3,
      repositoryId: "repo-install-1",
      githubRepositoryId: "12345",
    });

    expect(firstAttempt).toBe(expected);
    expect(retryAttempt).toBe(expected);
    expect(firstAttempt).not.toContain("workspace-automation:scheduled");
  });

  it("falls back to the run id when the contentful webhook event id is missing", () => {
    const session = createWorkspaceOrchestratorSession({
      organizationId: "org-1",
      automation: baseAutomation(),
      run: baseRun({ inputSnapshot: {} }),
      plan: { tools: ["run_github_workflows"] },
      repository: {
        id: "repo-install-1",
        githubInstallationId: "install-1",
        githubRepositoryId: "12345",
      },
      composedInstructions: "Run the automation.",
    });

    const key = resolveGithubWorkflowsIdempotencyKey({
      session,
      configVersion: 3,
      repositoryId: "repo-install-1",
      githubRepositoryId: "12345",
    });

    expect(key).toBe(
      buildWorkspaceContentfulWebhookAutomationIdempotencyKey({
        automationId: "automation-1",
        configVersion: 3,
        contentfulWebhookEventId: "run-1",
      }),
    );
  });
});
