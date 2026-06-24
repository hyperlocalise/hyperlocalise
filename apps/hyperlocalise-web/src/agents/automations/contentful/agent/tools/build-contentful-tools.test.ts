import { describe, expect, it, vi } from "vite-plus/test";

import type { ContentfulManagementClient } from "@/lib/contentful/client";
import { ok } from "@/lib/primitives/result/results";

import { createContentfulAgentSession } from "../context";
import {
  buildContentfulAgentTools,
  CONTENTFUL_TRANSLATION_EXECUTOR_TOOL_NAME,
} from "./build-contentful-tools";

const mocks = vi.hoisted(() => ({
  executeContentfulAutomation: vi.fn(),
}));

vi.mock("@/lib/contentful/automation-executor", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/contentful/automation-executor")>();
  return {
    ...original,
    executeContentfulAutomation: mocks.executeContentfulAutomation,
  };
});

function createTestSession() {
  return createContentfulAgentSession({
    organizationId: "org_123",
    runId: "run_123",
    entryId: "entry-1",
    workspaceAutomationRunId: "workspace_run_123",
    projectId: "project_123",
    instructions: "Translate help center content.",
    sourceLocale: "en-US",
    targetLocales: ["fr-FR"],
    runQa: true,
    writeDrafts: true,
    overwriteDraftLocales: false,
    fieldConfig: {
      fieldMode: "configured",
      fieldsByContentType: { helpCenterArticle: ["title", "body"] },
    },
    client: {} as ContentfulManagementClient,
    translateStringJob: vi.fn() as never,
    projectName: "Help Center",
    projectTranslationContext: "Support articles",
  });
}

describe("buildContentfulAgentTools", () => {
  it("exposes run_translation as the executor tool", async () => {
    mocks.executeContentfulAutomation.mockResolvedValue(
      ok({
        runId: "run_123",
        fieldsDetected: 2,
        localeValuesWritten: 2,
        qaFindingCount: 0,
      }),
    );

    const session = createTestSession();
    const tools = buildContentfulAgentTools(session);
    const runTranslation = tools[CONTENTFUL_TRANSLATION_EXECUTOR_TOOL_NAME];

    if (!runTranslation?.execute) {
      throw new Error("run_translation tool is missing execute");
    }

    const result = await runTranslation.execute({}, { toolCallId: "test-tool-call", messages: [] });

    expect(mocks.executeContentfulAutomation).toHaveBeenCalledWith(
      {
        contentfulTranslationRunId: "run_123",
        workspaceAutomationRunId: "workspace_run_123",
        organizationId: "org_123",
      },
      { manageWorkspaceRunStatus: false },
    );
    expect(result).toEqual({
      runId: "run_123",
      fieldsDetected: 2,
      localeValuesWritten: 2,
      qaFindingCount: 0,
    });
    expect(session.executionResult).toEqual(result);
  });
});
