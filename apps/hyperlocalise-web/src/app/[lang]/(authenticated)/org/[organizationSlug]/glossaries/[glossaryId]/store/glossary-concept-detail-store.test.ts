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

import type {
  GlossaryConceptRecord,
  GlossaryConceptTermRecord,
} from "@/api/routes/glossary/glossary.schema";

import { GlossaryConceptDetailStore } from "./glossary-concept-detail-store";

function createTerm(overrides: Partial<GlossaryConceptTermRecord> = {}): GlossaryConceptTermRecord {
  return {
    id: "term_1",
    glossaryId: "glo_1",
    conceptId: "con_1",
    locale: "en-US",
    term: "checkout",
    isPrimary: true,
    description: "",
    note: "",
    partOfSpeech: "",
    gender: null,
    termType: null,
    url: null,
    status: "preferred",
    caseSensitive: false,
    forbidden: false,
    provenance: "manual",
    reviewStatus: "approved",
    createdAt: "2026-07-20T10:15:00.000Z",
    updatedAt: "2026-07-20T10:15:00.000Z",
    ...overrides,
  };
}

function createConcept(overrides: Partial<GlossaryConceptRecord> = {}): GlossaryConceptRecord {
  const terms = overrides.terms ?? [createTerm()];
  return {
    id: "con_1",
    glossaryId: "glo_1",
    primaryTerm: "checkout",
    subject: "",
    definition: "",
    translatable: true,
    note: "",
    url: null,
    createdAt: "2026-07-20T10:15:00.000Z",
    updatedAt: "2026-07-20T10:15:00.000Z",
    ...overrides,
    terms,
  };
}

function createNewStore() {
  return new GlossaryConceptDetailStore("acme", "glo_1", "new");
}

function createSavedStore() {
  return new GlossaryConceptDetailStore("acme", "glo_1", "con_1");
}

describe("GlossaryConceptDetailStore", () => {
  it("does not treat an empty new concept as unsaved", () => {
    const store = createNewStore();
    store.initializeNewConcept("en-US");

    expect(store.isCreatingConcept).toBe(true);
    expect(store.creatingTermDrafts).toHaveLength(1);
    expect(store.sourceTermText).toBe("");
    expect(store.isDirty).toBe(true);
    expect(store.hasUnsavedChanges).toBe(false);
    expect(store.canSave).toBe(false);
  });

  it("asks about leaving only after a new concept field is filled", () => {
    const store = createNewStore();
    store.initializeNewConcept("en-US");

    store.updateCreatingTermDraft(store.creatingTermDrafts[0]!.id, { term: "checkout" });
    expect(store.sourceTermText).toBe("checkout");
    expect(store.hasUnsavedChanges).toBe(true);
    expect(store.canSave).toBe(true);

    store.updateConceptDraft({ subject: "Payments" });
    store.updateCreatingTermDraft(store.creatingTermDrafts[0]!.id, { term: "" });
    expect(store.sourceTermText).toBe("");
    expect(store.hasUnsavedChanges).toBe(true);
    expect(store.canSave).toBe(false);
  });

  it("builds a create payload from the source term and extra locales", () => {
    const store = createNewStore();
    store.initializeNewConcept("en-US");
    store.updateCreatingTermDraft(store.creatingTermDrafts[0]!.id, { term: "checkout" });
    store.updateConceptDraft({ subject: "Payments", definition: "Pay flow" });
    store.addCreatingTerm("fr-FR", "new-fr");
    store.updateCreatingTermDraft("new-fr", { term: "paiement", partOfSpeech: "noun" });

    expect(store.buildCreateBody()).toEqual({
      primaryTerm: "checkout",
      subject: "Payments",
      definition: "Pay flow",
      translatable: true,
      note: "",
      url: undefined,
      terms: [
        {
          locale: "en-US",
          term: "checkout",
          partOfSpeech: undefined,
          gender: null,
          termType: null,
          status: "draft",
          description: "",
          note: "",
          url: "",
          caseSensitive: false,
          forbidden: false,
        },
        {
          locale: "fr-FR",
          term: "paiement",
          partOfSpeech: "noun",
          gender: null,
          termType: null,
          status: "draft",
          description: "",
          note: "",
          url: "",
          caseSensitive: false,
          forbidden: false,
        },
      ],
    });
  });

  it("hydrates a saved concept once and merges later term pages", () => {
    const store = createSavedStore();
    const firstTerm = createTerm();
    store.hydrateFromServer(createConcept({ terms: [firstTerm] }));
    store.updateTermDraft(firstTerm.id, { description: "Keep me" });

    const secondTerm = createTerm({
      id: "term_2",
      locale: "fr-FR",
      term: "paiement",
      isPrimary: false,
      status: "draft",
    });
    store.hydrateFromServer(createConcept({ terms: [firstTerm, secondTerm] }));

    expect(store.termDrafts[firstTerm.id]?.description).toBe("Keep me");
    expect(store.termDrafts[secondTerm.id]?.term).toBe("paiement");
    expect(store.termGroups.map((group) => group.locale)).toEqual(["en-US", "fr-FR"]);
  });

  it("marks a saved concept dirty for concept, term, or pending-term edits", () => {
    const conceptStore = createSavedStore();
    const termStore = createSavedStore();
    const pendingStore = createSavedStore();
    const term = createTerm();
    const concept = createConcept({ terms: [term] });
    conceptStore.setSourceLocale("en-US");
    termStore.setSourceLocale("en-US");
    pendingStore.setSourceLocale("en-US");
    conceptStore.hydrateFromServer(concept);
    termStore.hydrateFromServer(concept);
    pendingStore.hydrateFromServer(concept);

    expect(conceptStore.hasUnsavedChanges).toBe(false);
    expect(conceptStore.isDirty).toBe(false);

    conceptStore.updateConceptDraft({ definition: "Pay page" });
    expect(conceptStore.conceptIsDirty).toBe(true);
    expect(conceptStore.hasUnsavedChanges).toBe(true);

    termStore.updateTermDraft(term.id, { note: "Preferred" });
    expect(termStore.termsAreDirty).toBe(true);
    expect(termStore.isTermDirty(term)).toBe(true);

    pendingStore.startNewTerm("de-DE");
    expect(pendingStore.hasUnsavedChanges).toBe(false);
    pendingStore.updateNewTermDraft({ description: "Used on the payment page" });
    expect(pendingStore.hasUnsavedChanges).toBe(true);
    expect(pendingStore.newTermIsDirty).toBe(false);
    expect(pendingStore.canSave).toBe(false);
  });

  it("blocks term pagination while dirty and resets the cursor on language filter", () => {
    const store = createSavedStore();
    store.setSourceLocale("en-US");
    store.hydrateFromServer(createConcept());

    store.goToNextTermPage("term-page-2");
    expect(store.termCursor).toBe("term-page-2");

    store.updateConceptDraft({ subject: "Commerce" });
    store.goToNextTermPage("term-page-3");
    expect(store.termCursor).toBe("term-page-2");
    store.goToPreviousTermPage();
    expect(store.termCursor).toBe("term-page-2");

    store.setLanguageFilter("French");
    expect(store.languageFilter).toBe("French");
    expect(store.termCursor).toBeUndefined();
    expect(store.resolvedTermLocaleFilter(["en-US", "fr-FR"])).toBeUndefined();
    store.setLanguageFilter("fr-FR");
    expect(store.resolvedTermLocaleFilter(["en-US", "fr-FR"])).toBe("fr-FR");
  });

  it("builds an update payload that preserves omitted terms and deleted ids", () => {
    const store = createSavedStore();
    const kept = createTerm();
    const removed = createTerm({
      id: "term_2",
      locale: "fr-FR",
      term: "paiement",
      isPrimary: false,
      status: "draft",
    });
    store.setSourceLocale("en-US");
    store.hydrateFromServer(createConcept({ terms: [kept, removed] }));
    store.updateTermDraft(kept.id, { term: "Checkout", partOfSpeech: "noun" });
    store.markTermForDeletion(removed.id);
    store.startNewTerm("de-DE");
    store.updateNewTermDraft({ term: "Kasse", status: "preferred" });

    expect(store.buildUpdateBody()).toEqual({
      primaryTerm: "Checkout",
      subject: "",
      definition: "",
      translatable: true,
      note: "",
      url: undefined,
      preserveOmittedTerms: true,
      deletedTermIds: ["term_2"],
      terms: [
        {
          id: "term_1",
          locale: "en-US",
          term: "Checkout",
          partOfSpeech: "noun",
          gender: null,
          termType: null,
          status: "preferred",
          description: "",
          note: "",
          url: "",
          caseSensitive: false,
          forbidden: false,
        },
        {
          locale: "de-DE",
          term: "Kasse",
          partOfSpeech: undefined,
          gender: null,
          termType: null,
          status: "preferred",
          description: "",
          note: "",
          url: "",
          caseSensitive: false,
          forbidden: false,
        },
      ],
    });
  });

  it("clears drafts after a successful save", () => {
    const store = createSavedStore();
    store.setSourceLocale("en-US");
    store.hydrateFromServer(createConcept());
    store.updateConceptDraft({ definition: "Old" });
    store.startNewTerm("fr-FR");

    const saved = createConcept({
      definition: "Pay flow",
      terms: [createTerm(), createTerm({ id: "term_fr", locale: "fr-FR", term: "paiement" })],
    });
    store.applySavedConcept(saved);

    expect(store.conceptDraft.definition).toBe("Pay flow");
    expect(store.newTermLocale).toBeNull();
    expect(store.creatingTermDrafts).toEqual([]);
    expect(store.hasUnsavedChanges).toBe(false);
    expect(store.termDrafts.term_fr?.term).toBe("paiement");
  });
});
