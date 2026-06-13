import { describe, expect, it, vi } from "vite-plus/test";

import { ContentfulManagementClient } from "./client";
import type { ContentfulAsset } from "./types";

function asset(version = 1): ContentfulAsset {
  return {
    sys: { id: "asset-source", version },
    fields: {
      title: { "en-US": "Hero banner" },
      file: {
        "en-US": {
          url: "//images.ctfassets.net/space/asset-source/hero.png",
          fileName: "hero.png",
          contentType: "image/png",
        },
      },
    },
  };
}

describe("ContentfulManagementClient asset helpers", () => {
  it("downloads asset files and creates localized assets from uploaded buffers", async () => {
    const createdAssets: Array<Record<string, unknown>> = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "https://images.ctfassets.net/space/asset-source/hero.png") {
        return new Response(Buffer.from("source-image"), { status: 200 });
      }

      if (url.endsWith("/uploads") && init?.method === "POST") {
        return Response.json({ sys: { id: "upload-1" } });
      }

      if (url.endsWith("/assets") && init?.method === "POST") {
        const requestBody = init?.body;
        const body = JSON.parse(
          typeof requestBody === "string" ? requestBody : "",
        ) as Record<string, unknown>;
        createdAssets.push(body);
        return Response.json({
          sys: { id: "asset-localized", version: 1 },
          fields: body.fields,
        });
      }

      if (url.endsWith("/assets/asset-source")) {
        return Response.json(asset());
      }

      if (url.endsWith("/assets/asset-localized/files/fr-FR/process") && init?.method === "PUT") {
        return Response.json({
          sys: { id: "asset-localized", version: 2 },
          fields: createdAssets[0]?.fields,
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

    const sourceAsset = await client.getAsset("asset-source");
    const downloaded = await client.downloadAssetFile({
      asset: sourceAsset,
      locale: "en-US",
    });
    expect(downloaded.buffer.toString()).toBe("source-image");

    const localized = await client.createLocalizedAsset({
      locale: "fr-FR",
      fileName: "hero-fr-fr.png",
      contentType: "image/png",
      buffer: Buffer.from("localized-image"),
      title: "Hero banner",
    });

    expect(localized.sys.id).toBe("asset-localized");
    expect(createdAssets[0]).toMatchObject({
      fields: {
        title: { "fr-FR": "Hero banner" },
        file: {
          "fr-FR": {
            fileName: "hero-fr-fr.png",
            contentType: "image/png",
          },
        },
      },
    });
  });
});
