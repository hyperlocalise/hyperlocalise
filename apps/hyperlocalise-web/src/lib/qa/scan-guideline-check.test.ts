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

import { DEFAULT_QA_POLICY } from "./qa-policy";
import {
  mapGuidelineFindingToQaCheck,
  runScanGuidelineChecks,
  type ScanGuidelineSegment,
} from "./scan-guideline-check";
import { GoSvcClientError } from "@/lib/go-svc/go-svc-request";

const { internalCheck, resolveWorkspaceKnowledgeFlag } = vi.hoisted(() => ({
  internalCheck: vi.fn(),
  resolveWorkspaceKnowledgeFlag: vi.fn(async () => true),
}));

const enabledPolicy = {
  ...DEFAULT_QA_POLICY,
  guideline: { enabled: true, severity: "warning" as const },
};

function segment(id: string, overrides: Partial<ScanGuidelineSegment> = {}): ScanGuidelineSegment {
  return {
    translationKeyId: id,
    key: id,
    sourceText: "Hello",
    targetText: "Bonjour",
    targetLocale: "fr-FR",
    translationId: null,
    sourcePath: null,
    ...overrides,
  };
}

vi.mock("@/lib/go-svc/go-svc-server-client", () => ({
  createGoSvcServerClient: () => ({
    guidelines: { internalCheck },
  }),
}));

vi.mock("@/lib/flags/workspace-flags", () => ({
  resolveWorkspaceKnowledgeFlag,
}));

describe("runScanGuidelineChecks", () => {
  beforeEach(() => {
    internalCheck.mockReset();
    resolveWorkspaceKnowledgeFlag.mockReset();
    resolveWorkspaceKnowledgeFlag.mockResolvedValue(true);
  });

  it("skips API calls when guideline is disabled", async () => {
    const result = await runScanGuidelineChecks({
      organizationId: "org",
      projectId: "proj",
      sourceLocale: "en-US",
      policy: DEFAULT_QA_POLICY,
      segments: [
        {
          translationKeyId: "key-1",
          key: "hello",
          sourceText: "Hello",
          targetText: "Bonjour",
          targetLocale: "fr-FR",
          translationId: null,
          sourcePath: null,
        },
      ],
    });
    expect(result.ok).toBe(true);
    expect(internalCheck).not.toHaveBeenCalled();
    expect(resolveWorkspaceKnowledgeFlag).not.toHaveBeenCalled();
  });

  it("skips API calls when Knowledge is not enabled", async () => {
    resolveWorkspaceKnowledgeFlag.mockResolvedValueOnce(false);
    const result = await runScanGuidelineChecks({
      organizationId: "org",
      projectId: "proj",
      sourceLocale: "en-US",
      policy: enabledPolicy,
      segments: [segment("key-1")],
    });
    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
    expect(internalCheck).not.toHaveBeenCalled();
    expect(resolveWorkspaceKnowledgeFlag).toHaveBeenCalledWith({ organizationId: "org" });
  });

  it("skips API calls for whitespace-only targets", async () => {
    const result = await runScanGuidelineChecks({
      organizationId: "org",
      projectId: "proj",
      sourceLocale: "en-US",
      policy: enabledPolicy,
      segments: [segment("key-1", { targetText: "   " })],
    });
    expect(internalCheck).not.toHaveBeenCalled();
    expect(result.findings).toEqual([]);
  });

  it("halts after a limit error", async () => {
    internalCheck.mockRejectedValueOnce(
      new GoSvcClientError({
        code: "guideline_check_limit_reached",
        message: "limit",
        status: 402,
      }),
    );
    const result = await runScanGuidelineChecks({
      organizationId: "org",
      projectId: "proj",
      sourceLocale: "en-US",
      policy: enabledPolicy,
      segments: [segment("key-1")],
    });
    expect(result.ok).toBe(false);
    expect(result.haltCode).toBe("guideline_check_limit_reached");
    expect(result.findings).toEqual([]);
  });

  it("maps explained findings from internalCheck", async () => {
    internalCheck.mockResolvedValueOnce({
      findings: [
        {
          segmentId: "key-1",
          field: "target",
          severity: "error",
          start: 5,
          end: 7,
          message: "Use vous",
          suggestion: "vous",
          passageId: "p1",
        },
      ],
      passages: [],
      searchAvailable: true,
      model: "openai/gpt-6-luna",
    });
    const result = await runScanGuidelineChecks({
      organizationId: "org",
      projectId: "proj",
      sourceLocale: "en-US",
      policy: enabledPolicy,
      segments: [segment("key-1", { targetText: "Peux-tu aider ?" })],
    });
    expect(result.ok).toBe(true);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.check).toMatchObject({
      checkType: "guideline",
      severity: "warning",
      message: "Use vous Suggestion: vous",
      relatedTokens: ["tu", "vous"],
    });
  });

  it("keeps canned classifier findings when explain did not run", async () => {
    const targetText = "Peux-tu aider ?";
    internalCheck.mockResolvedValueOnce({
      findings: [
        {
          segmentId: "key-1",
          field: "target",
          severity: "warning",
          start: 0,
          end: targetText.length,
          message: "This text may not match a project guideline.",
          passageId: "p1",
          reasoningAvailable: true,
        },
      ],
      passages: [],
      searchAvailable: true,
      model: "typesafe-ai/jev",
    });
    const result = await runScanGuidelineChecks({
      organizationId: "org",
      projectId: "proj",
      sourceLocale: "en-US",
      policy: enabledPolicy,
      segments: [segment("key-1", { targetText })],
    });
    expect(result.ok).toBe(true);
    expect(result.findings[0]?.check).toMatchObject({
      checkType: "guideline",
      message: "This text may not match a project guideline.",
      relatedTokens: [],
    });
  });

  it("sends one internalCheck per locale batch", async () => {
    internalCheck.mockResolvedValue({
      findings: [],
      passages: [],
      searchAvailable: true,
      model: "typesafe-ai/jev",
    });
    await runScanGuidelineChecks({
      organizationId: "org",
      projectId: "proj",
      sourceLocale: "en-US",
      policy: enabledPolicy,
      segments: [
        segment("fr-1", { targetLocale: "fr-FR" }),
        segment("de-1", { targetLocale: "de-DE", targetText: "Hallo" }),
      ],
    });
    expect(internalCheck).toHaveBeenCalledTimes(2);
    expect(
      internalCheck.mock.calls
        .map((call) => call[1].targetLocale ?? "")
        .toSorted((left, right) => left.localeCompare(right)),
    ).toEqual([
      "de-DE",
      "fr-FR",
    ]);
  });
});

describe("mapGuidelineFindingToQaCheck", () => {
  it("maps guideline severity from policy", () => {
    const check = mapGuidelineFindingToQaCheck(
      {
        segmentId: "key",
        field: "target",
        severity: "error",
        start: 5,
        end: 7,
        message: "Use vous",
        passageId: "p1",
      },
      "Peux-tu aider ?",
      "warning",
    );
    expect(check?.severity).toBe("warning");
    expect(check?.checkType).toBe("guideline");
    expect(check?.message).toBe("Use vous");
    expect(check?.relatedTokens).toEqual(["tu"]);
  });

  it("drops source-field findings", () => {
    expect(
      mapGuidelineFindingToQaCheck(
        {
          segmentId: "key",
          field: "source",
          severity: "warning",
          start: 0,
          end: 5,
          message: "Source issue",
          passageId: "p1",
        },
        "Bonjour",
        "warning",
      ),
    ).toBeNull();
  });
});
