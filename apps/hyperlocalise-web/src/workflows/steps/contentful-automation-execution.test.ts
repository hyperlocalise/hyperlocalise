import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { err, ok } from "@/lib/primitives/result/results";

const { executeContentfulAutomationMock } = vi.hoisted(() => ({
  executeContentfulAutomationMock: vi.fn(),
}));

vi.mock("@/lib/contentful/automation-executor", () => ({
  executeContentfulAutomation: executeContentfulAutomationMock,
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
    executeContentfulAutomationMock.mockResolvedValueOnce(ok({ runId: "run-1" }));

    const result = await executeContentfulAutomationStep(event);

    expect(result).toEqual({
      ok: true,
      value: { runId: "run-1" },
    });
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect("map" in result).toBe(false);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(executeContentfulAutomationMock).toHaveBeenCalledWith(event);
  });

  it("returns a plain serializable object when automation reports an expected error", async () => {
    executeContentfulAutomationMock.mockResolvedValueOnce(
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
    expect(executeContentfulAutomationMock).toHaveBeenCalledWith(event);
  });

  it("rethrows unexpected executor failures", async () => {
    executeContentfulAutomationMock.mockRejectedValueOnce(new Error("database unavailable"));

    await expect(executeContentfulAutomationStep(event)).rejects.toThrow("database unavailable");
  });
});
