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
import type { ContentEditorGlossaryConcept } from "@/components/content-editor/shared/types";

export const matchedGlossaryConceptFixture: ContentEditorGlossaryConcept = {
  id: "concept-reseller",
  glossaryId: "glossary-partner",
  glossaryName: "Partner Program",
  glossaryUrl: "/org/acme/glossaries/glossary-partner",
  conceptUrl: "/org/acme/glossaries/glossary-partner/concepts/concept-reseller",
  primaryTerm: "Reseller",
  definition: "A company or individual authorized to resell our product.",
  translatable: true,
  sourceTerms: [
    {
      id: "reseller-en",
      locale: "en-US",
      text: "Reseller",
      status: "preferred",
      preferred: true,
    },
  ],
  targetTerms: [
    {
      id: "reseller-vi-preferred",
      locale: "vi-VN",
      text: "Đại lý",
      status: "preferred",
      preferred: true,
    },
    {
      id: "reseller-vi-alternate",
      locale: "vi-VN",
      text: "Nhà bán lại",
      status: "not_recommended",
      forbidden: true,
    },
  ],
};

export const untranslatableGlossaryConceptFixture: ContentEditorGlossaryConcept = {
  id: "concept-brand",
  glossaryId: "glossary-brand",
  glossaryName: "Brand terms",
  glossaryUrl: "/org/acme/glossaries/glossary-brand",
  conceptUrl: "/org/acme/glossaries/glossary-brand/concepts/concept-brand",
  primaryTerm: "Hyperlocalise",
  definition: "Brand name that must stay in English.",
  translatable: false,
  sourceTerms: [
    {
      id: "brand-en",
      locale: "en",
      text: "Hyperlocalise",
      status: "preferred",
      preferred: true,
    },
  ],
  targetTerms: [
    {
      id: "brand-fr-hidden",
      locale: "fr",
      text: "Hyperlocalise FR",
      status: "preferred",
      preferred: true,
    },
  ],
};

export const sourceOnlyGlossaryConceptFixture: ContentEditorGlossaryConcept = {
  id: "concept-dashboard",
  glossaryId: "glossary-product",
  glossaryName: "Product UI",
  glossaryUrl: "/org/acme/glossaries/glossary-product",
  conceptUrl: "/org/acme/glossaries/glossary-product/concepts/concept-dashboard",
  primaryTerm: "Dashboard",
  translatable: true,
  sourceTerms: [
    {
      id: "dashboard-en",
      locale: "en",
      text: "Dashboard",
      status: "draft",
    },
  ],
  targetTerms: [],
};

export const primaryTermFallbackGlossaryConceptFixture: ContentEditorGlossaryConcept = {
  id: "concept-api",
  glossaryId: "glossary-product",
  glossaryName: "Product UI",
  primaryTerm: "API",
  translatable: true,
  sourceTerms: [],
  targetTerms: [],
};

export const amountWithViTargetFixture: ContentEditorGlossaryConcept = {
  id: "concept-amount-vi",
  glossaryId: "glossary-linguists",
  glossaryName: "Internal Linguists",
  glossaryUrl: "/org/acme/glossaries/glossary-linguists",
  conceptUrl: "/org/acme/glossaries/glossary-linguists/concepts/concept-amount-vi",
  primaryTerm: "Amount",
  translatable: true,
  sourceTerms: [
    {
      id: "amount-en",
      locale: "en-US",
      text: "Amount",
      status: "preferred",
      preferred: true,
    },
  ],
  targetTerms: [
    {
      id: "amount-vi",
      locale: "vi-VN",
      text: "Số tiền",
      status: "preferred",
      preferred: true,
    },
  ],
};

export const amountSourceOnlyFixture: ContentEditorGlossaryConcept = {
  id: "concept-amount-source-only",
  glossaryId: "glossary-linguists",
  glossaryName: "Internal Linguists",
  glossaryUrl: "/org/acme/glossaries/glossary-linguists",
  conceptUrl: "/org/acme/glossaries/glossary-linguists/concepts/concept-amount-source-only",
  primaryTerm: "Amount",
  translatable: true,
  sourceTerms: [
    {
      id: "amount-en-only",
      locale: "en-US",
      text: "Amount",
      status: "preferred",
      preferred: true,
    },
  ],
  targetTerms: [],
};
