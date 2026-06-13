import { describe, expect, it, vi } from "vite-plus/test";

import { isErr } from "@/lib/primitives/result/results";

import {
  ContentfulManagementClient,
  CONTENTFUL_WEBHOOK_PUBLISH_TOPIC,
  CONTENTFUL_WEBHOOK_SECRET_HEADER,
} from "./client";
import type { ContentfulEntry } from "./types";

function parseRequestBody(body: BodyInit | null | undefined) {
  if (typeof body === "string") {
    return JSON.parse(body) as Record<string, unknown>;
  }
  throw new Error("expected string request body");
}

function entry(version: number): ContentfulEntry {
  return {
    sys: {
      id: "entry-1",
      version,
      contentType: { sys: { id: "blogPost" } },
    },
    fields: {
      title: { "en-US": "Hello" },
    },
  };
}

describe("ContentfulManagementClient", () => {
  it("retries draft updates after a version conflict by re-fetching the entry", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/entries/entry-1") && init?.method === "PUT") {
        const version =
          init.headers instanceof Headers ? init.headers.get("x-contentful-version") : null;
        if (version === "1") {
          return new Response(null, { status: 409 });
        }
        return Response.json(entry(2));
      }

      if (url.endsWith("/entries/entry-1")) {
        return Response.json(entry(2));
      }

      return new Response(null, { status: 404 });
    });

    const client = new ContentfulManagementClient({
      accessToken: "token",
      spaceId: "space",
      environmentId: "master",
      fetchImpl: fetchImpl as typeof fetch,
    });

    const updatedResult = await client.updateEntryDraft({
      entry: entry(1),
      translations: [{ fieldId: "title", locale: "fr-FR", value: "Bonjour" }],
    });
    if (isErr(updatedResult)) {
      throw new Error("expected draft update");
    }

    expect(updatedResult.value.sys.version).toBe(2);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const successfulPut = fetchImpl.mock.calls.find(
      ([url, init]) =>
        typeof url === "string" &&
        url.endsWith("/entries/entry-1") &&
        init?.method === "PUT" &&
        init.headers instanceof Headers &&
        init.headers.get("x-contentful-version") === "2",
    );
    expect(successfulPut).toBeDefined();
  });

  it("creates, updates, lists, and deletes provider webhooks", async () => {
    const webhooks = new Map<string, { version: number; body: Record<string, unknown> }>();
    let nextId = 1;

    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/webhook_definitions") && init?.method === "POST") {
        const body = parseRequestBody(init.body);
        const id = `webhook-${nextId++}`;
        webhooks.set(id, { version: 1, body });
        return Response.json({
          sys: { id, version: 1 },
          ...body,
        });
      }

      if (url.includes("/webhook_definitions/") && init?.method === "PUT") {
        const id = url.split("/").pop() ?? "";
        const existing = webhooks.get(id);
        if (!existing) {
          return new Response(null, { status: 404 });
        }
        const body = parseRequestBody(init.body);
        existing.version += 1;
        existing.body = { ...existing.body, ...body };
        return Response.json({
          sys: { id, version: existing.version },
          ...existing.body,
        });
      }

      if (url.includes("/webhook_definitions/") && init?.method === "DELETE") {
        const id = url.split("/").pop() ?? "";
        webhooks.delete(id);
        return new Response(null, { status: 204 });
      }

      if (url.endsWith("/webhook_definitions/webhook-1")) {
        const existing = webhooks.get("webhook-1");
        return Response.json({
          sys: { id: "webhook-1", version: existing?.version ?? 1 },
          ...existing?.body,
        });
      }

      if (url.endsWith("/webhook_definitions")) {
        return Response.json({
          items: [...webhooks.entries()].map(([id, value]) => ({
            sys: { id, version: value.version },
            ...value.body,
          })),
        });
      }

      return new Response(null, { status: 404 });
    });

    const client = new ContentfulManagementClient({
      accessToken: "token",
      spaceId: "space",
      environmentId: "master",
      fetchImpl: fetchImpl as typeof fetch,
    });

    const createdResult = await client.createWebhook({
      name: "Hyperlocalise: Help Center",
      url: "https://app.example.com/api/webhooks/contentful/sub-1",
      topics: [CONTENTFUL_WEBHOOK_PUBLISH_TOPIC],
      filters: [],
      headers: [
        {
          key: CONTENTFUL_WEBHOOK_SECRET_HEADER,
          value: "secret-value",
          secret: true,
        },
      ],
    });
    if (isErr(createdResult)) {
      throw new Error("expected webhook creation");
    }

    expect(createdResult.value.sys.id).toBe("webhook-1");

    const listedResult = await client.listWebhooks();
    if (isErr(listedResult)) {
      throw new Error("expected webhook list");
    }
    expect(listedResult.value).toHaveLength(1);

    const updatedResult = await client.updateWebhook("webhook-1", {
      version: 1,
      name: "Hyperlocalise: Docs",
      url: createdResult.value.url,
      topics: createdResult.value.topics,
      filters: createdResult.value.filters,
      headers: [{ key: CONTENTFUL_WEBHOOK_SECRET_HEADER, secret: true }],
    });
    if (isErr(updatedResult)) {
      throw new Error("expected webhook update");
    }
    expect(updatedResult.value.name).toBe("Hyperlocalise: Docs");

    const deleteResult = await client.deleteWebhook("webhook-1");
    if (isErr(deleteResult)) {
      throw new Error("expected webhook deletion");
    }
    const emptyListResult = await client.listWebhooks();
    if (isErr(emptyListResult)) {
      throw new Error("expected empty webhook list");
    }
    expect(emptyListResult.value).toHaveLength(0);
  });

  it("lists content types for the configured environment", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes("/content_types?limit=100&skip=0")) {
        return Response.json({
          total: 2,
          items: [
            { sys: { id: "helpCenterArticle" }, name: "Help Center Article" },
            { sys: { id: "blogPost" }, name: "Blog Post" },
          ],
        });
      }

      return new Response(null, { status: 404 });
    });

    const client = new ContentfulManagementClient({
      accessToken: "token",
      spaceId: "space",
      environmentId: "master",
      fetchImpl: fetchImpl as typeof fetch,
    });

    const result = await client.listContentTypes();
    if (isErr(result)) {
      throw new Error("expected content type list");
    }

    expect(result.value).toEqual([
      { id: "helpCenterArticle", name: "Help Center Article" },
      { id: "blogPost", name: "Blog Post" },
    ]);
  });

  it("paginates content types when a space has more than one page", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes("/content_types?limit=100&skip=0")) {
        return Response.json({
          total: 101,
          items: Array.from({ length: 100 }, (_, index) => ({
            sys: { id: `contentType${index}` },
            name: `Content Type ${index}`,
          })),
        });
      }

      if (url.includes("/content_types?limit=100&skip=100")) {
        return Response.json({
          total: 101,
          items: [{ sys: { id: "contentType100" }, name: "Content Type 100" }],
        });
      }

      return new Response(null, { status: 404 });
    });

    const client = new ContentfulManagementClient({
      accessToken: "token",
      spaceId: "space",
      environmentId: "master",
      fetchImpl: fetchImpl as typeof fetch,
    });

    const result = await client.listContentTypes();
    if (isErr(result)) {
      throw new Error("expected paginated content type list");
    }

    expect(result.value).toHaveLength(101);
    expect(result.value[0]).toEqual({ id: "contentType0", name: "Content Type 0" });
    expect(result.value[100]).toEqual({ id: "contentType100", name: "Content Type 100" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("surfaces Contentful management API error messages from response bodies", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json(
        {
          sys: { type: "Error", id: "AccessTokenInvalid" },
          message: "The access token you sent could not be found or is invalid.",
        },
        { status: 401 },
      ),
    );

    const client = new ContentfulManagementClient({
      accessToken: "token",
      spaceId: "space",
      environmentId: "master",
      fetchImpl: fetchImpl as typeof fetch,
    });

    const result = await client.listContentTypes();
    if (!isErr(result)) {
      throw new Error("expected content type list failure");
    }

    expect(result.error.status).toBe(401);
    expect(result.error.message).toBe(
      "The access token you sent could not be found or is invalid.",
    );
    expect(result.error.contentfulErrorId).toBe("AccessTokenInvalid");
  });
});
