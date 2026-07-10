import "dotenv/config";

import { eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { regenerateImageFromAttachment } = vi.hoisted(() => ({
  regenerateImageFromAttachment: vi.fn(),
}));

const dnsMock = vi.hoisted(() => ({
  lookup: vi.fn(),
}));

vi.mock("node:dns/promises", () => ({
  lookup: dnsMock.lookup,
}));

vi.mock("@/lib/agents/image-generation", () => ({
  regenerateImageFromAttachment,
}));

import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { db, schema } from "@/lib/database";
import { isErr, isOk } from "@/lib/primitives/result/results";
import { MAX_PUBLIC_HTTP_RESPONSE_BYTES } from "@/lib/security/public-http-fetch";

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
  dnsMock.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  regenerateImageFromAttachment.mockResolvedValue({
    image: Buffer.from("localized-image"),
    mimeType: "image/png",
  });
});

afterEach(async () => {
  await cleanup();
});

describe("fetchImageBytesFromUrl", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns image bytes with a normalized content type and URL filename", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(Buffer.from("source-image"), {
          status: 200,
          headers: { "content-type": "image/png; charset=binary" },
        }),
    ) as typeof fetch;

    const result = await fetchImageBytesFromUrl("https://cdn.example.com/assets/hero.png?v=1");

    expect(globalThis.fetch).toHaveBeenCalledWith("https://cdn.example.com/assets/hero.png?v=1", {
      method: "GET",
      redirect: "error",
    });
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
    globalThis.fetch = vi.fn(
      async () =>
        new Response("bad gateway", {
          status: 502,
          headers: { "content-type": "image/png" },
        }),
    ) as typeof fetch;

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
    globalThis.fetch = vi.fn(
      async () =>
        new Response("<html></html>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
    ) as typeof fetch;

    const result = await fetchImageBytesFromUrl("https://cdn.example.com/assets/hero.png");

    expect(isErr(result)).toBe(true);
    if (isOk(result)) {
      throw new Error("expected non-image response to fail");
    }
    expect(result.error).toEqual({ code: "unsupported_image_response" });
  });

  it("maps fetch failures to fetch_failed", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("network down");
    }) as typeof fetch;

    const result = await fetchImageBytesFromUrl("https://cdn.example.com/assets/hero.png");

    expect(isErr(result)).toBe(true);
    if (isOk(result)) {
      throw new Error("expected fetch error to fail");
    }
    expect(result.error).toEqual({
      code: "fetch_failed",
      message: "network down",
    });
  });

  it("rejects blocked hosts without fetching", async () => {
    globalThis.fetch = vi.fn() as typeof fetch;

    const result = await fetchImageBytesFromUrl("http://127.0.0.1/secret.png");

    expect(isErr(result)).toBe(true);
    if (isOk(result)) {
      throw new Error("expected blocked host to fail");
    }
    expect(result.error).toEqual({
      code: "fetch_failed",
      message: "URL host is not allowed.",
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("rejects hostnames that resolve to restricted addresses", async () => {
    dnsMock.lookup.mockResolvedValue([{ address: "169.254.169.254", family: 4 }]);
    globalThis.fetch = vi.fn() as typeof fetch;

    const result = await fetchImageBytesFromUrl("https://rebind.example.com/secret.png");

    expect(isErr(result)).toBe(true);
    if (isOk(result)) {
      throw new Error("expected DNS-restricted host to fail");
    }
    expect(result.error).toEqual({
      code: "fetch_failed",
      message: "URL host resolves to a private or restricted address.",
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("rejects oversized image bodies", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_PUBLIC_HTTP_RESPONSE_BYTES));
        controller.enqueue(new Uint8Array(1));
        controller.close();
      },
    });
    globalThis.fetch = vi.fn(
      async () =>
        new Response(stream, {
          status: 200,
          headers: { "content-type": "image/png" },
        }),
    ) as typeof fetch;

    const result = await fetchImageBytesFromUrl("https://cdn.example.com/assets/huge.png");

    expect(isErr(result)).toBe(true);
    if (isOk(result)) {
      throw new Error("expected oversized image to fail");
    }
    expect(result.error).toEqual({
      code: "fetch_failed",
      message: `Response too large (exceeds ${MAX_PUBLIC_HTTP_RESPONSE_BYTES} byte limit)`,
    });
  });
});

describe("image variant approved locks", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("does not localize over an approved variant unless forced", async () => {
    globalThis.fetch = vi.fn() as typeof fetch;
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
    expect(globalThis.fetch).not.toHaveBeenCalled();
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
