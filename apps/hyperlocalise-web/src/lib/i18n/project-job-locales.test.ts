import { describe, expect, it } from "vite-plus/test";

import { validateJobLocalesAgainstProject } from "./project-job-locales";

describe("validateJobLocalesAgainstProject", () => {
  it("accepts canonical native job locales within project scope", () => {
    expect(
      validateJobLocalesAgainstProject(
        {
          source: "native",
          sourceLocale: "en-US",
          targetLocales: ["fr-FR", "de-DE"],
        },
        { sourceLocale: "en-us", targetLocales: ["fr-fr"] },
      ),
    ).toEqual({ ok: true });
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

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("job_target_locale_not_in_project");
    }
  });

  it("uses exact provider locale IDs for external TMS projects", () => {
    expect(
      validateJobLocalesAgainstProject(
        {
          source: "external_tms",
          sourceLocale: "en-US",
          targetLocales: ["fr-FR"],
        },
        { sourceLocale: "en-US", targetLocales: ["fr-FR"] },
      ),
    ).toEqual({ ok: true });

    const mismatch = validateJobLocalesAgainstProject(
      {
        source: "external_tms",
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
      },
      { sourceLocale: "en", targetLocales: ["fr-FR"] },
    );

    expect(mismatch.ok).toBe(false);
  });
});
