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

import type { ContentEditorGlossaryConcept } from "@/components/content-editor/shared/types";

import {
  contentEditorGlossaryConceptHasTargetLocaleTerm,
  isCatGlossaryConceptVisibleForTargetLocale,
} from "./content-editor-glossary-utils";

const translatableWithVi: Pick<ContentEditorGlossaryConcept, "translatable" | "targetTerms"> = {
  translatable: true,
  targetTerms: [{ id: "amount-vi", locale: "vi-VN", text: "Số tiền" }],
};

const translatableSourceOnly: Pick<ContentEditorGlossaryConcept, "translatable" | "targetTerms"> = {
  translatable: true,
  targetTerms: [],
};

const untranslatableConcept: Pick<ContentEditorGlossaryConcept, "translatable" | "targetTerms"> = {
  translatable: false,
  targetTerms: [],
};

describe("contentEditorGlossaryConceptHasTargetLocaleTerm", () => {
  it("matches canonical target locales", () => {
    expect(contentEditorGlossaryConceptHasTargetLocaleTerm(translatableWithVi, "vi-vn")).toBe(true);
    expect(contentEditorGlossaryConceptHasTargetLocaleTerm(translatableWithVi, "ja-JP")).toBe(
      false,
    );
  });
});

describe("isCatGlossaryConceptVisibleForTargetLocale", () => {
  it("shows translatable concepts only when a target-locale term exists", () => {
    expect(isCatGlossaryConceptVisibleForTargetLocale(translatableWithVi, "vi-VN")).toBe(true);
    expect(isCatGlossaryConceptVisibleForTargetLocale(translatableSourceOnly, "vi-VN")).toBe(false);
  });

  it("shows untranslatable concepts without a target term", () => {
    expect(isCatGlossaryConceptVisibleForTargetLocale(untranslatableConcept, "vi-VN")).toBe(true);
  });

  it("shows all concepts when no target locale is set", () => {
    expect(isCatGlossaryConceptVisibleForTargetLocale(translatableSourceOnly, undefined)).toBe(
      true,
    );
  });
});
