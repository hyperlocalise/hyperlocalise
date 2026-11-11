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

import { guidelineContextEvents, type GuidelineRetrievalTrace } from "./guideline-context-events";

const included: GuidelineRetrievalTrace = {
  localeCount: 2,
  result: "ok",
  errorCode: null,
  mandatoryIncludedCount: 1,
  mandatoryOmittedCount: 0,
  passageCount: 3,
  passageDocumentCount: 1,
  searchAvailable: true,
  includedTitles: ["Brand guide", "French style"],
};

describe("guidelineContextEvents", () => {
  it("records all five steps when retrieval succeeds", () => {
    expect(
      guidelineContextEvents({ enabled: true, trace: included }).map((event) => event.payload),
    ).toEqual([
      { step: "flag", enabled: true },
      { step: "retrieve", status: "called", localeCount: 2 },
      {
        step: "result",
        status: "ok",
        code: null,
        titles: ["Brand guide", "French style"],
      },
      { step: "mandatory", status: "recorded", includedCount: 1, omittedCount: 0 },
      {
        step: "passages",
        status: "recorded",
        passageCount: 3,
        documentCount: 1,
        searchAvailable: true,
      },
    ]);
  });

  it("skips the later steps when guidelines are off", () => {
    expect(
      guidelineContextEvents({ enabled: false, trace: included }).map((event) => event.payload),
    ).toEqual([
      { step: "flag", enabled: false },
      { step: "retrieve", status: "skipped", localeCount: 0 },
      { step: "result", status: "skipped", code: null, titles: [] },
      { step: "mandatory", status: "skipped", includedCount: 0, omittedCount: 0 },
      {
        step: "passages",
        status: "skipped",
        passageCount: 0,
        documentCount: 0,
        searchAvailable: false,
      },
    ]);
  });

  it("skips document counts when retrieval does not succeed", () => {
    const statuses = guidelineContextEvents({
      enabled: true,
      trace: { ...included, result: "timeout", errorCode: null, searchAvailable: false },
    }).map((event) => event.payload);
    expect(statuses[2]).toEqual({ step: "result", status: "timeout", code: null, titles: [] });
    expect(statuses[3]).toMatchObject({ step: "mandatory", status: "skipped" });
    expect(statuses[4]).toMatchObject({ step: "passages", status: "skipped" });
  });
});
