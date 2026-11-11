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

import {
  humanizeRunSummaryKey,
  isIsoDateTime,
  resolveRunHeadline,
  runHasDetails,
} from "./workspace-automation-run-summary";

describe("humanizeRunSummaryKey", () => {
  it("reads camel case and snake case keys as words", () => {
    expect(humanizeRunSummaryKey("createNativeTmsJob")).toBe("Create native tms job");
    expect(humanizeRunSummaryKey("create_native_tms_job")).toBe("Create native tms job");
    expect(humanizeRunSummaryKey("total")).toBe("Total");
  });
});

describe("resolveRunHeadline", () => {
  it("prefers the error message", () => {
    expect(
      resolveRunHeadline({
        error: { message: "Model response did not call create_issue." },
        outputSummary: { step: { summary: "Listed issues" } },
      }),
    ).toBe("Model response did not call create_issue.");
  });

  it("finds the first readable sentence at any depth", () => {
    expect(
      resolveRunHeadline({
        error: null,
        outputSummary: {
          orchestratorEnqueuedAt: "2026-10-05T12:40:37.831Z",
          orchestratorStepResults: { use_github_repository: { digest: "No output." } },
        },
      }),
    ).toBe("No output.");
    expect(
      resolveRunHeadline({ error: null, outputSummary: { issues: [{ title: "README added" }] } }),
    ).toBe("README added");
  });

  it("returns null when nothing is written for a reader", () => {
    expect(resolveRunHeadline({ error: null, outputSummary: { validatedFiles: 12 } })).toBeNull();
    expect(resolveRunHeadline({ error: null, outputSummary: { summary: { open: 0 } } })).toBeNull();
  });
});

describe("runHasDetails", () => {
  it("is false only when both the summary and the error are empty", () => {
    expect(runHasDetails({ error: null, outputSummary: {} })).toBe(false);
    expect(runHasDetails({ error: { message: "x" }, outputSummary: {} })).toBe(true);
    expect(runHasDetails({ error: null, outputSummary: { a: 1 } })).toBe(true);
  });
});

describe("isIsoDateTime", () => {
  it("accepts full timestamps only", () => {
    expect(isIsoDateTime("2026-10-05T12:40:37.831Z")).toBe(true);
    expect(isIsoDateTime("2026-10-05")).toBe(false);
    expect(isIsoDateTime("job_2026")).toBe(false);
  });
});
