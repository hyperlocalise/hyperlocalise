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
  formLanguage,
  isNewEditorForm,
  newEditorFormImportWarning,
  newEditorFormPushWarning,
} from "./form-definition";

describe("isNewEditorForm", () => {
  it("is true only for V4 embed forms", () => {
    expect(isNewEditorForm({ configuration: { embedType: "V4" } })).toBe(true);
    expect(isNewEditorForm({ configuration: { embedType: "V3" } })).toBe(false);
    expect(isNewEditorForm({})).toBe(false);
  });
});

describe("formLanguage", () => {
  it("prefers configuration.language over settings.hubspotFormLocale", () => {
    expect(
      formLanguage({
        configuration: { language: " fr " },
        settings: { hubspotFormLocale: "de" },
      }),
    ).toBe("fr");
    expect(formLanguage({ settings: { hubspotFormLocale: "  ja-JP  " } })).toBe("ja-JP");
    expect(formLanguage({ configuration: { language: "   " }, settings: {} })).toBeNull();
    expect(formLanguage({})).toBeNull();
  });
});

describe("new editor form warnings", () => {
  it("names the form in import and push warnings", () => {
    expect(newEditorFormImportWarning('Contact "us"')).toContain('Form "Contact "us""');
    expect(newEditorFormImportWarning("Newsletter")).toContain("public definition");
    expect(newEditorFormPushWarning("Newsletter")).toContain('Form "Newsletter"');
    expect(newEditorFormPushWarning("Newsletter")).toContain("cannot write the new editor");
  });
});
