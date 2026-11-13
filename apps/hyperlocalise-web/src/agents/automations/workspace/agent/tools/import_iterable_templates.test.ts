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

import type {
  WorkspaceAutomationRecord,
  WorkspaceAutomationRunRecord,
} from "@/lib/agents/workspace-automation-types";

import type { WorkspaceOrchestratorSession } from "../context";
import { createImportIterableTemplatesTool } from "./import_iterable_templates";

const mocks = vi.hoisted(() => ({
  runImportIterableTemplates: vi.fn(),
  updateWorkspaceAutomationRun: vi.fn(),
}));

vi.mock("@/lib/iterable/import-iterable-templates", () => ({
  runImportIterableTemplates: (...args: unknown[]) => mocks.runImportIterableTemplates(...args),
}));

vi.mock("@/lib/agents/workspace-automations", () => ({
  updateWorkspaceAutomationRun: (...args: unknown[]) => mocks.updateWorkspaceAutomationRun(...args),
}));

function iterableConfig(
  overrides: Partial<NonNullable<WorkspaceAutomationRecord["toolConfig"]["iterable"]>> = {},
) {
  return {
    enabled: true,
    sourceLocale: "en",
    templateIds: ["tmpl-1"],
    snippetIds: [],
    existingTranslationPolicy: "seed_empty" as const,
    ...overrides,
  };
}

function session(
  overrides: {
    toolConfig?: WorkspaceAutomationRecord["toolConfig"];
    outputSummary?: Record<string, unknown>;
  } = {},
): WorkspaceOrchestratorSession {
  const automation = {
    id: "automation-1",
    organizationId: "org-1",
    authorUserId: "user-1",
    status: "active",
    name: "Iterable templates",
    instructions: "",
    projectId: "project-1",
    triggerConfig: {
      mode: "scheduled",
      schedule: { cadence: "daily", hourUtc: 9, timezone: "UTC" },
    },
    repositoryTarget: { kind: "none" },
    toolConfig: overrides.toolConfig ?? { iterable: iterableConfig() },
    model: "openai/gpt-6-luna",
    configVersion: 1,
    nextRunAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } satisfies WorkspaceAutomationRecord;

  const run = {
    id: "run-1",
    automationId: automation.id,
    organizationId: automation.organizationId,
    triggerSource: "scheduled",
    status: "running",
    inputSnapshot: {},
    outputSummary: overrides.outputSummary ?? {},
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
    plan: { tools: ["import_iterable_templates"] },
    repository: null,
    composedInstructions: "",
    stepResults: {},
    terminalStatus: null,
    terminalError: null,
  };
}

const toolOptions = { toolCallId: "call-1", messages: [], context: {} };

describe("createImportIterableTemplatesTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateWorkspaceAutomationRun.mockResolvedValue(undefined);
  });

  it("rejects when Iterable import is not configured", async () => {
    await expect(
      createImportIterableTemplatesTool(session({ toolConfig: {} })).execute!({}, toolOptions),
    ).rejects.toThrow("import_iterable_templates_not_configured");
    await expect(
      createImportIterableTemplatesTool(
        session({
          toolConfig: {
            iterable: iterableConfig({ enabled: false }),
          },
        }),
      ).execute!({}, toolOptions),
    ).rejects.toThrow("import_iterable_templates_not_configured");
    expect(mocks.runImportIterableTemplates).not.toHaveBeenCalled();
  });

  it("returns a persisted import result without calling Iterable again", async () => {
    const current = session({
      outputSummary: { importIterableTemplates: { imported: 2, skipped: 1, failed: 0 } },
    });

    await expect(
      createImportIterableTemplatesTool(current).execute!({}, toolOptions),
    ).resolves.toEqual({
      imported: 2,
      skipped: 1,
      failed: 0,
    });

    expect(current.stepResults.import_iterable_templates).toEqual({
      imported: 2,
      skipped: 1,
      failed: 0,
    });
    expect(mocks.runImportIterableTemplates).not.toHaveBeenCalled();
    expect(mocks.updateWorkspaceAutomationRun).not.toHaveBeenCalled();
  });

  it("marks the run failed when every template import fails", async () => {
    mocks.runImportIterableTemplates.mockResolvedValue({
      imported: 0,
      skipped: 0,
      failed: 3,
      translationsImported: 0,
      translationsSkipped: 0,
      unmappedProjectTargets: [],
      warnings: [],
    });
    const current = session();

    await expect(
      createImportIterableTemplatesTool(current).execute!({ summary: "  weekly  " }, toolOptions),
    ).resolves.toEqual({
      imported: 0,
      skipped: 0,
      failed: 3,
      translationsImported: 0,
      translationsSkipped: 0,
      unmappedProjectTargets: [],
      warnings: [],
      summary: "weekly",
    });

    expect(current.terminalStatus).toBe("failed");
    expect(current.terminalError).toBe("iterable_import_failed");
    expect(mocks.runImportIterableTemplates).toHaveBeenCalledWith({
      organizationId: "org-1",
      automation: current.automation,
    });
    expect(mocks.updateWorkspaceAutomationRun).toHaveBeenCalledWith({
      runId: "run-1",
      organizationId: "org-1",
      outputSummary: {
        importIterableTemplates: {
          imported: 0,
          skipped: 0,
          failed: 3,
          translationsImported: 0,
          translationsSkipped: 0,
          unmappedProjectTargets: [],
          warnings: [],
          summary: "weekly",
        },
      },
    });
  });

  it("keeps a partial import from failing the run", async () => {
    mocks.runImportIterableTemplates.mockResolvedValue({
      imported: 1,
      skipped: 0,
      failed: 2,
      translationsImported: 4,
      translationsSkipped: 1,
      unmappedProjectTargets: ["ja-JP"],
      warnings: ["locale rejected"],
    });
    const current = session();

    await expect(
      createImportIterableTemplatesTool(current).execute!({}, toolOptions),
    ).resolves.toEqual({
      imported: 1,
      skipped: 0,
      failed: 2,
      translationsImported: 4,
      translationsSkipped: 1,
      unmappedProjectTargets: ["ja-JP"],
      warnings: ["locale rejected"],
    });
    expect(current.terminalStatus).toBeNull();
    expect(current.terminalError).toBeNull();
  });
});
