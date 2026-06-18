import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { err, ok } from "@/lib/primitives/result/results";

const { runContentfulAgentMock } = vi.hoisted(() => ({
  runContentfulAgentMock: vi.fn(),
}));

vi.mock("@/agents/automations/contentful/agent/run-contentful-agent", () => ({
  runContentfulAgent: runContentfulAgentMock,
}));

import { executeContentfulAutomationStep } from "./contentful-automation-execution";

const event = {
  contentfulTranslationRunId: "contentful-run-1",
  workspaceAutomationRunId: "workspace-run-1",
  organizationId: "org-1",
};

describe("executeContentfulAutomationStep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a plain serializable object when automation succeeds", async () => {
    runContentfulAgentMock.mockResolvedValueOnce(ok({ runId: "run-1" }));

    const result = await executeContentfulAutomationStep(event);

    expect(result).toEqual({
      ok: true,
      value: { runId: "run-1" },
    });
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect("map" in result).toBe(false);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(runContentfulAgentMock).toHaveBeenCalledWith(event);
  });

  it("returns a plain serializable object when automation reports an expected error", async () => {
    runContentfulAgentMock.mockResolvedValueOnce(
      err({
        code: "contentful_automation_failed",
        runId: "run-2",
        message: "No translatable fields were found",
      }),
    );

    const result = await executeContentfulAutomationStep(event);

    expect(result).toEqual({
      ok: false,
      error: {
        code: "contentful_automation_failed",
        runId: "run-2",
        message: "No translatable fields were found",
      },
    });
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect("map" in result).toBe(false);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(runContentfulAgentMock).toHaveBeenCalledWith(event);
  });

  it("rethrows unexpected executor failures", async () => {
    runContentfulAgentMock.mockRejectedValueOnce(new Error("database unavailable"));

    await expect(executeContentfulAutomationStep(event)).rejects.toThrow("database unavailable");
  });
});
