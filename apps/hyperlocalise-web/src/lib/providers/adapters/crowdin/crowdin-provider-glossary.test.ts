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
  it("lists projects associated with a glossary from the live Crowdin API", async () => {
    const fetchMock = vi.fn(async (url) => {
      const path = String(url).replace("https://api.crowdin.test/api/v2", "");

      if (path === "/glossaries/7") {
        return new Response(
          JSON.stringify({
            data: {
              id: 7,
              name: "Product glossary",
              description: null,
              languageId: "en",
              languageIds: ["en", "fr"],
              terms: 12,
              projectIds: [43, 42],
              defaultProjectIds: [42, 44],
              webUrl: "https://crowdin.test/glossary/7",
            },
          }),
          { status: 200 },
        );
      }

      if (path.startsWith("/projects?")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                data: {
                  id: 44,
                  name: "Zeta project",
                  identifier: "zeta",
                  sourceLanguageId: "en",
                  targetLanguageIds: ["de"],
                  webUrl: "https://crowdin.test/project/zeta",
                  isSuspended: false,
                },
              },
              {
                data: {
                  id: 42,
                  name: "Alpha project",
                  identifier: "alpha",
                  sourceLanguageId: "en",
                  targetLanguageIds: ["fr"],
                  webUrl: "https://crowdin.test/project/alpha",
                  isSuspended: false,
                },
              },
              {
                data: {
                  id: 99,
                  name: "Unrelated project",
                  identifier: "unrelated",
                  sourceLanguageId: "en",
                  targetLanguageIds: ["es"],
                  webUrl: "https://crowdin.test/project/unrelated",
                  isSuspended: false,
                },
              },
            ],
            pagination: { offset: 0, limit: 500 },
          }),
          { status: 200 },
        );
      }

      throw new Error(`Unexpected Crowdin request: ${path}`);
    }) as unknown as typeof fetch;

    const projects = await crowdinTmsProvider.listLiveGlossaryProjects(
      {
        organizationId: "organization-1",
        credential: { baseUrl: "https://api.crowdin.test/api/v2" } as never,
        secretMaterial: "test-token",
        projectId: "42",
        externalProjectId: "42",
        sourceLocale: "en",
        fetchFn: fetchMock,
      },
      7,
    );

    expect(projects.map((project) => project.id)).toEqual([42, 44]);
    expect(projects.map((project) => project.name)).toEqual(["Alpha project", "Zeta project"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("maps native locales before creating a glossary term", async () => {
    let requestBody: Record<string, unknown> | undefined;
    const fetchMock = vi.fn(async (_url, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          data: {
            id: 23,
            glossaryId: 7,
            languageId: "vi",
            text: "Thanh toán",
            conceptId: 8,
          },
        }),
        { status: 201 },
      );
    }) as unknown as typeof fetch;

    await crowdinTmsProvider.createLiveGlossaryTerm(
      {
        organizationId: "organization-1",
        credential: { baseUrl: "https://api.crowdin.test/api/v2" } as never,
        secretMaterial: "test-token",
        projectId: "project-42",
        externalProjectId: "42",
        sourceLocale: "en-US",
        fetchFn: fetchMock,
      },
      7,
      8,
      {
        languageId: "vi-VN",
        text: "Thanh toán",
      },
    );

    expect(requestBody).toMatchObject({ languageId: "vi", conceptId: 8 });
  });

  it("preserves source-locale synonyms and updates only the canonical term", () => {
    const concept = toCrowdinConceptInput({
      primaryTerm: "Checkout updated",
      sourceLocale: "en",
      terms: [
        { id: 10, locale: "en", text: "Checkout", status: "preferred", partOfSpeech: "noun" },
        { id: 11, locale: "en", text: "Payment", status: "preferred", partOfSpeech: "noun" },
        { id: 12, locale: "de", text: "Bezahlen", status: "draft", partOfSpeech: "noun" },
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
        { id: 11, locale: "en", text: "Payment", status: "admitted", partOfSpeech: "noun" },
        { id: 10, locale: "en", text: "Checkout", status: "draft", partOfSpeech: "noun" },
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

  it("selects the Crowdin source term when sourceLocale is a BCP-47 locale", async () => {
    const termBodies: Array<Record<string, unknown>> = [];
    const fetchMock = vi.fn(async (url, init) => {
      const path = String(url).replace("https://api.crowdin.test/api/v2", "");
      if (path === "/glossaries/7/concepts" && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            data: {
              id: 8,
              userId: 3,
              glossaryId: 7,
              subject: "product",
              definition: "",
              translatable: true,
              note: "",
              url: "",
              figure: "",
              languagesDetails: [],
              createdAt: "2026-08-20T00:00:00Z",
              updatedAt: "2026-08-20T00:00:00Z",
            },
          }),
          { status: 201 },
        );
      }

      if (path === "/glossaries/7/terms" && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        termBodies.push(body);
        return new Response(
          JSON.stringify({
            data: {
              id: termBodies.length + 20,
              glossaryId: 7,
              languageId: body.languageId,
              text: body.text,
              conceptId: 8,
            },
          }),
          { status: 201 },
        );
      }

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
                  definition: "",
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
            data: termBodies.map((body, index) => ({
              data: {
                id: index + 21,
                userId: 3,
                glossaryId: 7,
                languageId: body.languageId,
                text: body.text,
                conceptId: 8,
              },
            })),
            pagination: { offset: 0, limit: 500 },
          }),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    await crowdinTmsProvider.createLiveGlossaryConcept(
      {
        organizationId: "organization-1",
        credential: { baseUrl: "https://api.crowdin.test/api/v2" } as never,
        secretMaterial: "test-token",
        projectId: "project-42",
        externalProjectId: "42",
        sourceLocale: "en-US",
        fetchFn: fetchMock,
      },
      7,
      {
        primaryTerm: "Checkout",
        sourceLocale: "en-US",
        terms: [
          { languageId: "en", text: "Checkout", status: "preferred" },
          { languageId: "vi", text: "Thanh toán", status: "draft" },
        ],
      },
    );

    expect(termBodies).toEqual([
      expect.objectContaining({ languageId: "en", text: "Checkout", conceptId: 8 }),
      expect.objectContaining({ languageId: "vi", text: "Thanh toán", conceptId: 8 }),
    ]);
    expect(termBodies).toHaveLength(2);
  });

  it("treats native locales and Crowdin IDs as the same language on term update", async () => {
    const patchBodies: unknown[] = [];
    let termCreateCount = 0;
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
                  languageId: "vi",
                  text: "Thanh toán",
                  description: "",
                  partOfSpeech: "noun",
                  status: "preferred",
                  type: "",
                  gender: "",
                  note: "",
                  url: "",
                  conceptId: 8,
                },
              },
            ],
            pagination: { offset: 0, limit: 500 },
          }),
          { status: 200 },
        );
      }

      if (path === "/glossaries/7/terms" && init?.method === "POST") {
        termCreateCount += 1;
        return new Response(JSON.stringify({ data: { id: 99, conceptId: 8 } }), { status: 201 });
      }

      if (path === "/glossaries/7/terms/9" && init?.method === "PATCH") {
        patchBodies.push(JSON.parse(String(init.body)));
        return new Response(
          JSON.stringify({
            data: {
              id: 9,
              glossaryId: 7,
              languageId: "vi",
              text: "Thanh toán cập nhật",
              conceptId: 8,
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
        sourceLocale: "en-US",
        fetchFn: fetchMock,
      },
      7,
      8,
      9,
      {
        languageId: "vi-VN",
        text: "Thanh toán cập nhật",
        status: "preferred",
      },
    );

    expect(patchBodies).toHaveLength(1);
    expect(termCreateCount).toBe(0);
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

  it("filters Crowdin glossaries by project before paginating", async () => {
    const glossaryPayload = (
      id: number,
      projectIds: number[],
      defaultProjectIds: number[] = [],
    ) => ({
      data: {
        id,
        name: `Glossary ${id}`,
        description: null,
        languageId: "en",
        languageIds: ["en", "fr"],
        terms: 4,
        projectIds,
        defaultProjectIds,
        webUrl: `https://crowdin.test/glossary/${id}`,
      },
    });

    const fetchMock = vi.fn(async (url) => {
      const path = String(url).replace("https://api.crowdin.test/api/v2", "");

      if (path === "/user") {
        return new Response(JSON.stringify({ data: { id: 99 } }), { status: 200 });
      }

      if (path.startsWith("/glossaries?")) {
        const offset = Number(
          new URL(`https://api.crowdin.test${path}`).searchParams.get("offset"),
        );
        const glossaries =
          offset === 0
            ? [
                glossaryPayload(2, [42]),
                ...Array.from({ length: 24 }, (_, index) => glossaryPayload(100 + index, [99])),
              ]
            : [glossaryPayload(3, [], [42]), glossaryPayload(4, [42])];

        return new Response(JSON.stringify({ data: glossaries }), { status: 200 });
      }

      throw new Error(`Unexpected Crowdin request: ${path}`);
    }) as unknown as typeof fetch;

    const firstPage = await crowdinTmsProvider.fetchGlossariesPage({
      organizationId: "organization-1",
      credential: { baseUrl: "https://api.crowdin.test/api/v2" } as never,
      secretMaterial: "test-token",
      fetchFn: fetchMock,
      projectId: "42",
      limit: 2,
      offset: 0,
    });

    expect(firstPage.glossaries.map((glossary) => glossary.externalGlossaryId)).toEqual(["2", "3"]);
    expect(firstPage).toMatchObject({ offset: 0, limit: 2, hasMore: true });

    const secondPage = await crowdinTmsProvider.fetchGlossariesPage({
      organizationId: "organization-1",
      credential: { baseUrl: "https://api.crowdin.test/api/v2" } as never,
      secretMaterial: "test-token",
      fetchFn: fetchMock,
      projectId: "42",
      limit: 2,
      offset: 2,
    });

    expect(secondPage.glossaries.map((glossary) => glossary.externalGlossaryId)).toEqual(["4"]);
    expect(secondPage).toMatchObject({ offset: 2, limit: 2, hasMore: false });
  });

  it("loads a live Crowdin glossary by id without listing the account", async () => {
    const fetchMock = vi.fn(async (url) => {
      const path = String(url).replace("https://api.crowdin.test/api/v2", "");
      if (path === "/glossaries/31") {
        return new Response(
          JSON.stringify({
            data: {
              id: 31,
              name: "Page two glossary",
              description: "Beyond the first page",
              languageId: "en",
              languageIds: ["en", "vi"],
              terms: 8,
              projectIds: [42],
              defaultProjectIds: [],
              webUrl: "https://crowdin.test/glossary/31",
            },
          }),
          { status: 200 },
        );
      }

      throw new Error(`Unexpected Crowdin request: ${path}`);
    }) as unknown as typeof fetch;

    const glossary = await crowdinTmsProvider.fetchLiveGlossaryMetadata(
      {
        organizationId: "organization-1",
        credential: { baseUrl: "https://api.crowdin.test/api/v2" } as never,
        secretMaterial: "test-token",
        fetchFn: fetchMock,
      },
      31,
    );

    expect(glossary).toMatchObject({
      externalGlossaryId: "31",
      name: "Page two glossary",
      sourceLocale: "en",
      externalProjectIds: ["42"],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
