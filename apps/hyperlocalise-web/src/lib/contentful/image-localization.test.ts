import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { regenerateImageFromAttachment } = vi.hoisted(() => ({
  regenerateImageFromAttachment: vi.fn(),
}));

vi.mock("@/lib/agents/image-generation", () => ({
  regenerateImageFromAttachment,
}));

import { ContentfulManagementClient } from "./client";
import { localizeContentfulAssetForLocale } from "./image-localization";

describe("contentful image localization", () => {
  beforeEach(() => {
    regenerateImageFromAttachment.mockReset();
    regenerateImageFromAttachment.mockResolvedValue({
      image: Buffer.from("localized-image"),
      mimeType: "image/png",
      prompt: "localized",
    });
  });

  it("downloads, localizes, and uploads a Contentful asset for the target locale", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "https://images.ctfassets.net/space/asset-source/hero.png") {
        return new Response(Buffer.from("source-image"), { status: 200 });
      }

      if (url.endsWith("/uploads") && init?.method === "POST") {
        return Response.json({ sys: { id: "upload-1" } });
      }

      if (url.endsWith("/assets") && init?.method === "POST") {
        return Response.json({
          sys: { id: "asset-localized", version: 1 },
          fields: {},
        });
      }

      if (url.endsWith("/assets/asset-source")) {
        return Response.json({
          sys: { id: "asset-source", version: 1 },
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
        });
      }

      if (url.endsWith("/assets/asset-localized/files/fr-FR/process") && init?.method === "PUT") {
        return Response.json({
          sys: { id: "asset-localized", version: 2 },
          fields: {},
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

    const result = await localizeContentfulAssetForLocale({
      client,
      assetId: "asset-source",
      sourceLocale: "en-US",
      targetLocale: "fr-FR",
      fieldName: "Hero Image",
    });

    expect(result).toEqual({
      sourceAssetId: "asset-source",
      localizedAssetId: "asset-localized",
      fileName: "hero-fr-fr.png",
    });
    expect(regenerateImageFromAttachment).toHaveBeenCalledWith(
      expect.any(Buffer),
      "image/png",
      expect.stringContaining("Target locale: fr-FR"),
    );
  });
});
