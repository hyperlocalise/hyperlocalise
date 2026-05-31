import { describe, expect, it } from "vite-plus/test";

import { isErr, isOk } from "@/lib/primitives/result/results";

import { validateJobLocalesAgainstProject } from "./project-job-locales";

describe("validateJobLocalesAgainstProject", () => {
  it("accepts canonical native job locales within project scope", () => {
    const result = validateJobLocalesAgainstProject(
      {
        source: "native",
        sourceLocale: "en-US",
        targetLocales: ["fr-FR", "de-DE"],
      },
      { sourceLocale: "en-us", targetLocales: ["fr-fr"] },
    );

    expect(isOk(result)).toBe(true);
  });

  it("rejects native job target outside project scope", () => {
    const result = validateJobLocalesAgainstProject(
      {
        source: "native",
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
      },
      { sourceLocale: "en-US", targetLocales: ["ja-JP"] },
    );

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("job_target_locale_not_in_project");
    }
  });

  it("uses exact provider locale IDs for external TMS projects", () => {
    const valid = validateJobLocalesAgainstProject(
      {
        source: "external_tms",
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
      },
      { sourceLocale: "en-US", targetLocales: ["fr-FR"] },
    );

    expect(isOk(valid)).toBe(true);

    const mismatch = validateJobLocalesAgainstProject(
      {
        source: "external_tms",
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
      },
      { sourceLocale: "en", targetLocales: ["fr-FR"] },
    );

    expect(isErr(mismatch)).toBe(true);
  });
});
