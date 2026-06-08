import { describe, expect, it, vi } from "vite-plus/test";

import { ContentfulManagementClient } from "./client";
import type { ContentfulEntry } from "./types";
import { HYPERLOCALISE_CONTENTFUL_WRITEBACK_HEADER } from "./webhook";

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
    const successfulPutHeaders = successfulPut?.[1]?.headers;
    expect(successfulPutHeaders).toBeInstanceOf(Headers);
    expect((successfulPutHeaders as Headers).get(HYPERLOCALISE_CONTENTFUL_WRITEBACK_HEADER)).toBe(
      "true",
    );
  });
});
