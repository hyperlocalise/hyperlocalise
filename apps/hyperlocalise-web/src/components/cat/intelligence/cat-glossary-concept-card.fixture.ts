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
import type { CatGlossaryConcept } from "@/components/cat/shared/types";

export const matchedGlossaryConceptFixture: CatGlossaryConcept = {
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
      locale: "en",
      text: "Reseller",
      status: "preferred",
      preferred: true,
    },
  ],
  targetTerms: [
    {
      id: "reseller-vi-preferred",
      locale: "vi",
      text: "Đại lý",
      status: "preferred",
      preferred: true,
    },
    {
      id: "reseller-vi-alternate",
      locale: "vi",
      text: "Nhà bán lại",
      status: "not_recommended",
      forbidden: true,
    },
  ],
};

export const untranslatableGlossaryConceptFixture: CatGlossaryConcept = {
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

export const sourceOnlyGlossaryConceptFixture: CatGlossaryConcept = {
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

export const primaryTermFallbackGlossaryConceptFixture: CatGlossaryConcept = {
  id: "concept-api",
  glossaryId: "glossary-product",
  glossaryName: "Product UI",
  primaryTerm: "API",
  translatable: true,
  sourceTerms: [],
  targetTerms: [],
};
