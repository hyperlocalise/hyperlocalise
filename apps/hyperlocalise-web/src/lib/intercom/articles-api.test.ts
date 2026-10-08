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
  intercomApiCollectionsFixture,
  intercomApiHelpCentersFixture,
} from "@/app/[lang]/(authenticated)/org/[organizationSlug]/automations/_components/intercom-api.fixture";
import { INTERCOM_ARTICLE_BODY_MARKDOWN } from "@/lib/intercom/intercom-article-markdown.fixture";
import type { IntercomApiArticle } from "@/lib/intercom/intercom-api.types";

import {
  articleBelongsToCollections,
  getIntercomArticle,
  IntercomArticleReadError,
  intercomArticleToImportPayload,
  listIntercomArticlesSince,
  listIntercomCollectionIdsForHelpCenter,
  listIntercomCollectionsForHelpCenter,
  localesFromIntercomCollections,
  listIntercomHelpCenters,
  loadIntercomArticleForImport,
  mapIntercomArticleSummary,
  mapIntercomCollectionSummary,
  mapIntercomHelpCenterSummary,
  parseIntercomNumericId,
  resolveIntercomLocaleRemoteEditedAt,
  updateIntercomArticleTranslatedContent,
} from "./articles-api";

function createArticleListPage(data: IntercomApiArticle[]) {
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
      body: "Welcome to Acme. Create an account, invite your team, and send your first message.",
      localeContent: {
        de: {
          title: "Erste Schritte mit Acme",
          body: "Willkommen bei Acme. Legen Sie ein Konto an, laden Sie Ihr Team ein und senden Sie Ihre erste Nachricht.",
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
    });

    expect(summary.parentIds).toEqual([12]);
  });

  it("prefers body_markdown and falls back to HTML body", () => {
    expect(
      mapIntercomArticleSummary({
        id: "1",
        body: "<p>Html</p>",
        body_markdown: "# Markdown",
        translated_content: {
          type: "article_translated_content",
          de: {
            type: "article_content",
            body: "<p>Html</p>",
            body_markdown: "Markdown",
          },
        },
      }),
    ).toMatchObject({
      body: "# Markdown",
      localeContent: { de: { body: "Markdown" } },
    });

    expect(
      mapIntercomArticleSummary({
        id: "1",
        body: "<p>Html</p>",
        body_markdown: "   ",
      }).body,
    ).toBe("<p>Html</p>");
  });
});

describe("listIntercomHelpCenters", () => {
  it("reads the first page without following a sticky hasNextPage", async () => {
    let nextCalls = 0;
    const client = {
      helpCenters: {
        list: async () => ({
          data: intercomApiHelpCentersFixture,
          hasNextPage: () => true,
          getNextPage: async () => {
            nextCalls += 1;
            if (nextCalls > 3) {
              throw new Error("infinite pagination");
            }
            return {
              data: intercomApiHelpCentersFixture,
              hasNextPage: () => true,
              getNextPage: async () => {
                throw new Error("should not fetch next without pages.next");
              },
            };
          },
        }),
      },
    };

    const centers = await listIntercomHelpCenters(client as never);

    expect(centers.map((center) => center.id)).toEqual(["123", "456"]);
    expect(nextCalls).toBe(0);
  });

  it("reads items from page.response when top-level data is missing", async () => {
    const client = {
      helpCenters: {
        list: async () => ({
          response: {
            data: intercomApiHelpCentersFixture,
            pages: {},
          },
        }),
      },
    };

    const centers = await listIntercomHelpCenters(client as never);

    expect(centers.map((center) => center.id)).toEqual(["123", "456"]);
  });

  it("follows Intercom pages.next and dedupes repeated ids", async () => {
    const client = {
      helpCenters: {
        list: async () => ({
          data: [intercomApiHelpCentersFixture[0]],
          pages: { next: { page: 2 } },
          getNextPage: async () => ({
            data: [intercomApiHelpCentersFixture[0], intercomApiHelpCentersFixture[1]],
            pages: {},
          }),
        }),
      },
    };

    const centers = await listIntercomHelpCenters(client as never);

    expect(centers.map((center) => center.id)).toEqual(["123", "456"]);
  });
});

describe("mapIntercomCollectionSummary", () => {
  it("reads collection name and help center id", () => {
    expect(mapIntercomCollectionSummary(intercomApiCollectionsFixture[0]!)).toEqual({
      id: "38",
      name: "Getting started",
      helpCenterId: "123",
      locales: [],
    });
  });

  it("falls back to Collection {id} when name is missing", () => {
    expect(mapIntercomCollectionSummary({ id: "52", help_center_id: 123 })).toEqual({
      id: "52",
      name: "Collection 52",
      helpCenterId: "123",
      locales: [],
    });

    expect(
      mapIntercomCollectionSummary({
        id: "52",
        name: "Billing",
        help_center_id: 123,
        default_locale: "en",
        translated_content: {
          type: "group_translated_content",
          de: { type: "group_content", name: "Abrechnung" },
        },
      }),
    ).toEqual({
      id: "52",
      name: "Billing",
      helpCenterId: "123",
      locales: ["en", "de"],
    });
  });
});

describe("listIntercomCollectionsForHelpCenter", () => {
  it("returns named collections for the selected Help Center", async () => {
    const collections = await listIntercomCollectionsForHelpCenter({
      client: {
        helpCenters: {
          collections: {
            list: async () => intercomApiCollectionsFixture,
          },
        },
      } as never,
      helpCenterId: "123",
    });

    expect(collections).toEqual([
      { id: "38", name: "Getting started", helpCenterId: "123", locales: [] },
      { id: "52", name: "Billing", helpCenterId: "123", locales: [] },
    ]);
  });

  it("unions collection default and translated locales", () => {
    expect(
      localesFromIntercomCollections([
        { id: "38", name: "Getting started", helpCenterId: "123", locales: ["en", "de"] },
        { id: "52", name: "Billing", helpCenterId: "123", locales: ["en", "fr"] },
      ]),
    ).toEqual(["en", "de", "fr"]);
  });
});

describe("listIntercomCollectionIdsForHelpCenter", () => {
  it("accepts a bare collection array from tests and older SDK shapes", async () => {
    const collections = await listIntercomCollectionIdsForHelpCenter({
      client: {
        helpCenters: {
          collections: {
            list: async () => [
              { id: "38", help_center_id: 123 },
              { id: "99", help_center_id: 456 },
            ],
          },
        },
      } as never,
      helpCenterId: "123",
    });

    expect(collections).toEqual(["38"]);
  });

  it("stops when the SDK reports hasNextPage without pages.next", async () => {
    let nextCalls = 0;
    const collections = await listIntercomCollectionIdsForHelpCenter({
      client: {
        helpCenters: {
          collections: {
            list: async () => ({
              data: [{ id: "38", help_center_id: 123 }],
              hasNextPage: () => true,
              getNextPage: async () => {
                nextCalls += 1;
                throw new Error("infinite pagination");
              },
            }),
          },
        },
      } as never,
      helpCenterId: "123",
    });

    expect(collections).toEqual(["38"]);
    expect(nextCalls).toBe(0);
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
    expect(intercomArticleToImportPayload(article, "de").body).toBe(
      "Willkommen bei Acme. Legen Sie ein Konto an, laden Sie Ihr Team ein und senden Sie Ihre erste Nachricht.",
    );
    expect(intercomArticleToImportPayload(article, "en").title).toBe("Getting started with Acme");
    expect(intercomArticleToImportPayload(article, "en").body).toBe(
      "Welcome to Acme. Create an account, invite your team, and send your first message.",
    );
  });

  it("fails when the configured source locale has no content", () => {
    const article = mapIntercomArticleSummary(intercomApiArticlesListResponse.data[2]!);

    expect(() => intercomArticleToImportPayload(article, "ja")).toThrow(
      "intercom_source_locale_content_missing",
    );
  });

  it("uses top-level body_markdown for the default locale instead of translated_content.en", () => {
    const article = mapIntercomArticleSummary({
      id: "6871119",
      title: "Default language title",
      description: "Default language description",
      body: "Default language body in html",
      body_markdown: "# Default language title\n\nDefault language body in markdown\n",
      default_locale: "en",
      translated_content: {
        type: "article_translated_content",
        en: {
          type: "article_content",
          title: "How to create a new article",
          description: "This article will show you how to create a new article.",
          body: "This is the body of the article.",
          body_markdown: "# How to create a new article\n\nThis is the body of the article.\n",
        },
      },
    });

    expect(intercomArticleToImportPayload(article, "en")).toEqual({
      title: "Default language title",
      description: "Default language description",
      body: "# Default language title\n\nDefault language body in markdown\n",
    });
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

  it("loads GET /articles/{id} so import can read body_markdown omitted from list items", async () => {
    const listed = mapIntercomArticleSummary({
      id: "2048",
      title: "Your first public article",
      description: "Some resources to help you understand how Articles can be used",
    });
    expect(listed.body).toBe("");

    const client = {
      articles: {
        find: async () => ({
          id: "2048",
          title: "Your first public article",
          description: "Some resources to help you understand how Articles can be used",
          body: "<p>Use articles to share help content.</p>",
          body_markdown: "Use articles to share help content.",
          default_locale: "en",
        }),
      },
    };

    const detailed = await loadIntercomArticleForImport(client as never, listed.id);
    expect(intercomArticleToImportPayload(detailed, "en").body).toBe(
      "Use articles to share help content.",
    );
  });
});

describe("updateIntercomArticleTranslatedContent", () => {
  it("writes translated_content drafts with body_markdown", async () => {
    const updates: unknown[] = [];
    const client = {
      articles: {
        update: async (payload: unknown) => {
          updates.push(payload);
        },
      },
    };

    await updateIntercomArticleTranslatedContent({
      client: client as never,
      articleId: "2048",
      authorId: 19,
      locale: "de",
      title: "Hallo",
      description: "Hilfe",
      body: "Go to *Settings*.",
    });

    expect(updates).toEqual([
      {
        article_id: 2048,
        translated_content: {
          type: "article_translated_content",
          de: {
            type: "article_content",
            title: "Hallo",
            description: "Hilfe",
            body_markdown: "Go to *Settings*.",
            state: "draft",
            author_id: 19,
          },
        },
      },
    ]);
    expect(JSON.stringify(updates)).not.toContain('"body":');
  });

  it("pushes the real Intercom body_markdown as a draft only", async () => {
    const updates: unknown[] = [];
    const client = {
      articles: {
        update: async (payload: unknown) => {
          updates.push(payload);
        },
      },
    };

    await updateIntercomArticleTranslatedContent({
      client: client as never,
      articleId: "2048",
      authorId: 19,
      locale: "fr",
      title: "Utiliser les articles",
      description: "Centre d'aide",
      body: INTERCOM_ARTICLE_BODY_MARKDOWN,
    });

    const update = updates[0] as {
      translated_content: { fr: { body_markdown: string; state: string } };
    };
    expect(update.translated_content.fr.state).toBe("draft");
    expect(update.translated_content.fr.body_markdown).toContain("{#h_bb4813e5c6}");
    expect(update.translated_content.fr.body_markdown).toContain(
      ':::callout backgroundColor="#feedaf80"',
    );
    expect(JSON.stringify(updates)).not.toContain('"body":');
  });
});

describe("parseIntercomNumericId", () => {
  it("parses Intercom string ids used by GET /articles/{article_id}", () => {
    expect(parseIntercomNumericId("6871119")).toBe(6871119);
    expect(parseIntercomNumericId("not-an-id")).toBeNull();
  });
});
