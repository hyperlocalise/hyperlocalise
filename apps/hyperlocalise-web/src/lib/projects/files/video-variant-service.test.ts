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
import "dotenv/config";

import { eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { regenerateVideoFromAttachment } = vi.hoisted(() => ({
  regenerateVideoFromAttachment: vi.fn(),
}));

const dnsMock = vi.hoisted(() => ({
  lookup: vi.fn(),
}));

const undiciMock = vi.hoisted(() => ({
  fetch: vi.fn(),
  close: vi.fn(),
}));

vi.mock("node:dns/promises", () => ({
  lookup: dnsMock.lookup,
}));

vi.mock("undici", () => ({
  Agent: vi.fn(function Agent() {
    return { close: undiciMock.close };
  }),
  fetch: undiciMock.fetch,
}));

vi.mock("@/lib/agents/video-generation", () => ({
  VideoLocalizationError: class VideoLocalizationError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.name = "VideoLocalizationError";
      this.code = code;
    }
  },
  regenerateVideoFromAttachment,
}));

import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { db, schema } from "@/lib/database";
import { isErr, isOk } from "@/lib/primitives/result/results";
import { MAX_PUBLIC_VIDEO_HTTP_RESPONSE_BYTES } from "@/lib/security/public-http-fetch";

import {
  fetchVideoBytesFromUrl,
  localizeAndStoreVideoVariant,
  replaceVideoVariantBytes,
} from "./video-variant-service";

const projectFixture = createProjectTestFixture();
const { cleanup, createStoredProjectFixture } = projectFixture;

beforeAll(async () => {
  await db.$client.query("select 1");
});

beforeEach(() => {
  vi.clearAllMocks();
  dnsMock.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  undiciMock.close.mockResolvedValue(undefined);
  regenerateVideoFromAttachment.mockResolvedValue({
    video: Buffer.from("localized-video"),
    mimeType: "video/mp4",
  });
});

afterEach(async () => {
  await cleanup();
});

describe("fetchVideoBytesFromUrl", () => {
  it("returns video bytes with a normalized content type and URL filename", async () => {
    undiciMock.fetch.mockResolvedValue(
      new Response(Buffer.from("source-video"), {
        status: 200,
        headers: { "content-type": "video/mp4; charset=binary" },
      }),
    );

    const result = await fetchVideoBytesFromUrl("https://cdn.example.com/assets/hero.mp4?v=1");

    expect(undiciMock.fetch).toHaveBeenCalledWith(
      "https://cdn.example.com/assets/hero.mp4?v=1",
      expect.objectContaining({
        method: "GET",
        redirect: "error",
        dispatcher: expect.anything(),
      }),
    );
    expect(isOk(result)).toBe(true);
    if (isErr(result)) {
      throw new Error("expected video fetch to succeed");
    }
    expect(result.value).toEqual({
      content: Buffer.from("source-video"),
      contentType: "video/mp4",
      filename: "hero.mp4",
    });
  });

  it("maps non-OK responses to video_fetch_failed without reading them as video", async () => {
    undiciMock.fetch.mockResolvedValue(
      new Response("bad gateway", {
        status: 502,
        headers: { "content-type": "video/mp4" },
      }),
    );

    const result = await fetchVideoBytesFromUrl("https://cdn.example.com/assets/hero.mp4");

    expect(isErr(result)).toBe(true);
    if (isOk(result)) {
      throw new Error("expected video fetch to fail");
    }
    expect(result.error).toEqual({
      code: "video_fetch_failed",
      message: "video fetch failed with status 502",
    });
  });

  it("rejects successful responses that are not mp4", async () => {
    undiciMock.fetch.mockResolvedValue(
      new Response("<html></html>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    );

    const result = await fetchVideoBytesFromUrl("https://cdn.example.com/assets/hero.mp4");

    expect(isErr(result)).toBe(true);
    if (isOk(result)) {
      throw new Error("expected non-video response to fail");
    }
    expect(result.error).toEqual({ code: "unsupported_video_format" });
  });

  it("maps fetch failures to video_fetch_failed", async () => {
    undiciMock.fetch.mockRejectedValue(new Error("network down"));

    const result = await fetchVideoBytesFromUrl("https://cdn.example.com/assets/hero.mp4");

    expect(isErr(result)).toBe(true);
    if (isOk(result)) {
      throw new Error("expected fetch error to fail");
    }
    expect(result.error).toEqual({
      code: "video_fetch_failed",
      message: "network down",
    });
  });

  it("rejects blocked hosts without fetching", async () => {
    const result = await fetchVideoBytesFromUrl("http://127.0.0.1/secret.mp4");

    expect(isErr(result)).toBe(true);
    if (isOk(result)) {
      throw new Error("expected blocked host to fail");
    }
    expect(result.error).toEqual({ code: "video_ssrf_blocked" });
    expect(undiciMock.fetch).not.toHaveBeenCalled();
  });

  it("rejects hostnames that resolve to restricted addresses", async () => {
    dnsMock.lookup.mockResolvedValue([{ address: "169.254.169.254", family: 4 }]);

    const result = await fetchVideoBytesFromUrl("https://rebind.example.com/secret.mp4");

    expect(isErr(result)).toBe(true);
    if (isOk(result)) {
      throw new Error("expected DNS-restricted host to fail");
    }
    expect(result.error).toEqual({ code: "video_ssrf_blocked" });
    expect(undiciMock.fetch).not.toHaveBeenCalled();
  });

  it("rejects oversized video bodies", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_PUBLIC_VIDEO_HTTP_RESPONSE_BYTES));
        controller.enqueue(new Uint8Array(1));
        controller.close();
      },
    });
    undiciMock.fetch.mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { "content-type": "video/mp4" },
      }),
    );

    const result = await fetchVideoBytesFromUrl("https://cdn.example.com/assets/huge.mp4");

    expect(isErr(result)).toBe(true);
    if (isOk(result)) {
      throw new Error("expected oversized video to fail");
    }
    expect(result.error).toEqual({
      code: "video_fetch_failed",
      message: `Response too large (exceeds ${MAX_PUBLIC_VIDEO_HTTP_RESPONSE_BYTES} byte limit)`,
    });
  });
});

describe("video variant approved locks", () => {
  it("does not localize over an approved variant unless forced", async () => {
    const { organization, project } = await createStoredProjectFixture();
    await db.insert(schema.projectVideoVariants).values({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath: "assets/hero.mp4",
      targetLocale: "fr-FR",
      status: "approved",
      provenance: "manual",
    });

    const result = await localizeAndStoreVideoVariant({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath: "assets/hero.mp4",
      targetLocale: "fr-FR",
      sourceUrl: "https://cdn.example.com/assets/hero.mp4",
      provenance: "agent",
    });

    expect(isErr(result)).toBe(true);
    if (isOk(result)) {
      throw new Error("expected approved variant to remain locked");
    }
    expect(result.error).toEqual({ code: "approved_locked" });
    expect(undiciMock.fetch).not.toHaveBeenCalled();
    expect(regenerateVideoFromAttachment).not.toHaveBeenCalled();
  });

  it("does not replace approved variant bytes unless forced", async () => {
    const { organization, project } = await createStoredProjectFixture();
    const [variant] = await db
      .insert(schema.projectVideoVariants)
      .values({
        organizationId: organization.id,
        projectId: project.id,
        sourcePath: "assets/hero.mp4",
        targetLocale: "fr-FR",
        status: "approved",
        provenance: "manual",
      })
      .returning();

    const result = await replaceVideoVariantBytes({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath: "assets/hero.mp4",
      targetLocale: "fr-FR",
      content: Buffer.from("manual-upload"),
      contentType: "video/mp4",
      filename: "hero-fr.mp4",
    });

    expect(isErr(result)).toBe(true);
    if (isOk(result)) {
      throw new Error("expected approved variant to remain locked");
    }
    expect(result.error).toEqual({ code: "approved_locked" });

    const [storedVariant] = await db
      .select()
      .from(schema.projectVideoVariants)
      .where(eq(schema.projectVideoVariants.id, variant!.id))
      .limit(1);
    expect(storedVariant).toMatchObject({
      status: "approved",
      storedFileId: null,
    });
  });

  it("rejects unreadable replacement bytes before storing", async () => {
    const { organization, project } = await createStoredProjectFixture();

    const result = await replaceVideoVariantBytes({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath: "assets/hero.mp4",
      targetLocale: "fr-FR",
      content: Buffer.from("not-an-mp4"),
      contentType: "video/mp4",
      filename: "hero-fr.mp4",
    });

    expect(isErr(result)).toBe(true);
    if (isOk(result)) {
      throw new Error("expected unreadable replacement to fail");
    }
    expect(result.error).toEqual({ code: "video_duration_unreadable" });
    expect(regenerateVideoFromAttachment).not.toHaveBeenCalled();
  });
});
