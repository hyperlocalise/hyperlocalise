import "dotenv/config";

import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { createApp } from "@/api/app";
import { PUBLIC_MEDIA_CACHE_CONTROL } from "@/api/routes/public-media/public-media.route";
import { db } from "@/lib/database";
import { createStoredFile } from "@/lib/file-storage/records";
import { publicMediaMetadata } from "@/lib/projects/files/public-media";
import { createMemoryFileStorageAdapter } from "../file/file.fixture";
import { createProjectTestFixture } from "../project/project.fixture";

const fileStorageAdapter = createMemoryFileStorageAdapter();
const app = createApp({ fileStorageAdapter });
const projectFixture = createProjectTestFixture();
const { cleanup, createStoredProjectFixture } = projectFixture;

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await cleanup();
});

describe("public media route", () => {
  it("serves opted-in image bytes without auth and with long-lived cache headers", async () => {
    const { organization, user, project } = await createStoredProjectFixture();
    const imageBytes = Buffer.from("public-png-bytes");
    const file = await createStoredFile({
      organizationId: organization.id,
      projectId: project.id,
      createdByUserId: user.id,
      role: "output",
      sourceKind: "job_output",
      filename: "hero-fr.png",
      contentType: "image/png",
      content: imageBytes,
      metadata: publicMediaMetadata({
        imageLocalizationOutput: true,
        contentKind: "image_url",
      }),
      adapter: fileStorageAdapter,
    });

    const response = await app.request(`/api/public/media/${file.id}`, { method: "GET" });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("content-disposition")).toContain("inline");
    expect(response.headers.get("cache-control")).toBe(PUBLIC_MEDIA_CACHE_CONTROL);
    expect(response.headers.get("cdn-cache-control")).toBe(PUBLIC_MEDIA_CACHE_CONTROL);
    expect(response.headers.get("etag")).toBe(`"${file.sha256}"`);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("public-png-bytes");
  });

  it("returns 304 when If-None-Match matches the file etag", async () => {
    const { organization, user, project } = await createStoredProjectFixture();
    const file = await createStoredFile({
      organizationId: organization.id,
      projectId: project.id,
      createdByUserId: user.id,
      role: "output",
      sourceKind: "job_output",
      filename: "hero-fr.png",
      contentType: "image/png",
      content: Buffer.from("public-png-bytes"),
      metadata: publicMediaMetadata({ imageLocalizationOutput: true }),
      adapter: fileStorageAdapter,
    });

    const response = await app.request(`/api/public/media/${file.id}`, {
      method: "GET",
      headers: { "if-none-match": `"${file.sha256}"` },
    });

    expect(response.status).toBe(304);
    expect(response.headers.get("cache-control")).toBe(PUBLIC_MEDIA_CACHE_CONTROL);
    expect(response.headers.get("etag")).toBe(`"${file.sha256}"`);
  });

  it("does not serve private stored files", async () => {
    const { organization, user, project } = await createStoredProjectFixture();
    const file = await createStoredFile({
      organizationId: organization.id,
      projectId: project.id,
      createdByUserId: user.id,
      role: "source",
      sourceKind: "repository_file",
      filename: "secret.png",
      contentType: "image/png",
      content: Buffer.from("secret"),
      adapter: fileStorageAdapter,
    });

    const response = await app.request(`/api/public/media/${file.id}`, { method: "GET" });
    expect(response.status).toBe(404);
  });
});
