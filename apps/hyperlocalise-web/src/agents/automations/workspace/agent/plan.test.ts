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
import { describe, expect, it } from "vite-plus/test";

import type { WorkspaceAutomationRecord } from "@/lib/agents/workspace-automations";

import { buildWorkspaceOrchestratorPlan, planHasActionableTool } from "./plan";

function automation(overrides: Partial<WorkspaceAutomationRecord> = {}): WorkspaceAutomationRecord {
  return {
    id: "automation-1",
    organizationId: "org-1",
    authorUserId: null,
    status: "active",
    name: "Test automation",
    instructions: "",
    projectId: null,
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
        projectId: "project-1",
        toolConfig: {
          github: {
            enabled: true,
            mode: "sync",
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
        projectId: "project-1",
        toolConfig: {
          github: {
            enabled: true,
            mode: "sync",
            pushSource: true,
            pullTranslations: false,
            validation: false,
          },
          contentful: {
            enabled: true,
            connectionId: "conn-1",
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

  it("plans native TMS create then assign when both tools are enabled", () => {
    const plan = buildWorkspaceOrchestratorPlan(
      automation({
        projectId: "project-1",
        triggerConfig: { mode: "source_upload" },
        toolConfig: {
          createNativeTmsJob: {
            enabled: true,
            useProjectTargetLocales: true,
            targetLocales: [],
          },
          assignTranslateWithAgent: {
            enabled: true,
          },
        },
      }),
    );

    expect(plan.tools).toEqual(["create_native_tms_job", "assign_translate_with_agent"]);
  });

  it("plans create job only when Translate with agent is disabled", () => {
    const plan = buildWorkspaceOrchestratorPlan(
      automation({
        projectId: "project-1",
        triggerConfig: { mode: "source_upload" },
        toolConfig: {
          createNativeTmsJob: {
            enabled: true,
            useProjectTargetLocales: true,
            targetLocales: [],
          },
        },
      }),
    );

    expect(plan.tools).toEqual(["create_native_tms_job"]);
  });

  it("includes use_semrush when a Semrush connection is enabled", () => {
    const plan = buildWorkspaceOrchestratorPlan(
      automation({
        toolConfig: {
          semrush: {
            enabled: true,
            connectionId: "11111111-1111-4111-8111-111111111111",
          },
          slack: { enabled: true, channelId: "C123" },
        },
      }),
    );

    expect(plan.tools).toEqual(["use_semrush", "notify_slack"]);
  });

  it("includes use_ahrefs when an Ahrefs connection is enabled", () => {
    const plan = buildWorkspaceOrchestratorPlan(
      automation({
        toolConfig: {
          ahrefs: {
            enabled: true,
            connectionId: "22222222-2222-4222-8222-222222222222",
          },
          slack: { enabled: true, channelId: "C123" },
        },
      }),
    );

    expect(plan.tools).toEqual(["use_ahrefs", "notify_slack"]);
  });

  it("runs recall_memory before workflow and notification tools", () => {
    // Every planned tool is forced in this exact order (agent.ts's prepareStep), so recalled
    // guidance must be available before the tools it's meant to inform run, not after.
    const plan = buildWorkspaceOrchestratorPlan(
      automation({
        projectId: "project-1",
        toolConfig: {
          github: {
            enabled: true,
            mode: "sync",
            pushSource: true,
            pullTranslations: false,
            validation: false,
          },
          slack: { enabled: true, channelId: "C123" },
          knowledge: { enabled: true, allowUpdates: false },
        },
      }),
    );

    expect(plan.tools).toEqual(["recall_memory", "run_github_workflows", "notify_slack"]);
  });

  it("includes save_memory, forced, positioned after workflow tools and before notifications, when allowUpdates is on", () => {
    // save_memory is a forced tool like every other planned tool (see plan.ts's MEMORY_TOOLS
    // comment for why): agent.ts's ToolLoopAgent only continues past a step that produced a tool
    // call, so an "optional, model may skip" step positioned before other forced tools risked the
    // run ending before those later tools — e.g. a Slack/email notification — ever ran.
    const plan = buildWorkspaceOrchestratorPlan(
      automation({
        projectId: "project-1",
        toolConfig: {
          github: {
            enabled: true,
            mode: "sync",
            pushSource: true,
            pullTranslations: false,
            validation: false,
          },
          slack: { enabled: true, channelId: "C123" },
          knowledge: { enabled: true, allowUpdates: true },
        },
      }),
    );

    expect(plan.tools).toEqual([
      "recall_memory",
      "run_github_workflows",
      "save_memory",
      "notify_slack",
    ]);
  });

  it("doesn't plan save_memory when allowUpdates is off", () => {
    const plan = buildWorkspaceOrchestratorPlan(
      automation({
        toolConfig: {
          knowledge: { enabled: true, allowUpdates: false },
        },
      }),
    );

    expect(plan.tools).not.toContain("save_memory");
  });
});

describe("planHasActionableTool", () => {
  it("is false for a recall_memory-only plan", () => {
    // Regression for a Codex finding: dispatchManualWorkspaceAutomationRun (and other dispatch
    // paths) used to check plan.tools.length === 0 to decide whether a run is meaningful. Once
    // recall_memory could be the plan's only tool, that check passed for a plan that reads Memory
    // and performs no workflow or notification action, letting a no-op run be dispatched and
    // reported as successful.
    const plan = buildWorkspaceOrchestratorPlan(
      automation({ toolConfig: { knowledge: { enabled: true, allowUpdates: false } } }),
    );

    expect(plan.tools).toEqual(["recall_memory"]);
    expect(planHasActionableTool(plan)).toBe(false);
  });

  it("is true once a workflow or notification tool is planned alongside memory", () => {
    const plan = buildWorkspaceOrchestratorPlan(
      automation({
        projectId: "project-1",
        toolConfig: {
          slack: { enabled: true, channelId: "C123" },
          knowledge: { enabled: true, allowUpdates: false },
        },
      }),
    );

    expect(plan.tools).toEqual(["recall_memory", "notify_slack"]);
    expect(planHasActionableTool(plan)).toBe(true);
  });

  it("is false for an empty plan", () => {
    expect(planHasActionableTool(buildWorkspaceOrchestratorPlan(automation()))).toBe(false);
  });

  it("is false for a plan of only recall_memory and save_memory", () => {
    // Regression for a Codex finding: save_memory living outside MEMORY_TOOLS (so agent.ts can
    // force it — see plan.ts's MEMORY_TOOLS comment) made this predicate treat it as actionable.
    // But whether save_memory writes anything is entirely the model's call (it can always return
    // entry: null), so a plan of only these two tools is never a *guaranteed* effect the way a
    // workflow or notification tool is — and workspaceAutomationFormCanActivate already excludes
    // Memory (both directions) from what makes an automation activatable in the UI. Treating this
    // as actionable would let dispatchManualWorkspaceAutomationRun accept and bill a run the UI
    // itself wouldn't have allowed the automation to be created with.
    const plan = buildWorkspaceOrchestratorPlan(
      automation({ toolConfig: { knowledge: { enabled: true, allowUpdates: true } } }),
    );

    expect(plan.tools).toEqual(["recall_memory", "save_memory"]);
    expect(planHasActionableTool(plan)).toBe(false);
  });
});
