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
import { describe, expect, it } from "vite-plus/test";

import { mergeLiveAndScanFormatChecks } from "./merge-format-checks";

describe("mergeLiveAndScanFormatChecks", () => {
  it("keeps scan findings when live has not run", () => {
    expect(
      mergeLiveAndScanFormatChecks(
        [],
        [
          {
            id: "qa-not-localized",
            label: "Translation",
            status: "fail",
            message: "Target value is empty.",
            category: "qa",
          },
        ],
      ),
    ).toEqual([expect.objectContaining({ id: "qa-not-localized" })]);
  });

  it("prefers live checks for the same family", () => {
    const merged = mergeLiveAndScanFormatChecks(
      [
        {
          id: "qa-not-localized",
          label: "Translation",
          status: "fail",
          message: "Target value is empty.",
          category: "qa",
        },
      ],
      [
        {
          id: "qa-not-localized",
          label: "Translation",
          status: "fail",
          message: "From last scan",
          category: "qa",
        },
      ],
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]?.message).toBe("Target value is empty.");
  });

  it("drops scan placeholder findings when live format checks ran", () => {
    const merged = mergeLiveAndScanFormatChecks(
      [
        {
          id: "format-parity",
          label: "Placeholders",
          status: "pass",
          message: "Placeholders match.",
          category: "placeholder",
        },
      ],
      [
        {
          id: "scan-placeholder-mismatch",
          label: "Placeholders",
          status: "fail",
          message: "Target is missing placeholders ({name}).",
          category: "placeholder",
        },
      ],
    );

    expect(merged.map((check) => check.id)).toEqual(["format-parity"]);
  });

  it("keeps scan findings when go-svc is unavailable", () => {
    const merged = mergeLiveAndScanFormatChecks(
      [
        {
          id: "validation-unavailable",
          label: "Validation",
          status: "warn",
          message: "Could not reach validation.",
          category: "qa",
        },
      ],
      [
        {
          id: "qa-same-as-source",
          label: "Same as source",
          status: "warn",
          message: "Target value matches source.",
          category: "qa",
        },
      ],
    );

    expect(merged.map((check) => check.id)).toEqual([
      "validation-unavailable",
      "qa-same-as-source",
    ]);
  });
});
