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
  intercomApiArticlesListResponse,
  intercomApiHelpCentersFixture,
} from "@/app/[lang]/(authenticated)/org/[organizationSlug]/automations/_components/intercom-api.fixture";

import {
  articleBelongsToCollections,
  getIntercomArticle,
  IntercomArticleReadError,
  intercomArticleToImportPayload,
  listIntercomArticlesSince,
  mapIntercomArticleSummary,
  mapIntercomHelpCenterSummary,
  parseIntercomNumericId,
  resolveIntercomLocaleRemoteEditedAt,
} from "./articles-api";

function createArticleListPage(data: unknown[]) {
  return {
    data,
    hasNextPage: () => false,
    getNextPage: async () => {
      throw new Error("no next page");
    },
  };
}

describe("mapIntercomArticleSummary", () => {
  it("reads GET /articles list items in Intercom API 2.16 shape", () => {
    expect(intercomApiArticlesListResponse.type).toBe("list");
    expect(intercomApiArticlesListResponse.total_count).toBe(
      intercomApiArticlesListResponse.data.length,
    );
    expect(intercomApiArticlesListResponse.data.map((article) => article.updated_at)).toEqual(
      intercomApiArticlesListResponse.data
        .map((article) => article.updated_at)
        .toSorted((left, right) => right - left),
    );

    const [billing, resetPassword, gettingStarted] = intercomApiArticlesListResponse.data.map(
      (article) => mapIntercomArticleSummary(article),
    );

    expect(gettingStarted).toMatchObject({
      id: "2048",
      title: "Getting started with Acme",
      state: "published",
      parentIds: [38],
      defaultLocale: "en",
      localeUpdatedAt: {
        de: 1672317851,
        fr: 1672317900,
      },
      localeContent: {
        de: {
          title: "Erste Schritte mit Acme",
        },
      },
    });
    expect(resetPassword?.parentIds).toEqual([38]);
    expect(billing).toMatchObject({
      id: "4410",
      state: "draft",
      parentIds: [52],
      localeUpdatedAt: {},
    });
  });

  it("falls back to legacy parent_id when parent_ids is absent", () => {
    const summary = mapIntercomArticleSummary({
      id: "99",
      title: "Legacy",
      parent_id: 12,
      parent_type: "collection",
    });

    expect(summary.parentIds).toEqual([12]);
  });
});

describe("mapIntercomHelpCenterSummary", () => {
  it("prefers the 2.16 locales array over translated_content keys", () => {
    const [support] = intercomApiHelpCentersFixture.map((center) =>
      mapIntercomHelpCenterSummary(center),
    );

    expect(support).toMatchObject({
      id: "123",
      displayName: "Customer Support",
      defaultLocale: "en",
      locales: ["en", "de", "fr"],
    });
  });
});

describe("listIntercomArticlesSince", () => {
  it("scopes GET /articles by collection parent_ids for the help center", async () => {
    const client = {
      helpCenters: {
        collections: {
          list: async () => [
            { id: "38", help_center_id: 123 },
            { id: "99", help_center_id: 456 },
          ],
        },
      },
      articles: {
        list: async () => createArticleListPage(intercomApiArticlesListResponse.data),
        search: async () => ({ data: { articles: [] } }),
      },
    };

    const articles = await listIntercomArticlesSince({
      client: client as never,
      watermarkUpdatedAt: null,
      includeDrafts: false,
      helpCenterId: "123",
    });

    expect(articles.map((article) => article.id)).toEqual(["3102", "2048"]);
  });

  it("keeps standalone articles found by GET /articles/search", async () => {
    const standalone = {
      type: "article",
      id: "9001",
      title: "Standalone FAQ",
      description: "Not in a collection",
      body: "<p>FAQ</p>",
      state: "published",
      updated_at: 1677000000,
      author_id: 19,
      parent_ids: [],
      translated_content: { type: "article_translated_content" },
    };
    const client = {
      helpCenters: {
        collections: {
          list: async () => [{ id: "38", help_center_id: 123 }],
        },
      },
      articles: {
        list: async () => createArticleListPage(intercomApiArticlesListResponse.data),
        search: async (request: { help_center_id?: number; state?: string }) => {
          expect(request).toMatchObject({ help_center_id: 123, state: "published" });
          return { data: { articles: [standalone] } };
        },
      },
    };

    const articles = await listIntercomArticlesSince({
      client: client as never,
      watermarkUpdatedAt: null,
      includeDrafts: false,
      helpCenterId: "123",
    });

    expect(articles.map((article) => article.id)).toEqual(["3102", "2048", "9001"]);
  });

  it("walks cursor-paginated GET /articles/search pages", async () => {
    const firstStandalone = {
      type: "article",
      id: "9001",
      title: "Standalone FAQ",
      description: "Not in a collection",
      body: "<p>FAQ</p>",
      state: "published",
      updated_at: 1677000000,
      parent_ids: [],
      translated_content: { type: "article_translated_content" },
    };
    const secondStandalone = {
      ...firstStandalone,
      id: "9002",
      title: "Another FAQ",
    };
    let searchCalls = 0;
    const client = {
      helpCenters: {
        collections: {
          list: async () => [{ id: "38", help_center_id: 123 }],
        },
      },
      articles: {
        list: async () => createArticleListPage([]),
        search: async (request: { starting_after?: string }) => {
          searchCalls += 1;
          if (!request.starting_after) {
            return {
              data: { articles: [firstStandalone] },
              pages: { next: { starting_after: "cursor-2" } },
            };
          }
          expect(request.starting_after).toBe("cursor-2");
          return { data: { articles: [secondStandalone] }, pages: {} };
        },
      },
    };

    const articles = await listIntercomArticlesSince({
      client: client as never,
      watermarkUpdatedAt: null,
      includeDrafts: false,
      helpCenterId: "123",
    });

    expect(searchCalls).toBe(2);
    expect(articles.map((article) => article.id)).toEqual(["9001", "9002"]);
  });

  it("restricts to configured collection ids", async () => {
    const client = {
      helpCenters: {
        collections: {
          list: async () => [
            { id: "38", help_center_id: 123 },
            { id: "52", help_center_id: 123 },
          ],
        },
      },
      articles: {
        list: async () => createArticleListPage(intercomApiArticlesListResponse.data),
        search: async () => ({ data: { articles: [] } }),
      },
    };

    const articles = await listIntercomArticlesSince({
      client: client as never,
      watermarkUpdatedAt: null,
      includeDrafts: true,
      helpCenterId: "123",
      collectionIds: ["52"],
    });

    expect(articles.map((article) => article.id)).toEqual(["4410"]);
  });
});

describe("articleBelongsToCollections", () => {
  it("matches any parent_ids entry", () => {
    expect(articleBelongsToCollections([18, 19], new Set(["19"]))).toBe(true);
    expect(articleBelongsToCollections([18], new Set(["19"]))).toBe(false);
    expect(articleBelongsToCollections([], new Set(["19"]))).toBe(false);
  });
});

describe("intercomArticleToImportPayload", () => {
  it("imports translated_content for a non-default source locale", () => {
    const article = mapIntercomArticleSummary(intercomApiArticlesListResponse.data[2]!);

    expect(intercomArticleToImportPayload(article, "de").title).toBe("Erste Schritte mit Acme");
    expect(intercomArticleToImportPayload(article, "en").title).toBe("Getting started with Acme");
  });

  it("fails when the configured source locale has no content", () => {
    const article = mapIntercomArticleSummary(intercomApiArticlesListResponse.data[2]!);

    expect(() => intercomArticleToImportPayload(article, "ja")).toThrow(
      "intercom_source_locale_content_missing",
    );
  });
});

describe("resolveIntercomLocaleRemoteEditedAt", () => {
  it("uses the later of updated_at and draft_updated_at", () => {
    const article = mapIntercomArticleSummary({
      id: "1",
      title: "Hello",
      default_locale: "en",
      translated_content: {
        type: "article_translated_content",
        de: {
          type: "article_content",
          title: "Hallo",
          updated_at: 100,
          draft_updated_at: 250,
        },
      },
    });

    expect(resolveIntercomLocaleRemoteEditedAt(article, "de")).toBe(250);
  });
});

describe("getIntercomArticle", () => {
  it("propagates provider failures instead of treating them as missing", async () => {
    const client = {
      articles: {
        find: async () => {
          throw Object.assign(new Error("rate limited"), { status: 429 });
        },
      },
    };

    await expect(getIntercomArticle(client as never, "2048")).rejects.toBeInstanceOf(
      IntercomArticleReadError,
    );
  });

  it("returns null for a missing article", async () => {
    const client = {
      articles: {
        find: async () => {
          throw Object.assign(new Error("not found"), { status: 404 });
        },
      },
    };

    await expect(getIntercomArticle(client as never, "2048")).resolves.toBeNull();
  });
});

describe("parseIntercomNumericId", () => {
  it("parses Intercom string ids used by GET /articles/{article_id}", () => {
    expect(parseIntercomNumericId("6871119")).toBe(6871119);
    expect(parseIntercomNumericId("not-an-id")).toBeNull();
  });
});
