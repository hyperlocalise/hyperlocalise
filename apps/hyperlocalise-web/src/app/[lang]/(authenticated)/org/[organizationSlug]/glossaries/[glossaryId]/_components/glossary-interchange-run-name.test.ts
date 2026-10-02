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
import { createIntl, createIntlCache } from "react-intl";
import { describe, expect, it } from "vite-plus/test";

import type { GlossaryInterchangeRun } from "@/lib/go-svc/go-svc-client.types";

import { formatGlossaryInterchangeRunName } from "./glossary-interchange-run-name";

const intl = createIntl({ locale: "en-US", messages: {} }, createIntlCache());

function run(overrides: Partial<GlossaryInterchangeRun> = {}): GlossaryInterchangeRun {
  return {
    id: "run_1",
    operation: "import",
    status: "completed",
    format: "csv",
    mode: "merge",
    sourceFilename: null,
    resultFilename: null,
    counts: {},
    createdAt: "2026-10-01T15:04:05.000Z",
    ...overrides,
  };
}

describe("formatGlossaryInterchangeRunName", () => {
  it("prefers the import source filename when present", () => {
    expect(
      formatGlossaryInterchangeRunName(
        run({
          operation: "import",
          sourceFilename: " glossary.csv ",
          resultFilename: "ignored.csv",
        }),
        intl,
      ),
    ).toBe("Import · glossary.csv");
  });

  it("prefers the export result filename when present", () => {
    expect(
      formatGlossaryInterchangeRunName(
        run({
          operation: "export",
          sourceFilename: "ignored.csv",
          resultFilename: " glossary-export.xlsx ",
        }),
        intl,
      ),
    ).toBe("Export · glossary-export.xlsx");
  });

  it("falls back to a timestamp name when the filename is blank", () => {
    const timestamp = intl.formatDate(new Date("2026-10-01T15:04:05.000Z"), {
      dateStyle: "medium",
      timeStyle: "short",
    });

    expect(
      formatGlossaryInterchangeRunName(run({ operation: "import", sourceFilename: "  " }), intl),
    ).toBe(`Import · ${timestamp}`);
    expect(
      formatGlossaryInterchangeRunName(
        run({ operation: "export", sourceFilename: null, resultFilename: null }),
        intl,
      ),
    ).toBe(`Export · ${timestamp}`);
  });
});
