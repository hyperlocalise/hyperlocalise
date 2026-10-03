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
import { validateScanSegment } from "./scan-segment-validation";

const { validateSegment } = vi.hoisted(() => ({
  validateSegment: vi.fn(),
}));

vi.mock("@/lib/go-svc/go-svc-server-client", () => ({
  createGoSvcServerClient: () => ({
    qaReport: { validateSegment },
  }),
}));

const placeholderPolicy = {
  ...DEFAULT_QA_POLICY,
  format: { enabled: false, severity: "error" as const },
  placeholder_mismatch: { enabled: true, severity: "warning" as const },
};

describe("validateScanSegment", () => {
  beforeEach(() => {
    validateSegment.mockReset();
  });

  it("keeps Go placeholder failures when format checks are disabled", async () => {
    validateSegment.mockResolvedValue({
      checks: [
        {
          id: "format-missing-token",
          status: "fail",
          message: "placeholder parity mismatch: expected {name}, got ",
          category: "placeholder",
          relatedTokens: ["{name}"],
        },
        {
          id: "format-html-tag-mismatch",
          status: "fail",
          message: "html tag structure differs from source",
          category: "syntax",
        },
      ],
      skippedModes: [],
    });

    const { checks } = await validateScanSegment(
      {
        sourceText: "Hello {name}",
        targetText: "Hallo",
        targetLocale: "de-DE",
      },
      [],
      placeholderPolicy,
    );

    expect(checks).toEqual([
      expect.objectContaining({
        checkType: "placeholder_mismatch",
        severity: "warning",
        category: "placeholder",
        relatedTokens: ["{name}"],
      }),
    ]);
  });

  it("uses the TypeScript placeholder check when Go did not report one", async () => {
    validateSegment.mockResolvedValue({
      checks: [
        {
          id: "format-parity",
          status: "pass",
          message: "No placeholders or ICU blocks detected.",
          category: "placeholder",
        },
      ],
      skippedModes: [],
    });

    const { checks } = await validateScanSegment(
      {
        sourceText: "Hello {name}",
        targetText: "Hallo",
        targetLocale: "de-DE",
      },
      [],
      placeholderPolicy,
    );

    expect(checks).toEqual([
      expect.objectContaining({
        checkType: "placeholder_mismatch",
        severity: "warning",
        category: "placeholder",
      }),
    ]);
  });

  it("does not keep a Go placeholder failure under the format setting", async () => {
    validateSegment.mockResolvedValue({
      checks: [
        {
          id: "format-missing-token",
          status: "fail",
          message: "placeholder parity mismatch: expected {name}, got ",
          category: "placeholder",
        },
      ],
      skippedModes: [],
    });

    const { checks } = await validateScanSegment(
      {
        sourceText: "Hello {name}",
        targetText: "Hallo",
        targetLocale: "de-DE",
      },
      [],
      {
        ...DEFAULT_QA_POLICY,
        format: { enabled: true, severity: "error" },
        placeholder_mismatch: { enabled: false, severity: "warning" },
      },
    );

    expect(checks.some((check) => check.checkType === "placeholder_mismatch")).toBe(false);
    expect(checks.some((check) => check.checkType === "format")).toBe(false);
  });
});
