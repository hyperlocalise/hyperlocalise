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
import { describe, expect, it, vi } from "vite-plus/test";

import { DEFAULT_QA_POLICY } from "./qa-policy";
import { mapGuidelineFindingToQaCheck, runScanGuidelineChecks } from "./scan-guideline-check";
import { GoSvcClientError } from "@/lib/go-svc/go-svc-request";

const internalCheck = vi.fn();

vi.mock("@/lib/go-svc/go-svc-server-client", () => ({
  createGoSvcServerClient: () => ({
    guidelines: { internalCheck },
  }),
}));

describe("runScanGuidelineChecks", () => {
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
    expect(result.coveredKeyLocales).toEqual([]);
  });

  it("records coverage for whitespace-only targets without calling go-svc", async () => {
    const policy = {
      ...DEFAULT_QA_POLICY,
      guideline: { enabled: true, severity: "warning" as const },
    };
    const result = await runScanGuidelineChecks({
      organizationId: "org",
      projectId: "proj",
      sourceLocale: "en-US",
      policy,
      segments: [
        {
          translationKeyId: "key-1",
          key: "hello",
          sourceText: "Hello",
          targetText: "   ",
          targetLocale: "fr-FR",
          translationId: null,
          sourcePath: null,
        },
      ],
    });
    expect(internalCheck).not.toHaveBeenCalled();
    expect(result.coveredKeyLocales).toEqual([
      { translationKeyId: "key-1", targetLocale: "fr-FR" },
    ]);
  });

  it("halts after a limit error and keeps covered segments", async () => {
    internalCheck.mockRejectedValueOnce(
      new GoSvcClientError({
        code: "guideline_check_limit_reached",
        message: "limit",
        status: 402,
      }),
    );
    const policy = {
      ...DEFAULT_QA_POLICY,
      guideline: { enabled: true, severity: "warning" as const },
    };
    const result = await runScanGuidelineChecks({
      organizationId: "org",
      projectId: "proj",
      sourceLocale: "en-US",
      policy,
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
    expect(result.ok).toBe(false);
    expect(result.haltCode).toBe("guideline_check_limit_reached");
    expect(result.coveredKeyLocales).toEqual([]);
  });
});

describe("mapGuidelineFindingToQaCheck", () => {
  it("maps guideline severity from policy", () => {
    const check = mapGuidelineFindingToQaCheck(
      {
        segmentId: "key",
        field: "target",
        severity: "error",
        start: 0,
        end: 2,
        message: "Use vous",
        passageId: "p1",
      },
      "tu",
      "warning",
    );
    expect(check?.severity).toBe("warning");
    expect(check?.checkType).toBe("guideline");
  });
});
