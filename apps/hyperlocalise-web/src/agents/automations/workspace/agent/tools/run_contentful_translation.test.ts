import { describe, expect, it } from "vite-plus/test";

import type {
  WorkspaceAutomationRecord,
  WorkspaceAutomationRunRecord,
} from "@/lib/agents/workspace-automations";

import type { WorkspaceOrchestratorSession } from "../context";
import {
  createRunContentfulTranslationTool,
  resolveContentfulEntryId,
  resolveContentfulEntryIdForExecution,
} from "./run_contentful_translation";

function session(input: {
  inputSnapshot?: Record<string, unknown>;
  toolConfigEntryId?: string;
  automationName?: string;
}): WorkspaceOrchestratorSession {
  const automation = {
    id: "automation-1",
    organizationId: "org-1",
    authorUserId: null,
    status: "active",
    name: input.automationName ?? "Translate Contentful article",
    instructions: "",
    triggerConfig: { mode: "contentful" },
    repositoryTarget: { kind: "none" },
    toolConfig: {
      contentful: {
        enabled: true,
        connectionId: "00000000-0000-4000-8000-000000000001",
        projectId: "00000000-0000-4000-8000-000000000002",
        sourceLocale: "en",
        targetLocales: ["fr-FR"],
        contentTypeIds: [],
        fieldMode: "auto",
        overwriteDraftLocales: false,
        runQa: true,
        writeDrafts: true,
        entryId: input.toolConfigEntryId,
      },
    },
    configVersion: 1,
    nextRunAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } satisfies WorkspaceAutomationRecord;

  const run = {
    id: "run-1",
    automationId: automation.id,
    organizationId: automation.organizationId,
    triggerSource: "contentful",
    status: "queued",
    inputSnapshot: input.inputSnapshot ?? {},
    outputSummary: {},
    error: null,
    githubRepositoryAutomationJobId: null,
    idempotencyKey: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } satisfies WorkspaceAutomationRunRecord;

  return {
    organizationId: automation.organizationId,
    automation,
    run,
    plan: { tools: ["run_contentful_translation"] },
    repository: null,
    composedInstructions: "",
    stepResults: {},
    terminalStatus: null,
    terminalError: null,
  };
}

describe("resolveContentfulEntryId", () => {
  it("prefers the webhook snapshot entry ID over automation config", () => {
    const resolved = resolveContentfulEntryId(
      session({
        inputSnapshot: { entryId: "entry-from-webhook" },
        toolConfigEntryId: "Translate Contentful article",
      }),
    );

    expect(resolved).toBe("entry-from-webhook");
  });
});

describe("resolveContentfulEntryIdForExecution", () => {
  it("ignores agent overrides when the trigger already provided an entry ID", () => {
    const resolved = resolveContentfulEntryIdForExecution(
      session({
        inputSnapshot: { entryId: "entry-from-webhook" },
      }),
      "Translate Contentful article",
    );

    expect(resolved).toBe("entry-from-webhook");
  });

  it("falls back to the agent-provided entry ID when none was preset", () => {
    const resolved = resolveContentfulEntryIdForExecution(
      session({ inputSnapshot: {} }),
      "entry-from-agent",
    );

    expect(resolved).toBe("entry-from-agent");
  });
});

describe("createRunContentfulTranslationTool", () => {
  it("binds the webhook entry ID in the tool description when the trigger provided one", () => {
    const tool = createRunContentfulTranslationTool(
      session({
        inputSnapshot: { entryId: "entry-from-webhook" },
      }),
    );

    expect(tool.description).toContain("entry-from-webhook");
  });
});
