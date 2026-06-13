import { describe, expect, it, vi } from "vite-plus/test";

import { isErr } from "@/lib/primitives/result/results";

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
    let processRequestInit: RequestInit | undefined;
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "https://images.ctfassets.net/space/asset-source/hero.png") {
        return new Response(Buffer.from("source-image"), { status: 200 });
      }

      if (url.endsWith("/uploads") && init?.method === "POST") {
        return Response.json({ sys: { id: "upload-1" } });
      }

      if (url.endsWith("/assets") && init?.method === "POST") {
        const requestBody = init?.body;
        const body = JSON.parse(typeof requestBody === "string" ? requestBody : "") as Record<
          string,
          unknown
        >;
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
        processRequestInit = init;
        return new Response(null, { status: 204 });
      }

      return new Response(null, { status: 404 });
    });

    const client = new ContentfulManagementClient({
      accessToken: "token",
      spaceId: "space",
      environmentId: "master",
      fetchImpl: fetchImpl as typeof fetch,
    });

    const sourceAssetResult = await client.getAsset("asset-source");
    if (isErr(sourceAssetResult)) {
      throw new Error("expected source asset");
    }
    const downloadedResult = await client.downloadAssetFile({
      asset: sourceAssetResult.value,
      locale: "en-US",
    });
    if (isErr(downloadedResult)) {
      throw new Error("expected downloaded asset file");
    }
    expect(downloadedResult.value.buffer.toString()).toBe("source-image");

    const localizedResult = await client.createLocalizedAsset({
      locale: "fr-FR",
      fileName: "hero-fr-fr.png",
      contentType: "image/png",
      buffer: Buffer.from("localized-image"),
      title: "Hero banner",
    });
    if (isErr(localizedResult)) {
      throw new Error("expected localized asset");
    }

    expect(localizedResult.value.sys.id).toBe("asset-localized");
    expect(new Headers(processRequestInit?.headers).get("X-Contentful-Version")).toBe("1");
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

  it("fails when the requested asset locale has no file", async () => {
    const fetchImpl = vi.fn();
    const client = new ContentfulManagementClient({
      accessToken: "token",
      spaceId: "space",
      environmentId: "master",
      fetchImpl: fetchImpl as typeof fetch,
    });

    const result = await client.downloadAssetFile({
      asset: asset(),
      locale: "de-DE",
    });
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) {
      throw new Error("expected missing locale error");
    }
    expect(result.error).toMatchObject({
      code: "contentful_request_failed",
      status: 404,
      message: "Contentful asset asset-source has no file for locale de-DE",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
