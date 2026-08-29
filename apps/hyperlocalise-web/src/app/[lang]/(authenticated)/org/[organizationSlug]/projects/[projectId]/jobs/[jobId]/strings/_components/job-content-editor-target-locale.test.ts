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

import { createProviderBackedJobDetail } from "../../_components/job-detail.fixture";
import {
  resolveJobContentEditorSelectableTargetLocales,
  selectJobContentEditorTargetLocale,
} from "./job-content-editor-target-locale";

describe("resolveJobContentEditorSelectableTargetLocales", () => {
  it("prefers external target locales for provider-backed jobs", () => {
    expect(
      resolveJobContentEditorSelectableTargetLocales(
        createProviderBackedJobDetail({ externalTargetLocales: ["fr-FR", "de-DE"] }),
      ),
    ).toEqual(["fr-FR", "de-DE"]);
  });

  it("uses native job payload target locales", () => {
    expect(
      resolveJobContentEditorSelectableTargetLocales({
        externalTargetLocales: null,
        reviewTargetLocale: null,
        inputPayload: { targetLocales: ["vi", "ja-JP"] },
      }),
    ).toEqual(["vi", "ja-JP"]);
  });

  it("falls back to review target locale", () => {
    expect(
      resolveJobContentEditorSelectableTargetLocales({
        externalTargetLocales: null,
        reviewTargetLocale: "fr-FR",
        inputPayload: {},
      }),
    ).toEqual(["fr-FR"]);
  });
});

describe("selectJobContentEditorTargetLocale", () => {
  it("honors the requested URL target locale when the provider file supports it", () => {
    expect(
      selectJobContentEditorTargetLocale({
        requestedTargetLocale: "fr",
        providerTargetLocales: ["de", "fr"],
      }),
    ).toBe("fr");
  });

  it("falls back to the first provider target locale when no supported locale is requested", () => {
    expect(
      selectJobContentEditorTargetLocale({
        requestedTargetLocale: null,
        providerTargetLocales: ["de", "fr"],
      }),
    ).toBe("de");
  });
});
