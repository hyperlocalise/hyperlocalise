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

import { WebflowDataClient } from "./client";

describe("WebflowDataClient", () => {
  it("lists sites and loads site locales", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith("/v2/sites")) {
        return Response.json({
          sites: [{ id: "site-1", displayName: "Marketing" }],
        });
      }
      if (url.endsWith("/v2/sites/site-1")) {
        return Response.json({
          id: "site-1",
          displayName: "Marketing",
          locales: {
            primary: {
              id: "loc-primary",
              cmsLocaleId: "cms-primary",
              tag: "en-US",
              enabled: true,
            },
            secondary: [
              {
                id: "loc-fr",
                cmsLocaleId: "cms-fr",
                tag: "fr-FR",
                enabled: true,
              },
            ],
          },
        });
      }
      return new Response(null, { status: 404 });
    });

    const client = new WebflowDataClient({
      accessToken: "token",
      fetchImpl: fetchImpl as typeof fetch,
    });

    const sites = await client.listSites();
    if (isErr(sites)) {
      throw new Error("expected sites");
    }
    expect(sites.value).toHaveLength(1);

    const site = await client.getSite("site-1");
    if (isErr(site)) {
      throw new Error("expected site");
    }
    expect(site.value.locales.primary.tag).toBe("en-US");
    expect(site.value.locales.secondary[0]?.tag).toBe("fr-FR");
  });

  it("patches collection items with cmsLocaleId query", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/items/item-1") && init?.method === "PATCH") {
        expect(url).toContain("cmsLocaleId=cms-fr");
        if (typeof init.body !== "string") {
          throw new Error("expected a JSON string request body");
        }
        const body = JSON.parse(init.body) as { fieldData: Record<string, string> };
        expect(body.fieldData.title).toBe("Bonjour");
        return Response.json({
          id: "item-1",
          fieldData: body.fieldData,
        });
      }
      return new Response(null, { status: 404 });
    });

    const client = new WebflowDataClient({
      accessToken: "token",
      fetchImpl: fetchImpl as typeof fetch,
    });

    const patched = await client.patchCollectionItem({
      collectionId: "col-1",
      itemId: "item-1",
      cmsLocaleId: "cms-fr",
      fieldData: { title: "Bonjour" },
    });
    if (isErr(patched)) {
      throw new Error("expected patch");
    }
    expect(patched.value.fieldData.title).toBe("Bonjour");
  });
});
