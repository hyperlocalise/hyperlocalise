import "dotenv/config";

import { eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { regenerateImageFromAttachment, withPinnedPublicFetch } = vi.hoisted(() => ({
  regenerateImageFromAttachment: vi.fn(),
  withPinnedPublicFetch: vi.fn(),
}));

vi.mock("@/lib/agent-runtime/tools/workspace/pinned-fetch", () => ({
  withPinnedPublicFetch,
}));

vi.mock("@/lib/agents/image-generation", () => ({
  regenerateImageFromAttachment,
}));

import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { db, schema } from "@/lib/database";
import { isErr, isOk } from "@/lib/primitives/result/results";

import {
  fetchImageBytesFromUrl,
  localizeAndStoreImageVariant,
  replaceImageVariantBytes,
} from "./image-variant-service";

const projectFixture = createProjectTestFixture();
const { cleanup, createStoredProjectFixture } = projectFixture;

beforeAll(async () => {
  await db.$client.query("select 1");
});

beforeEach(() => {
  vi.clearAllMocks();
  regenerateImageFromAttachment.mockResolvedValue({
    image: Buffer.from("localized-image"),
    mimeType: "image/png",
  });
});

afterEach(async () => {
  await cleanup();
});

describe("fetchImageBytesFromUrl", () => {
  it("returns image bytes with a normalized content type and URL filename", async () => {
    withPinnedPublicFetch.mockImplementation(async (_url, _init, handler) =>
      handler(
        new Response(Buffer.from("source-image"), {
          status: 200,
          headers: { "content-type": "image/png; charset=binary" },
        }),
      ),
    );

    const result = await fetchImageBytesFromUrl("https://cdn.example.com/assets/hero.png?v=1");

    expect(withPinnedPublicFetch).toHaveBeenCalledWith(
      "https://cdn.example.com/assets/hero.png?v=1",
      { method: "GET" },
      expect.any(Function),
    );
    expect(isOk(result)).toBe(true);
    if (isErr(result)) {
      throw new Error("expected image fetch to succeed");
    }
    expect(result.value).toEqual({
      content: Buffer.from("source-image"),
      contentType: "image/png",
      filename: "hero.png",
    });
  });

  it("maps non-OK responses to fetch_failed without reading them as images", async () => {
    withPinnedPublicFetch.mockImplementation(async (_url, _init, handler) =>
      handler(
        new Response("bad gateway", {
          status: 502,
          headers: { "content-type": "image/png" },
        }),
      ),
    );

    const result = await fetchImageBytesFromUrl("https://cdn.example.com/assets/hero.png");

    expect(isErr(result)).toBe(true);
    if (isOk(result)) {
      throw new Error("expected image fetch to fail");
    }
    expect(result.error).toEqual({
      code: "fetch_failed",
      message: "image fetch failed with status 502",
    });
  });

  it("rejects successful responses that are not images", async () => {
    withPinnedPublicFetch.mockImplementation(async (_url, _init, handler) =>
      handler(
        new Response("<html></html>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      ),
    );

    const result = await fetchImageBytesFromUrl("https://cdn.example.com/assets/hero.png");

    expect(isErr(result)).toBe(true);
    if (isOk(result)) {
      throw new Error("expected non-image response to fail");
    }
    expect(result.error).toEqual({ code: "unsupported_image_response" });
  });

  it("maps pinned fetch failures to fetch_failed", async () => {
    withPinnedPublicFetch.mockRejectedValue(new Error("private address blocked"));

    const result = await fetchImageBytesFromUrl("https://cdn.example.com/assets/hero.png");

    expect(isErr(result)).toBe(true);
    if (isOk(result)) {
      throw new Error("expected pinned fetch error to fail");
    }
    expect(result.error).toEqual({
      code: "fetch_failed",
      message: "private address blocked",
    });
  });
});

describe("image variant approved locks", () => {
  it("does not localize over an approved variant unless forced", async () => {
    const { organization, project } = await createStoredProjectFixture();
    await db.insert(schema.projectImageVariants).values({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath: "assets/hero.png",
      targetLocale: "fr-FR",
      status: "approved",
      provenance: "manual",
    });

    const result = await localizeAndStoreImageVariant({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath: "assets/hero.png",
      targetLocale: "fr-FR",
      sourceUrl: "https://cdn.example.com/assets/hero.png",
      provenance: "agent",
    });

    expect(isErr(result)).toBe(true);
    if (isOk(result)) {
      throw new Error("expected approved variant to remain locked");
    }
    expect(result.error).toEqual({ code: "approved_locked" });
    expect(withPinnedPublicFetch).not.toHaveBeenCalled();
    expect(regenerateImageFromAttachment).not.toHaveBeenCalled();
  });

  it("does not replace approved variant bytes unless forced", async () => {
    const { organization, project } = await createStoredProjectFixture();
    const [variant] = await db
      .insert(schema.projectImageVariants)
      .values({
        organizationId: organization.id,
        projectId: project.id,
        sourcePath: "assets/hero.png",
        targetLocale: "fr-FR",
        status: "approved",
        provenance: "manual",
      })
      .returning();

    const result = await replaceImageVariantBytes({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath: "assets/hero.png",
      targetLocale: "fr-FR",
      content: Buffer.from("manual-upload"),
      contentType: "image/png",
      filename: "hero-fr.png",
    });

    expect(isErr(result)).toBe(true);
    if (isOk(result)) {
      throw new Error("expected approved variant to remain locked");
    }
    expect(result.error).toEqual({ code: "approved_locked" });

    const [storedVariant] = await db
      .select()
      .from(schema.projectImageVariants)
      .where(eq(schema.projectImageVariants.id, variant.id))
      .limit(1);
    expect(storedVariant).toMatchObject({
      status: "approved",
      storedFileId: null,
    });
  });
});
