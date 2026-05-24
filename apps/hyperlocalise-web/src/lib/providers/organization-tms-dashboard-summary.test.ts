import { describe, expect, it } from "vite-plus/test";

import { aggregateLocaleReadiness } from "./organization-tms-dashboard-summary.types";

describe("aggregateLocaleReadiness", () => {
  it("aggregates readiness counts per locale and prioritizes missing locales", () => {
    const rows = aggregateLocaleReadiness([
      { localeReadiness: { "fr-FR": "ready", "de-DE": "missing" } },
      { localeReadiness: { "fr-FR": "changed", "de-DE": "stale" } },
    ]);

    expect(rows).toEqual([
      {
        locale: "de-DE",
        ready: 0,
        missing: 2,
        changed: 0,
        fileCount: 2,
      },
      {
        locale: "fr-FR",
        ready: 1,
        missing: 0,
        changed: 1,
        fileCount: 2,
      },
    ]);
  });
});
