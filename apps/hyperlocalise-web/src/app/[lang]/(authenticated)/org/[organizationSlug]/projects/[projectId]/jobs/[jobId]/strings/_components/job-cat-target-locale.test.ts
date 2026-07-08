import { describe, expect, it } from "vite-plus/test";

import { createProviderBackedJobDetail } from "../../_components/job-detail.fixture";
import {
  resolveJobCatSelectableTargetLocales,
  selectJobCatTargetLocale,
} from "./job-cat-target-locale";

describe("resolveJobCatSelectableTargetLocales", () => {
  it("prefers external target locales for provider-backed jobs", () => {
    expect(
      resolveJobCatSelectableTargetLocales(
        createProviderBackedJobDetail({ externalTargetLocales: ["fr-FR", "de-DE"] }),
      ),
    ).toEqual(["fr-FR", "de-DE"]);
  });

  it("uses native job payload target locales", () => {
    expect(
      resolveJobCatSelectableTargetLocales({
        externalTargetLocales: null,
        reviewTargetLocale: null,
        inputPayload: { targetLocales: ["vi", "ja-JP"] },
      }),
    ).toEqual(["vi", "ja-JP"]);
  });

  it("falls back to review target locale", () => {
    expect(
      resolveJobCatSelectableTargetLocales({
        externalTargetLocales: null,
        reviewTargetLocale: "fr-FR",
        inputPayload: {},
      }),
    ).toEqual(["fr-FR"]);
  });
});

describe("selectJobCatTargetLocale", () => {
  it("honors the requested URL target locale when the provider file supports it", () => {
    expect(
      selectJobCatTargetLocale({
        requestedTargetLocale: "fr",
        providerTargetLocales: ["de", "fr"],
      }),
    ).toBe("fr");
  });

  it("falls back to the first provider target locale when no supported locale is requested", () => {
    expect(
      selectJobCatTargetLocale({
        requestedTargetLocale: null,
        providerTargetLocales: ["de", "fr"],
      }),
    ).toBe("de");
  });
});
