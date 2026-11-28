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

import { isErr } from "@/lib/primitives/result/results";

import { StoryblokManagementClient } from "./client";

function createClient(fetchImpl: typeof fetch, region: "eu" | "us" = "eu") {
  return new StoryblokManagementClient({
    accessToken: "pat-123",
    region,
    fetchImpl,
    sleep: async () => {},
  });
}

describe("StoryblokManagementClient", () => {
  it("sends the personal access token as-is to the region host", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ spaces: [{ id: 42, name: "Site" }] }));
    const result = await createClient(fetchImpl as unknown as typeof fetch, "us").listSpaces();

    expect(result).toEqual({ ok: true, value: [{ id: "42", name: "Site", region: null }] });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api-us.storyblok.com/v1/spaces");
    expect((init.headers as Record<string, string>).Authorization).toBe("pat-123");
  });

  it("reads space languages from options", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        space: {
          id: 7,
          name: "Docs",
          options: {
            languages: [
              { code: "de", name: "German" },
              { code: "", name: "Blank" },
            ],
          },
        },
      }),
    );
    const result = await createClient(fetchImpl as unknown as typeof fetch).getSpace("7");

    expect(result.ok && result.value.languages).toEqual([{ code: "de", name: "German" }]);
  });

  it("lists stories only, sorted by update time, with the total header", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            stories: [
              { id: 1, name: "Home", slug: "home", full_slug: "en/home", updated_at: "2026-01-01" },
            ],
          }),
          { headers: { total: "130", "content-type": "application/json" } },
        ),
    );
    const result = await createClient(fetchImpl as unknown as typeof fetch).listStories({
      spaceId: "7",
      startsWith: "blog/",
    });

    expect(result.ok && result.value.total).toBe(130);
    expect(result.ok && result.value.stories[0]?.fullSlug).toBe("en/home");
    const url = new URL((fetchImpl.mock.calls[0] as unknown as [string])[0]);
    expect(url.searchParams.get("story_only")).toBe("true");
    expect(url.searchParams.get("starts_with")).toBe("blog/");
    expect(url.searchParams.get("sort_by")).toBe("updated_at:asc");
  });

  it("exports a language with lang_code and export_lang", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ "uid:page:title": "Hallo", page: "1", language: "de", nested: { x: 1 } }),
    );
    const result = await createClient(fetchImpl as unknown as typeof fetch).exportStory({
      spaceId: "7",
      storyId: "99",
      langCode: "de",
    });

    expect(result).toEqual({
      ok: true,
      value: { "uid:page:title": "Hallo", page: "1", language: "de" },
    });
    const url = new URL((fetchImpl.mock.calls[0] as unknown as [string])[0]);
    expect(url.pathname).toBe("/v1/spaces/7/stories/99/export.json");
    expect(url.searchParams.get("version")).toBe("2");
    expect(url.searchParams.get("lang_code")).toBe("de");
    expect(url.searchParams.get("export_lang")).toBe("true");
  });

  it("imports a translation as a stringified data payload", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ story: { id: 99 } }));
    const payload = { "uid:page:title": "Hallo", language: "de" };
    const result = await createClient(fetchImpl as unknown as typeof fetch).importStoryTranslation({
      spaceId: "7",
      storyId: "99",
      langCode: "de",
      payload,
    });

    expect(result.ok).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("PUT");
    expect(new URL(url).searchParams.get("import_lang")).toBe("true");
    expect(JSON.parse(init.body as string)).toEqual({ data: JSON.stringify(payload) });
  });

  it("retries rate-limited requests before giving up", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("slow down", { status: 429 }))
      .mockResolvedValueOnce(Response.json({ spaces: [] }));
    const result = await createClient(fetchImpl as unknown as typeof fetch).listSpaces();

    expect(result).toEqual({ ok: true, value: [] });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("returns the status and message on failure", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ error: "Unauthorized" }, { status: 401 }));
    const result = await createClient(fetchImpl as unknown as typeof fetch).listSpaces();

    expect(isErr(result) && result.error).toMatchObject({ status: 401, message: "Unauthorized" });
  });
});
