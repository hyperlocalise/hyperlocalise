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
import { createImportSanityDocumentsTool } from "./import_sanity_documents";

const mocks = vi.hoisted(() => ({
  runImportSanityDocuments: vi.fn(),
  updateWorkspaceAutomationRun: vi.fn(),
}));

vi.mock("@/lib/sanity/import-sanity-documents", () => ({
  runImportSanityDocuments: (...args: unknown[]) => mocks.runImportSanityDocuments(...args),
}));

vi.mock("@/lib/agents/workspace-automations", () => ({
  updateWorkspaceAutomationRun: (...args: unknown[]) => mocks.updateWorkspaceAutomationRun(...args),
}));

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
    name: "Sanity documents",
    instructions: "",
    projectId: "project-1",
    triggerConfig: {
      mode: "scheduled",
      schedule: { cadence: "daily", hourUtc: 9, timezone: "UTC" },
    },
    repositoryTarget: { kind: "none" },
    toolConfig: overrides.toolConfig ?? {
      sanity: {
        enabled: true,
        workosUserId: "user-1",
        projectId: "abc123",
        dataset: "production",
        documentTypes: ["page"],
        documentTypeModes: {},
        localeCatalog: { documentType: "locale", tagField: "tag", titleField: "name" },
        languages: ["en", "de"],
        languagesByType: {},
        sourceLocale: "en",
        targetLocales: ["de"],
        includeDrafts: true,
        overwriteSanityDrafts: true,
        existingTranslationPolicy: "seed_empty",
      },
    },
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
    plan: { tools: ["import_sanity_documents"] },
    repository: null,
    composedInstructions: "",
    stepResults: {},
    terminalStatus: null,
    terminalError: null,
  };
}

const toolOptions = { toolCallId: "call-1", messages: [], context: {} };

describe("createImportSanityDocumentsTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateWorkspaceAutomationRun.mockResolvedValue(undefined);
  });

  it("rejects when Sanity import is not configured", async () => {
    await expect(
      createImportSanityDocumentsTool(session({ toolConfig: {} })).execute!({}, toolOptions),
    ).rejects.toThrow("import_sanity_documents_not_configured");
    await expect(
      createImportSanityDocumentsTool(
        session({
          toolConfig: {
            sanity: {
              enabled: false,
              documentTypes: [],
              documentTypeModes: {},
              localeCatalog: { documentType: "locale", tagField: "tag", titleField: "name" },
              languages: [],
              languagesByType: {},
              sourceLocale: "en",
              targetLocales: [],
              includeDrafts: true,
              overwriteSanityDrafts: true,
              existingTranslationPolicy: "seed_empty",
            },
          },
        }),
      ).execute!({}, toolOptions),
    ).rejects.toThrow("import_sanity_documents_not_configured");
    expect(mocks.runImportSanityDocuments).not.toHaveBeenCalled();
  });

  it("returns a persisted import result without calling Sanity again", async () => {
    const current = session({
      outputSummary: { importSanityDocuments: { imported: 2, skipped: 1, failed: 0 } },
    });

    await expect(
      createImportSanityDocumentsTool(current).execute!({}, toolOptions),
    ).resolves.toEqual({ imported: 2, skipped: 1, failed: 0 });

    expect(current.stepResults.import_sanity_documents).toEqual({
      imported: 2,
      skipped: 1,
      failed: 0,
    });
    expect(mocks.runImportSanityDocuments).not.toHaveBeenCalled();
    expect(mocks.updateWorkspaceAutomationRun).not.toHaveBeenCalled();
  });

  it("marks the run failed when every document import fails", async () => {
    mocks.runImportSanityDocuments.mockResolvedValue({
      imported: 0,
      skipped: 0,
      failed: 3,
    });
    const current = session();

    await expect(
      createImportSanityDocumentsTool(current).execute!({ summary: "  weekly  " }, toolOptions),
    ).resolves.toEqual({
      imported: 0,
      skipped: 0,
      failed: 3,
      summary: "weekly",
    });

    expect(current.terminalStatus).toBe("failed");
    expect(current.terminalError).toBe("sanity_import_failed");
    expect(mocks.runImportSanityDocuments).toHaveBeenCalledWith({
      organizationId: "org-1",
      automation: current.automation,
      workflowRunId: "run-1",
    });
    expect(mocks.updateWorkspaceAutomationRun).toHaveBeenCalledWith({
      runId: "run-1",
      organizationId: "org-1",
      outputSummary: {
        importSanityDocuments: {
          imported: 0,
          skipped: 0,
          failed: 3,
          summary: "weekly",
        },
      },
    });
  });
});
