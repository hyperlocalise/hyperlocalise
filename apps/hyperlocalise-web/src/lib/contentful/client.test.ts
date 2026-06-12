import { describe, expect, it, vi } from "vite-plus/test";

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

    const updated = await client.updateEntryDraft({
      entry: entry(1),
      translations: [{ fieldId: "title", locale: "fr-FR", value: "Bonjour" }],
    });

    expect(updated.sys.version).toBe(2);
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

    const created = await client.createWebhook({
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

    expect(created.sys.id).toBe("webhook-1");

    const listed = await client.listWebhooks();
    expect(listed).toHaveLength(1);

    const updated = await client.updateWebhook("webhook-1", {
      version: 1,
      name: "Hyperlocalise: Docs",
      url: created.url,
      topics: created.topics,
      filters: created.filters,
      headers: [{ key: CONTENTFUL_WEBHOOK_SECRET_HEADER, secret: true }],
    });
    expect(updated.name).toBe("Hyperlocalise: Docs");

    await client.deleteWebhook("webhook-1");
    expect(await client.listWebhooks()).toHaveLength(0);
  });
});
