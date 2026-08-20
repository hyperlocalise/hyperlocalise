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
import { describe, expect, it, vi } from "vite-plus/test";

import { crowdinTmsProvider } from "./crowdin-provider";
import { toCrowdinConceptInput } from "@/lib/glossary/crowdin-glossary";

describe("Crowdin live glossary concepts", () => {
  it("preserves source-locale synonyms and updates only the canonical term", () => {
    const concept = toCrowdinConceptInput({
      primaryTerm: "Checkout updated",
      sourceLocale: "en",
      terms: [
        { id: 10, languageId: "en", text: "Checkout", status: "preferred", partOfSpeech: "noun" },
        { id: 11, languageId: "en", text: "Payment", status: "preferred", partOfSpeech: "noun" },
        { id: 12, languageId: "de", text: "Bezahlen", status: "draft", partOfSpeech: "noun" },
      ],
    });

    expect(concept.terms).toMatchObject([
      { id: 10, languageId: "en", text: "Checkout updated", status: "preferred" },
      { id: 11, languageId: "en", text: "Payment", status: "admitted" },
      { id: 12, languageId: "de", text: "Bezahlen", status: "draft" },
    ]);
  });

  it("uses the lowest source term ID when no preferred term exists", () => {
    const concept = toCrowdinConceptInput({
      primaryTerm: "Checkout updated",
      sourceLocale: "en",
      terms: [
        { id: 11, languageId: "en", text: "Payment", status: "admitted", partOfSpeech: "noun" },
        { id: 10, languageId: "en", text: "Checkout", status: "draft", partOfSpeech: "noun" },
      ],
    });

    expect(concept.terms).toMatchObject([
      { id: 11, languageId: "en", text: "Payment", status: "admitted" },
      { id: 10, languageId: "en", text: "Checkout updated", status: "preferred" },
    ]);
  });

  it("uses the glossary source locale to select the primary term", async () => {
    const fetchMock = vi.fn(async (url) => {
      const path = String(url).replace("https://api.crowdin.test/api/v2", "");
      if (path.startsWith("/glossaries/7/concepts?")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                data: {
                  id: 8,
                  userId: 3,
                  glossaryId: 7,
                  subject: "product",
                  definition: "A product",
                  translatable: true,
                  note: "",
                  url: "",
                  figure: "",
                  languagesDetails: [],
                  createdAt: "2026-08-20T00:00:00Z",
                  updatedAt: "2026-08-20T00:00:00Z",
                },
              },
            ],
            pagination: { offset: 0, limit: 500 },
          }),
          { status: 200 },
        );
      }

      if (path.startsWith("/glossaries/7/terms?")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                data: {
                  id: 9,
                  userId: 3,
                  glossaryId: 7,
                  languageId: "en",
                  text: "Product",
                  conceptId: 8,
                },
              },
              {
                data: {
                  id: 10,
                  userId: 3,
                  glossaryId: 7,
                  languageId: "de",
                  text: "Produkt",
                  conceptId: 8,
                },
              },
            ],
            pagination: { offset: 0, limit: 500 },
          }),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    const concepts = await crowdinTmsProvider.listLiveGlossaryConcepts(
      {
        organizationId: "organization-1",
        credential: { baseUrl: "https://api.crowdin.test/api/v2" } as never,
        secretMaterial: "test-token",
        projectId: "project-42",
        externalProjectId: "42",
        sourceLocale: "de",
        fetchFn: fetchMock,
      },
      7,
    );

    expect(concepts[0]).toMatchObject({
      primaryTerm: "Produkt",
      sourceLocale: "de",
    });
  });

  it("uses only Crowdin-supported term patch fields", async () => {
    const patchBodies: unknown[] = [];
    const fetchMock = vi.fn(async (url, init) => {
      const path = String(url).replace("https://api.crowdin.test/api/v2", "");
      if (path.startsWith("/glossaries/7/concepts?")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                data: {
                  id: 8,
                  userId: 3,
                  glossaryId: 7,
                  subject: "product",
                  definition: "A product",
                  translatable: true,
                  note: "",
                  url: "",
                  figure: "",
                  languagesDetails: [],
                  createdAt: "2026-08-20T00:00:00Z",
                  updatedAt: "2026-08-20T00:00:00Z",
                },
              },
            ],
            pagination: { offset: 0, limit: 500 },
          }),
          { status: 200 },
        );
      }

      if (path.startsWith("/glossaries/7/terms?")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                data: {
                  id: 9,
                  userId: 3,
                  glossaryId: 7,
                  languageId: "de",
                  text: "Produkt",
                  description: "",
                  partOfSpeech: "noun",
                  status: "preferred",
                  type: "",
                  gender: "",
                  note: "",
                  url: "",
                  conceptId: 8,
                  lemma: "Produkt",
                },
              },
            ],
            pagination: { offset: 0, limit: 500 },
          }),
          { status: 200 },
        );
      }

      if (path === "/glossaries/7/terms/9") {
        patchBodies.push(JSON.parse(String(init?.body)));
        return new Response(
          JSON.stringify({
            data: {
              id: 9,
              glossaryId: 7,
              languageId: "de",
              text: "Erzeugnis",
              description: "Updated",
              partOfSpeech: "noun",
              status: "preferred",
              type: "",
              gender: "",
              note: "",
              url: "",
              conceptId: 8,
              lemma: "Produkt",
            },
          }),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    await crowdinTmsProvider.updateLiveGlossaryTerm(
      {
        organizationId: "organization-1",
        credential: { baseUrl: "https://api.crowdin.test/api/v2" } as never,
        secretMaterial: "test-token",
        projectId: "project-42",
        externalProjectId: "42",
        sourceLocale: "de",
        fetchFn: fetchMock,
      },
      7,
      8,
      9,
      {
        languageId: "de",
        text: "Erzeugnis",
        description: "Updated",
        partOfSpeech: "noun",
        status: "preferred",
        lemma: "changed-lemma",
      },
    );

    expect(patchBodies).toEqual([
      [
        { op: "replace", path: "/text", value: "Erzeugnis" },
        { op: "replace", path: "/description", value: "Updated" },
        { op: "replace", path: "/partOfSpeech", value: "noun" },
        { op: "replace", path: "/status", value: "preferred" },
        { op: "replace", path: "/type", value: "" },
        { op: "replace", path: "/gender", value: "" },
        { op: "replace", path: "/note", value: "" },
        { op: "replace", path: "/url", value: "" },
      ],
    ]);
  });
});
