import { describe, expect, it } from "vite-plus/test";

import {
  buildJobsByLocaleFromRecords,
  buildNativeFileLocaleReadiness,
  fileNeedsAttentionFromReadiness,
  mapJobStatusToLocaleReadiness,
  parseJobTargetLocales,
} from "./native-locale-readiness";

describe("native-locale-readiness", () => {
  it("parses target locales from job payloads", () => {
    expect(parseJobTargetLocales({ targetLocales: ["fr-FR", "de-DE"] })).toEqual([
      "fr-FR",
      "de-DE",
    ]);
    expect(parseJobTargetLocales({})).toEqual([]);
  });

  it("maps job statuses to locale readiness", () => {
    expect(mapJobStatusToLocaleReadiness("succeeded")).toBe("ready");
    expect(mapJobStatusToLocaleReadiness("waiting_for_review")).toBe("needs_review");
    expect(mapJobStatusToLocaleReadiness("failed")).toBe("stale");
    expect(mapJobStatusToLocaleReadiness("running")).toBe("in_progress");
  });

  it("builds latest job status per locale", () => {
    const jobsByLocale = buildJobsByLocaleFromRecords([
      {
        status: "failed",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        inputPayload: { targetLocales: ["fr-FR"] },
      },
      {
        status: "succeeded",
        createdAt: new Date("2026-01-02T00:00:00.000Z"),
        inputPayload: { targetLocales: ["fr-FR", "de-DE"] },
      },
    ]);

    expect(jobsByLocale.get("fr-FR")?.status).toBe("succeeded");
    expect(jobsByLocale.get("de-DE")?.status).toBe("succeeded");
  });

  it("marks missing locales and attention states", () => {
    const readiness = buildNativeFileLocaleReadiness({
      targetLocales: ["fr-FR", "de-DE"],
      jobsByLocale: buildJobsByLocaleFromRecords([
        {
          status: "succeeded",
          createdAt: new Date("2026-01-02T00:00:00.000Z"),
          inputPayload: { targetLocales: ["fr-FR"] },
        },
      ]),
    });

    expect(readiness).toEqual({
      "fr-FR": "ready",
      "de-DE": "missing",
    });
    expect(fileNeedsAttentionFromReadiness(readiness)).toBe(true);
  });
});
