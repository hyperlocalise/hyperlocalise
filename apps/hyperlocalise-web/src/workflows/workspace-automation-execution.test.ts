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
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { workspaceOrchestratorDeadlineMs } from "@/agents/automations/workspace/agent/durable-tool-budget";
import type { WorkspaceOrchestratorToolName } from "@/agents/automations/workspace/agent/plan";
import type { WorkspaceOrchestratorToolState } from "@/agents/automations/workspace/agent/run-workspace-orchestrator";

type FakeTool = { execute: (input: unknown, options: { toolCallId: string }) => Promise<unknown> };
type StopCondition = (options: { steps: unknown[] }) => boolean | PromiseLike<boolean>;
type AgentOptions = {
  tools: Record<string, FakeTool>;
  prepareStep?: (options: { stepNumber: number }) => {
    toolChoice: "none" | { type: "tool"; toolName: string };
  };
};
type GenerateOptions = { stopWhen: StopCondition | StopCondition[]; timeout: number };

const mocks = vi.hoisted(() => ({
  steps: {
    prepareWorkspaceAutomationStep: vi.fn(),
    executeWorkspaceOrchestratorToolStep: vi.fn(),
    completeWorkspaceAutomationStep: vi.fn(),
    failWorkspaceAutomationStep: vi.fn(),
    startRepositoryAgentStep: vi.fn(),
    executeRepositoryAgentToolStep: vi.fn(),
    finishRepositoryAgentStep: vi.fn(),
    failRepositoryAgentStep: vi.fn(),
    startGithubWorkflowsStep: vi.fn(),
    pollGithubWorkflowsJobStep: vi.fn(),
    finishGithubWorkflowsStep: vi.fn(),
  },
  sleep: vi.fn(async () => undefined),
  generateOptions: [] as GenerateOptions[],
  generateError: null as Error | null,
}));

vi.mock("workflow", () => ({
  getWorkflowMetadata: vi.fn(() => ({ workflowRunId: "wrun_1" })),
  sleep: mocks.sleep,
}));

vi.mock("./steps/workspace-automation-execution", () => mocks.steps);

/**
 * Mirrors WorkflowAgent's loop: each step runs the tool chosen by `prepareStep` (or, without one,
 * every tool once), a throwing tool becomes an error result, and `stopWhen` ends the loop.
 */
vi.mock("@ai-sdk/workflow", () => ({
  WorkflowAgent: class {
    constructor(private readonly options: AgentOptions) {}

    async generate(options: GenerateOptions) {
      mocks.generateOptions.push(options);
      if (mocks.generateError) {
        throw mocks.generateError;
      }

      const stopConditions = Array.isArray(options.stopWhen)
        ? options.stopWhen
        : [options.stopWhen];
      const toolNames = Object.keys(this.options.tools);
      const steps: unknown[] = [];

      for (let stepNumber = 0; stepNumber < toolNames.length + 5; stepNumber++) {
        const choice = this.options.prepareStep
          ? this.options.prepareStep({ stepNumber }).toolChoice
          : toolNames[stepNumber]
            ? { type: "tool" as const, toolName: toolNames[stepNumber]! }
            : "none";
        if (choice === "none") {
          break;
        }

        const execute = this.options.tools[choice.toolName]!.execute;
        await execute({}, { toolCallId: `call-${stepNumber}` }).catch(() => undefined);
        steps.push({ stepNumber });

        const stops = await Promise.all(
          stopConditions.map((stop) => Promise.resolve(stop({ steps }))),
        );
        if (stops.some(Boolean)) {
          break;
        }
      }

      return { text: "Digest ready", usage: { totalTokens: 42 } };
    }
  },
}));

import { workspaceAutomationExecutionWorkflow } from "./workspace-automation-execution";

const event = { workspaceAutomationRunId: "run-1", organizationId: "org-1" };

function ready(planTools: WorkspaceOrchestratorToolName[]) {
  return {
    ok: true,
    value: {
      kind: "ready",
      runId: "run-1",
      model: "anthropic/claude-sonnet-5",
      instructions: "instructions",
      userMessage: "message",
      maxOutputTokens: 1000,
      planTools,
      toolSpecs: planTools.map((name) => ({ name, description: name, inputJsonSchema: {} })),
    },
  };
}

function stateAfter(...tools: string[]): WorkspaceOrchestratorToolState {
  return {
    stepResults: Object.fromEntries(tools.map((name) => [name, { done: true }])),
    terminalStatus: null,
    terminalError: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.generateOptions.length = 0;
  mocks.generateError = null;
  mocks.steps.completeWorkspaceAutomationStep.mockResolvedValue({
    ok: true,
    value: { runId: "run-1", status: "succeeded", planTools: [], stepResults: {} },
  });
  mocks.steps.failWorkspaceAutomationStep.mockImplementation(async ({ message }) => ({
    code: "workspace_orchestrator_failed",
    message,
    runId: "run-1",
  }));
});

describe("workspaceAutomationExecutionWorkflow", () => {
  it("returns without an agent loop when preparation completes the run", async () => {
    mocks.steps.prepareWorkspaceAutomationStep.mockResolvedValue({
      ok: true,
      value: { kind: "completed", result: { runId: "run-1", status: "skipped" } },
    });

    await expect(workspaceAutomationExecutionWorkflow(event)).resolves.toEqual({
      ok: true,
      runId: "run-1",
      status: "skipped",
      workflowRunId: "wrun_1",
    });
    expect(mocks.generateOptions).toHaveLength(0);
  });

  it("runs planned tools in order, threading run state between tool steps", async () => {
    mocks.steps.prepareWorkspaceAutomationStep.mockResolvedValue(
      ready(["list_issues", "notify_slack"]),
    );
    mocks.steps.executeWorkspaceOrchestratorToolStep
      .mockResolvedValueOnce({ ok: true, output: {}, state: stateAfter("list_issues") })
      .mockResolvedValueOnce({
        ok: true,
        output: {},
        state: stateAfter("list_issues", "notify_slack"),
      });

    const result = await workspaceAutomationExecutionWorkflow(event);

    const calls = mocks.steps.executeWorkspaceOrchestratorToolStep.mock.calls.map(
      ([input]) => input,
    );
    expect(calls.map((input) => input.toolName)).toEqual(["list_issues", "notify_slack"]);
    expect(calls[0].state).toEqual(stateAfter());
    expect(calls[1].state).toEqual(stateAfter("list_issues"));
    expect(mocks.steps.completeWorkspaceAutomationStep).toHaveBeenCalledWith({
      event,
      planTools: ["list_issues", "notify_slack"],
      state: stateAfter("list_issues", "notify_slack"),
      usage: { totalTokens: 42 },
    });
    expect(mocks.generateOptions[0]?.timeout).toBe(
      workspaceOrchestratorDeadlineMs(["list_issues", "notify_slack"]),
    );
    expect(result).toEqual({
      ok: true,
      runId: "run-1",
      status: "succeeded",
      workflowRunId: "wrun_1",
    });
  });

  it("moves on to the next planned tool after a tool fails", async () => {
    mocks.steps.prepareWorkspaceAutomationStep.mockResolvedValue(
      ready(["create_issue", "notify_slack"]),
    );
    mocks.steps.executeWorkspaceOrchestratorToolStep
      .mockResolvedValueOnce({ ok: false, message: "boom", state: stateAfter("create_issue") })
      .mockResolvedValueOnce({
        ok: true,
        output: {},
        state: stateAfter("create_issue", "notify_slack"),
      });

    await workspaceAutomationExecutionWorkflow(event);

    const calls = mocks.steps.executeWorkspaceOrchestratorToolStep.mock.calls.map(
      ([input]) => input,
    );
    expect(calls.map((input) => input.toolName)).toEqual(["create_issue", "notify_slack"]);
    expect(calls[1].state).toEqual({
      ...stateAfter("create_issue"),
      terminalStatus: "failed",
      terminalError: "boom",
    });
    expect(mocks.steps.completeWorkspaceAutomationStep).toHaveBeenCalledWith(
      expect.objectContaining({
        state: {
          ...stateAfter("create_issue", "notify_slack"),
          terminalStatus: "failed",
          terminalError: "boom",
        },
      }),
    );
  });

  it("keeps a failed planned tool failed when a later tool reports success", async () => {
    mocks.steps.prepareWorkspaceAutomationStep.mockResolvedValue(
      ready(["use_semrush", "notify_slack"]),
    );
    mocks.steps.executeWorkspaceOrchestratorToolStep
      .mockResolvedValueOnce({
        ok: false,
        message: "semrush_not_connected",
        state: stateAfter("use_semrush"),
      })
      .mockResolvedValueOnce({
        ok: true,
        output: {},
        state: {
          ...stateAfter("use_semrush", "notify_slack"),
          terminalStatus: "succeeded",
        },
      });

    await workspaceAutomationExecutionWorkflow(event);

    expect(mocks.steps.completeWorkspaceAutomationStep).toHaveBeenCalledWith(
      expect.objectContaining({
        state: {
          ...stateAfter("use_semrush", "notify_slack"),
          terminalStatus: "failed",
          terminalError: "semrush_not_connected",
        },
      }),
    );
  });

  it("stops the loop once a tool step reports the run was cancelled", async () => {
    mocks.steps.prepareWorkspaceAutomationStep.mockResolvedValue(
      ready(["create_issue", "notify_slack"]),
    );
    mocks.steps.executeWorkspaceOrchestratorToolStep.mockResolvedValueOnce({
      ok: false,
      message: "workspace_automation_run_cancelled",
      state: stateAfter(),
      cancelled: true,
    });

    await workspaceAutomationExecutionWorkflow(event);

    expect(mocks.steps.executeWorkspaceOrchestratorToolStep).toHaveBeenCalledTimes(1);
    expect(mocks.steps.completeWorkspaceAutomationStep).toHaveBeenCalledWith(
      expect.objectContaining({ state: stateAfter() }),
    );
  });

  it("marks a failed GitHub workflow start as failed before completing", async () => {
    mocks.steps.prepareWorkspaceAutomationStep.mockResolvedValue(
      ready(["run_github_workflows", "notify_slack"]),
    );
    mocks.steps.startGithubWorkflowsStep.mockResolvedValue({
      ok: false,
      message: "github_workflow_start_failed",
      state: stateAfter(),
    });
    mocks.steps.executeWorkspaceOrchestratorToolStep.mockResolvedValueOnce({
      ok: true,
      output: {},
      state: stateAfter("notify_slack"),
    });

    await workspaceAutomationExecutionWorkflow(event);

    expect(mocks.steps.executeWorkspaceOrchestratorToolStep).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: "notify_slack",
        state: {
          ...stateAfter(),
          terminalStatus: "failed",
          terminalError: "github_workflow_start_failed",
        },
      }),
    );
    expect(mocks.steps.completeWorkspaceAutomationStep).toHaveBeenCalledWith(
      expect.objectContaining({
        state: {
          ...stateAfter("notify_slack"),
          terminalStatus: "failed",
          terminalError: "github_workflow_start_failed",
        },
      }),
    );
  });

  it("fails the run when the agent loop throws", async () => {
    mocks.steps.prepareWorkspaceAutomationStep.mockResolvedValue(ready(["notify_slack"]));
    mocks.generateError = new Error("The generation deadline expired.");

    const result = await workspaceAutomationExecutionWorkflow(event);

    expect(mocks.steps.failWorkspaceAutomationStep).toHaveBeenCalledWith({
      event,
      state: stateAfter(),
      message: "The generation deadline expired.",
    });
    expect(mocks.steps.completeWorkspaceAutomationStep).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: false,
      runId: "run-1",
      message: "The generation deadline expired.",
      workflowRunId: "wrun_1",
    });
  });

  it("runs a repository agent as a nested durable loop with one step per repository tool", async () => {
    mocks.steps.prepareWorkspaceAutomationStep.mockResolvedValue(ready(["use_github_repository"]));
    const start = {
      toolName: "use_github_repository",
      sandboxId: "sbx-1",
      model: "anthropic/claude-sonnet-5",
      instructions: "repo instructions",
      prompt: "review",
      gitlabContext: null,
      payload: {},
      emptyDigest: "",
      usage: { operationKey: "op", source: "src", dimensions: {} },
    };
    mocks.steps.startRepositoryAgentStep.mockResolvedValue({
      ok: true,
      start,
      toolSpecs: [
        { name: "gitHistory", description: "", inputJsonSchema: {} },
        { name: "read", description: "", inputJsonSchema: {} },
      ],
      state: stateAfter(),
    });
    mocks.steps.executeRepositoryAgentToolStep
      .mockResolvedValueOnce({
        ok: true,
        output: "log",
        todos: [{ id: "1", content: "a", status: "todo" }],
      })
      .mockResolvedValueOnce({ ok: true, output: "file", todos: [] });
    mocks.steps.finishRepositoryAgentStep.mockResolvedValue({
      ok: true,
      output: { digest: "Digest ready" },
      state: stateAfter("use_github_repository"),
    });

    await workspaceAutomationExecutionWorkflow(event);

    const repoCalls = mocks.steps.executeRepositoryAgentToolStep.mock.calls.map(([input]) => input);
    expect(repoCalls.map((input) => input.toolName)).toEqual(["gitHistory", "read"]);
    expect(repoCalls[0].start).toEqual({ sandboxId: "sbx-1", gitlabContext: null });
    expect(repoCalls[1].todos).toEqual([{ id: "1", content: "a", status: "todo" }]);
    expect(mocks.steps.finishRepositoryAgentStep).toHaveBeenCalledWith(
      expect.objectContaining({ start, text: "Digest ready", usage: { totalTokens: 42 } }),
    );
    expect(mocks.steps.executeWorkspaceOrchestratorToolStep).not.toHaveBeenCalled();
    expect(mocks.steps.completeWorkspaceAutomationStep).toHaveBeenCalledWith(
      expect.objectContaining({ state: stateAfter("use_github_repository") }),
    );
  });

  it("stops the repository agent and its sandbox when the run is cancelled mid-review", async () => {
    mocks.steps.prepareWorkspaceAutomationStep.mockResolvedValue(ready(["use_github_repository"]));
    mocks.steps.startRepositoryAgentStep.mockResolvedValue({
      ok: true,
      start: { sandboxId: "sbx-1", gitlabContext: null },
      toolSpecs: [
        { name: "gitHistory", description: "", inputJsonSchema: {} },
        { name: "read", description: "", inputJsonSchema: {} },
      ],
      state: stateAfter(),
    });
    mocks.steps.executeRepositoryAgentToolStep.mockResolvedValueOnce({
      ok: false,
      message: "workspace_automation_run_cancelled",
      todos: [],
      cancelled: true,
    });
    mocks.steps.failRepositoryAgentStep.mockResolvedValue({
      ok: false,
      message: "workspace_automation_run_cancelled",
      state: stateAfter(),
      cancelled: true,
    });

    await workspaceAutomationExecutionWorkflow(event);

    expect(mocks.steps.executeRepositoryAgentToolStep).toHaveBeenCalledTimes(1);
    expect(mocks.steps.finishRepositoryAgentStep).not.toHaveBeenCalled();
    expect(mocks.steps.failRepositoryAgentStep).toHaveBeenCalledWith(
      expect.objectContaining({ sandboxId: "sbx-1", cancelled: true }),
    );
  });

  it("waits for GitHub jobs with durable sleeps between status steps", async () => {
    mocks.steps.prepareWorkspaceAutomationStep.mockResolvedValue(ready(["run_github_workflows"]));
    mocks.steps.startGithubWorkflowsStep.mockResolvedValue({
      ok: "waiting",
      jobId: "job-1",
      operatorNote: null,
      state: stateAfter(),
    });
    mocks.steps.pollGithubWorkflowsJobStep
      .mockResolvedValueOnce("pending")
      .mockResolvedValueOnce("pending")
      .mockResolvedValueOnce("terminal");
    mocks.steps.finishGithubWorkflowsStep.mockResolvedValue({
      ok: true,
      output: { status: "succeeded" },
      state: stateAfter("run_github_workflows"),
    });

    await workspaceAutomationExecutionWorkflow(event);

    expect(mocks.steps.pollGithubWorkflowsJobStep).toHaveBeenCalledTimes(3);
    expect(mocks.sleep).toHaveBeenCalledTimes(2);
    expect(mocks.steps.finishGithubWorkflowsStep).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: "job-1", operatorNote: null }),
    );
    expect(mocks.steps.completeWorkspaceAutomationStep).toHaveBeenCalledWith(
      expect.objectContaining({ state: stateAfter("run_github_workflows") }),
    );
  });
});
