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
import { createPushSanityTranslationsTool } from "./push_sanity_translations";

const mocks = vi.hoisted(() => ({
  runPushSanityTranslations: vi.fn(),
  updateWorkspaceAutomationRun: vi.fn(),
}));

vi.mock("@/lib/sanity/push-sanity-translations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sanity/push-sanity-translations")>();
  return {
    ...actual,
    runPushSanityTranslations: (...args: unknown[]) => mocks.runPushSanityTranslations(...args),
  };
});

vi.mock("@/lib/agents/workspace-automations", () => ({
  updateWorkspaceAutomationRun: (...args: unknown[]) => mocks.updateWorkspaceAutomationRun(...args),
}));

function session(
  overrides: {
    toolConfig?: WorkspaceAutomationRecord["toolConfig"];
    outputSummary?: Record<string, unknown>;
    inputSnapshot?: Record<string, unknown>;
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
    inputSnapshot: overrides.inputSnapshot ?? {},
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
    plan: { tools: ["push_sanity_translations"] },
    repository: null,
    composedInstructions: "",
    stepResults: {},
    terminalStatus: null,
    terminalError: null,
  };
}

const toolOptions = { toolCallId: "call-1", messages: [], context: {} };

describe("createPushSanityTranslationsTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateWorkspaceAutomationRun.mockResolvedValue(undefined);
  });

  it("rejects when Sanity push is not configured", async () => {
    await expect(
      createPushSanityTranslationsTool(session({ toolConfig: {} })).execute!({}, toolOptions),
    ).rejects.toThrow("push_sanity_translations_not_configured");
    expect(mocks.runPushSanityTranslations).not.toHaveBeenCalled();
  });

  it("returns a persisted push result without calling Sanity again", async () => {
    const current = session({
      outputSummary: { pushSanityTranslations: { pushedLocales: 2, failedLocales: 0 } },
    });

    await expect(
      createPushSanityTranslationsTool(current).execute!({}, toolOptions),
    ).resolves.toEqual({ pushedLocales: 2, failedLocales: 0 });

    expect(current.stepResults.push_sanity_translations).toEqual({
      pushedLocales: 2,
      failedLocales: 0,
    });
    expect(mocks.runPushSanityTranslations).not.toHaveBeenCalled();
    expect(mocks.updateWorkspaceAutomationRun).not.toHaveBeenCalled();
  });

  it("marks the run failed when every locale push fails", async () => {
    mocks.runPushSanityTranslations.mockResolvedValue({
      pushedLocales: 0,
      failedLocales: 2,
      skipped: [],
    });
    const current = session({
      inputSnapshot: { sourcePaths: ["sanity/abc123/production/page/home.json", ""] },
    });

    await expect(
      createPushSanityTranslationsTool(current).execute!({ summary: "  nightly  " }, toolOptions),
    ).resolves.toEqual({
      pushedLocales: 0,
      failedLocales: 2,
      skipped: [],
      summary: "nightly",
    });

    expect(current.terminalStatus).toBe("failed");
    expect(current.terminalError).toBe("sanity_push_failed");
    expect(mocks.runPushSanityTranslations).toHaveBeenCalledWith({
      organizationId: "org-1",
      automation: current.automation,
      sourcePaths: ["sanity/abc123/production/page/home.json"],
    });
    expect(mocks.updateWorkspaceAutomationRun).toHaveBeenCalledWith({
      runId: "run-1",
      organizationId: "org-1",
      outputSummary: {
        pushSanityTranslations: {
          pushedLocales: 0,
          failedLocales: 2,
          skipped: [],
          summary: "nightly",
        },
      },
    });
  });
});
