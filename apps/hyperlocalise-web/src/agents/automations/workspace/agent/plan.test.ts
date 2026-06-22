import { describe, expect, it } from "vite-plus/test";

import type { WorkspaceAutomationRecord } from "@/lib/agents/workspace-automations";

import { buildWorkspaceOrchestratorPlan } from "./plan";

function automation(overrides: Partial<WorkspaceAutomationRecord> = {}): WorkspaceAutomationRecord {
  return {
    id: "automation-1",
    organizationId: "org-1",
    authorUserId: null,
    status: "active",
    name: "Test automation",
    instructions: "",
    triggerConfig: { mode: "manual" },
    repositoryTarget: { kind: "none" },
    toolConfig: {},
    configVersion: 1,
    nextRunAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("buildWorkspaceOrchestratorPlan", () => {
  it("orders workflow tools before notifications", () => {
    const plan = buildWorkspaceOrchestratorPlan(
      automation({
        toolConfig: {
          github: {
            enabled: true,
            mode: "sync",
            projectId: "project-1",
            pushSource: true,
            pullTranslations: false,
            validation: false,
          },
          slack: { enabled: true, channelId: "C123" },
        },
      }),
    );

    expect(plan.tools).toEqual(["run_github_workflows", "notify_slack"]);
  });

  it("puts contentful before github when template skill targets contentful", () => {
    const plan = buildWorkspaceOrchestratorPlan(
      automation({
        toolConfig: {
          github: {
            enabled: true,
            mode: "sync",
            projectId: "project-1",
            pushSource: true,
            pullTranslations: false,
            validation: false,
          },
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
        },
      }),
      { templateSkillId: "translate-contentful-article" },
    );

    expect(plan.tools).toEqual(["run_contentful_translation", "run_github_workflows"]);
  });

  it("returns no tools when nothing is enabled", () => {
    const plan = buildWorkspaceOrchestratorPlan(automation());
    expect(plan.tools).toEqual([]);
  });
});
