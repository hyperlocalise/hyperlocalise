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
  createHubspotContentClientFromSdk,
  type HubspotApiRequestBody,
  type HubspotSdk,
} from "./client";
import {
  buildBlogContentDocument,
  buildPageDocument,
  hubspotDocumentHasCopy,
  type HubspotJson,
} from "./document";

function jsonResponse(status: number, body: HubspotJson) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

type ApiCall = {
  method: string;
  path: string;
  body?: HubspotApiRequestBody;
  qs?: Record<string, string>;
};

function sdkWith(apiRequest: HubspotSdk["apiRequest"]): HubspotSdk {
  return {
    apiRequest,
    marketing: { emails: { marketingEmailsApi: {} }, forms: { formsApi: {} } },
    cms: { blogs: { blogPosts: {} }, pages: { landingPagesApi: {}, sitePagesApi: {} } },
  } as unknown as HubspotSdk;
}

describe("hubspot message templates", () => {
  it("lists, reads, creates, and updates templates through the SDK request client", async () => {
    const calls: ApiCall[] = [];
    const client = createHubspotContentClientFromSdk(
      sdkWith(async (opts) => {
        calls.push(opts);
        if (opts.method === "GET" && opts.path === "/automation/email-templates/2026-09") {
          return jsonResponse(200, {
            results: [
              { id: "42", name: "Welcome", subject: "Hi", body: "<p>Hi</p>", folderId: "9" },
            ],
          });
        }
        if (opts.method === "GET") {
          return jsonResponse(200, {
            id: 42,
            name: "Welcome",
            subject: "Hi",
            body: "<p>Hi</p>",
            folderId: "9",
          });
        }
        if (opts.method === "POST") {
          return jsonResponse(200, { id: "99", name: opts.body?.name ?? "" });
        }
        return jsonResponse(200, {});
      }),
    );

    const listed = await client.listMessageTemplates();
    expect(listed).toEqual([{ id: "42", name: "Welcome" }]);

    const record = await client.getMessageTemplate("42");
    expect(record).toEqual({
      id: "42",
      name: "Welcome",
      subject: "Hi",
      body: "<p>Hi</p>",
      folderId: "9",
    });

    const created = await client.createMessageTemplate({
      name: "Welcome [fr-FR]",
      subject: "Bonjour",
      body: "<p>Bonjour</p>",
      folderId: "9",
    });
    expect(created).toEqual({ id: "99" });
    expect(calls.find((call) => call.method === "POST")?.body).toEqual({
      name: "Welcome [fr-FR]",
      subject: "Bonjour",
      body: "<p>Bonjour</p>",
      folderId: "9",
    });

    await client.updateMessageTemplate({
      id: "99",
      name: "Welcome [fr-FR]",
      subject: "Salut",
      body: "<p>Salut</p>",
    });
    expect(calls.find((call) => call.method === "PATCH")?.path).toBe(
      "/automation/email-templates/2026-09/99",
    );
  });

  it("creates a blog language variation before cloning a post into that language", async () => {
    const calls: ApiCall[] = [];
    let postVariations = 0;
    const blogs = {
      basicApi: {
        getById: async () => ({ id: "post-1", contentGroupId: "blog-1", language: "en" }),
      },
      multiLanguageApi: {
        createLangVariation: async () => {
          postVariations += 1;
          if (postVariations === 1) {
            throw new Error(
              'HTTP-Code: 400\nBody: {"message":"Blog does not have a variation for language zh-cn"}',
            );
          }
          return { id: "post-zh" };
        },
      },
    };
    const content = createHubspotContentClientFromSdk({
      ...sdkWith(async (opts) => {
        calls.push(opts);
        if (opts.method === "GET") {
          return jsonResponse(200, {
            id: "blog-1",
            slug: "blog",
            language: "en",
            domain: "blog.example.com",
          });
        }
        return jsonResponse(200, { id: "blog-zh", language: "zh-cn" });
      }),
      cms: {
        blogs: { blogPosts: blogs },
        pages: { landingPagesApi: {}, sitePagesApi: {} },
      },
    } as unknown as HubspotSdk);
    const created = await content.createBlogLanguageVariation({ id: "post-1", language: "zh-cn" });
    expect(created).toEqual({ id: "post-zh" });
    expect(postVariations).toBe(2);
    expect(calls).toEqual([
      {
        method: "GET",
        path: "/cms/v3/blog-settings/settings/blog-1",
      },
      {
        method: "POST",
        path: "/cms/v3/blog-settings/settings/multi-language/create-language-variation",
        body: { id: "blog-1", language: "zh-cn", primaryLanguage: "en", slug: "blog-zh-cn" },
      },
    ]);
  });

  it("sets a blog domain before creating a language variation when the blog has none", async () => {
    const calls: ApiCall[] = [];
    let postVariations = 0;
    const blogs = {
      basicApi: {
        getById: async () => ({ id: "post-1", contentGroupId: "blog-1", language: "en" }),
      },
      multiLanguageApi: {
        createLangVariation: async () => {
          postVariations += 1;
          if (postVariations === 1) {
            throw new Error(
              'HTTP-Code: 400\nBody: {"message":"Blog does not have a variation for language zh-cn"}',
            );
          }
          return { id: "post-zh" };
        },
      },
    };
    const content = createHubspotContentClientFromSdk({
      ...sdkWith(async (opts) => {
        calls.push(opts);
        if (opts.method === "GET" && opts.path === "/cms/v3/domains/") {
          return jsonResponse(200, {
            results: [
              { domain: "old.hs-sites.com", isUsedForBlogPost: true, isResolving: true },
              {
                domain: "247843607.hubspotpagebuilder.com",
                primaryBlogPost: true,
                isResolving: true,
              },
            ],
          });
        }
        if (opts.method === "GET") {
          return jsonResponse(200, { id: "blog-1", slug: "blog", language: "en", domain: "" });
        }
        return jsonResponse(200, {});
      }),
      cms: {
        blogs: { blogPosts: blogs },
        pages: { landingPagesApi: {}, sitePagesApi: {} },
      },
    } as unknown as HubspotSdk);

    const created = await content.createBlogLanguageVariation({ id: "post-1", language: "zh-cn" });
    expect(created).toEqual({ id: "post-zh" });
    expect(calls).toEqual([
      { method: "GET", path: "/cms/v3/blog-settings/settings/blog-1" },
      { method: "GET", path: "/cms/v3/domains/" },
      {
        method: "PATCH",
        path: "/cms/v3/blog-settings/settings/blog-1",
        body: { domain: "247843607.hubspotpagebuilder.com" },
      },
      {
        method: "POST",
        path: "/cms/v3/blog-settings/settings/multi-language/create-language-variation",
        body: { id: "blog-1", language: "zh-cn", primaryLanguage: "en", slug: "blog-zh-cn" },
      },
    ]);
  });

  it("uses the blog url host when the domain field is blank", async () => {
    const calls: ApiCall[] = [];
    let postVariations = 0;
    const content = createHubspotContentClientFromSdk({
      ...sdkWith(async (opts) => {
        calls.push(opts);
        if (opts.method === "GET") {
          return jsonResponse(200, {
            id: "blog-1",
            slug: "blog",
            language: "en",
            domain: "",
            absoluteUrl: "https://247843607.hubspotpagebuilder.com/blog",
          });
        }
        return jsonResponse(200, {});
      }),
      cms: {
        blogs: {
          blogPosts: {
            basicApi: {
              getById: async () => ({ id: "post-1", contentGroupId: "blog-1", language: "en" }),
            },
            multiLanguageApi: {
              createLangVariation: async () => {
                postVariations += 1;
                if (postVariations === 1) {
                  throw new Error(
                    'HTTP-Code: 400\nBody: {"message":"Blog does not have a variation for language zh-cn"}',
                  );
                }
                return { id: "post-zh" };
              },
            },
          },
        },
        pages: { landingPagesApi: {}, sitePagesApi: {} },
      },
    } as unknown as HubspotSdk);

    await content.createBlogLanguageVariation({ id: "post-1", language: "zh-cn" });
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      "GET /cms/v3/blog-settings/settings/blog-1",
      "PATCH /cms/v3/blog-settings/settings/blog-1",
      "POST /cms/v3/blog-settings/settings/multi-language/create-language-variation",
    ]);
    expect(calls[1]).toMatchObject({
      body: { domain: "247843607.hubspotpagebuilder.com" },
    });
  });

  it("reads draft module text when the published page is empty", async () => {
    const client = createHubspotContentClientFromSdk(
      sdkWith(async (opts) => {
        if (opts.path === "/cms/v3/pages/site-pages/home") {
          return jsonResponse(200, {
            id: "home",
            name: "Home",
            language: "en",
            widgets: {},
            layoutSections: {},
            widgetContainers: {},
          });
        }
        if (opts.path === "/cms/v3/pages/site-pages/home/draft") {
          return jsonResponse(200, {
            id: "home",
            name: "Home",
            widgets: {
              hero: {
                id: "hero",
                type: "module",
                body: {
                  html: { value: "<p>Welcome to the homepage with a lot of text.</p>" },
                },
              },
            },
            layoutSections: {
              dnd_area: {
                rows: [
                  {
                    "0": {
                      widgets: [{ body: { html: "<p>Section copy that the editor shows.</p>" } }],
                    },
                  },
                ],
              },
            },
          });
        }
        return jsonResponse(404, {});
      }),
    );
    const page = await client.getWebsitePage("home");
    const document = buildPageDocument(page);
    expect(hubspotDocumentHasCopy(document)).toBe(true);
    expect(JSON.stringify(document)).toContain("Welcome to the homepage");
    expect(JSON.stringify(document)).toContain("Section copy that the editor shows");
  });

  it("patches the page draft without dropping nested module fields", async () => {
    const calls: ApiCall[] = [];
    const layoutSections = {
      dnd_area: {
        rows: [
          {
            "0": {
              widgets: [{ body: { html: "<p>Section copy that the editor shows.</p>" } }],
            },
          },
        ],
      },
    };
    const client = createHubspotContentClientFromSdk(
      sdkWith(async (opts) => {
        calls.push({ method: opts.method, path: opts.path, body: opts.body });
        return jsonResponse(200, {});
      }),
    );
    await client.updateLandingPageDraft({
      id: "page-1",
      name: "Landing page [zh-CN]",
      language: "zh-cn",
      htmlTitle: "Landing",
      metaDescription: "",
      featuredImageAltText: "",
      widgets: {},
      layoutSections,
      widgetContainers: {},
    });
    expect(calls).toEqual([
      {
        method: "PATCH",
        path: "/cms/v3/pages/landing-pages/page-1/draft",
        body: {
          name: "Landing page [zh-CN]",
          language: "zh-cn",
          htmlTitle: "Landing",
          metaDescription: "",
          featuredImageAltText: "",
          widgets: {},
          layoutSections,
          widgetContainers: {},
        },
      },
    ]);
  });

  it("reads blog section text from the raw post and draft", async () => {
    const client = createHubspotContentClientFromSdk(
      sdkWith(async (opts) => {
        if (opts.path.endsWith("/draft")) {
          return jsonResponse(200, {
            id: "post-1",
            name: "Launch",
            htmlTitle: "Launch",
            postBody: "<p>Intro</p>",
            layoutSections: {
              dnd_area: {
                rows: [
                  {
                    "0": {
                      params: {
                        html: "<h2>Section heading with a lot of text</h2><p>Section body.</p>",
                      },
                    },
                  },
                ],
              },
            },
          });
        }
        return jsonResponse(200, {
          id: "post-1",
          name: "Launch",
          htmlTitle: "Launch",
          postBody: "<p>Intro</p>",
          layoutSections: {},
        });
      }),
    );
    const post = await client.getBlogPost("post-1");
    const document = buildBlogContentDocument(post);
    expect(JSON.stringify(document)).toContain("Section heading with a lot of text");
    expect(document.postBody).toBe("<p>Intro</p>");
  });

  it("keeps the published article and the draft section copy", async () => {
    const article =
      "<p>The full article with a lot of section text that only the published post still has.</p>";
    const client = createHubspotContentClientFromSdk(
      sdkWith(async (opts) => {
        if (opts.path.endsWith("/draft")) {
          return jsonResponse(200, {
            id: "post-1",
            name: "Launch",
            htmlTitle: "Launch",
            postBody: "<p>Intro</p>",
            widgets: {
              hero: {
                body: {
                  richtext_field: {
                    value: {
                      content:
                        "<h2>Draft section heading</h2><p>Draft section body with a lot of text.</p>",
                    },
                  },
                },
              },
            },
            layoutSections: {},
          });
        }
        return jsonResponse(200, {
          id: "post-1",
          name: "Launch",
          htmlTitle: "Launch",
          postBody: article,
          widgets: {},
          layoutSections: {},
        });
      }),
    );
    const post = await client.getBlogPost("post-1");
    const document = buildBlogContentDocument(post);
    const serialized = JSON.stringify(document);
    expect(document.postBody).toBe(article);
    expect(serialized).toContain("Draft section body with a lot of text");
  });

  it("reads blog template sections when the post layout is empty", async () => {
    const template = `{% dnd_area "dnd_area" %}
      {% dnd_module path="@hubspot/rich_text" %}
        {% module_attribute "html" %}
          <h2>Pull quote from the blog template.</h2>
        {% end_module_attribute %}
      {% end_dnd_module %}
    {% end_dnd_area %}`;
    const client = createHubspotContentClientFromSdk(
      sdkWith(async (opts) => {
        if (opts.path.includes("/cms/v3/source-code/")) {
          return { ok: true, status: 200, text: async () => template };
        }
        return jsonResponse(200, {
          id: "post-1",
          name: "Launch",
          htmlTitle: "Launch",
          postBody: "<p>The article.</p>",
          templatePath: "theme/templates/blog-post.html",
          layoutSections: {},
          widgets: {},
          widgetContainers: {},
        });
      }),
    );
    const post = await client.getBlogPost("post-1");
    const document = buildBlogContentDocument(post);
    expect(document.postBody).toBe("<p>The article.</p>");
    expect(JSON.stringify(document)).toContain("Pull quote from the blog template");
  });

  it("reads template default copy when the page and its draft have none", async () => {
    const template = `{% dnd_area "dnd_area" %}
      {% dnd_module path="@hubspot/rich_text" %}
        {% module_attribute "html" %}
          <h1>Welcome to the homepage with a lot of text.</h1>
          <p>This is the template default the editor shows.</p>
        {% end_module_attribute %}
      {% end_dnd_module %}
    {% end_dnd_area %}`;
    const client = createHubspotContentClientFromSdk(
      sdkWith(async (opts) => {
        if (opts.path.includes("/cms/v3/source-code/")) {
          return { ok: true, status: 200, text: async () => template };
        }
        return jsonResponse(200, {
          id: "home",
          name: "Home",
          templatePath: "theme/templates/home.html",
          widgets: {},
          layoutSections: {},
          widgetContainers: {},
        });
      }),
    );
    const page = await client.getWebsitePage("home");
    const document = buildPageDocument(page);
    expect(hubspotDocumentHasCopy(document)).toBe(true);
    expect(JSON.stringify(document)).toContain("Welcome to the homepage with a lot of text");
    expect(JSON.stringify(document)).toContain("template default the editor shows");
  });

  it("fails the list when HubSpot rejects the request", async () => {
    const client = createHubspotContentClientFromSdk(
      sdkWith(async () => jsonResponse(403, { message: "missing scope" })),
    );
    await expect(client.listMessageTemplates()).rejects.toThrow(
      "hubspot_message_template_request_failed:403",
    );
  });

  it("reads email style settings and writes them back onto the draft", async () => {
    let draft: { content?: { styleSettings?: unknown; widgets?: unknown } } | undefined;
    const base = sdkWith(async () => jsonResponse(200, {}));
    const client = createHubspotContentClientFromSdk({
      ...base,
      marketing: {
        emails: {
          marketingEmailsApi: {
            getPage: async () => ({ results: [] }),
            getById: async () => ({
              id: "42",
              name: "Welcome",
              language: "en",
              subject: "Hi",
              content: {
                widgets: { module: { body: "Hi" } },
                styleSettings: { backgroundColor: "#ffffff", emailBodyWidth: "600" },
              },
            }),
            clone: async () => ({ id: "99" }),
            upsertDraft: async (_id: string, request: typeof draft) => {
              draft = request;
              return {};
            },
          },
        },
        forms: { formsApi: {} },
      },
    } as unknown as HubspotSdk);

    const record = await client.getEmail("42");
    expect(record.styleSettings).toEqual({
      backgroundColor: "#ffffff",
      emailBodyWidth: "600",
    });

    await client.updateEmailDraft({
      id: "99",
      name: "Welcome [fr-FR]",
      language: "fr",
      subject: "Bonjour",
      widgets: { module: { body: "Bonjour" } },
      styleSettings: record.styleSettings,
    });
    expect(draft?.content?.styleSettings).toEqual({
      backgroundColor: "#ffffff",
      emailBodyWidth: "600",
    });
  });
});
