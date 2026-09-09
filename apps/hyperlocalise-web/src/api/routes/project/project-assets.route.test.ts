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

import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { createApp } from "@/api/app";
import type { AppType } from "@/api/typed-app";
import { eq } from "drizzle-orm";
import { extractImageText } from "@/lib/agents/image-text-extraction";
import { rejectIfAiFeaturesUnavailable } from "@/api/billing/ai-features-response";
import { ok } from "@/lib/primitives/result/results";
import { db, schema } from "@/lib/database/client";
import { createStoredFile } from "@/lib/file-storage/records";
import { createMemoryFileStorageAdapter } from "../file/file.fixture";
import { createProjectTestFixture } from "./project.fixture";

const { resolveApiAuthContextFromSessionMock } = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(
    (options) =>
      globalThis.__resolveTestApiAuthContextFromSession?.(options) ??
      globalThis.__testApiAuthContext ??
      null,
  ),
}));

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
  };
});

vi.mock("@/lib/agents/image-text-extraction", () => ({ extractImageText: vi.fn() }));
vi.mock("@/api/billing/ai-features-response", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/billing/ai-features-response")>()),
  rejectIfAiFeaturesUnavailable: vi.fn(async () => null),
}));

const fileStorageAdapter = createMemoryFileStorageAdapter();
const app = createApp({ fileStorageAdapter });
const client = testClient<AppType>(app);
const projectFixture = createProjectTestFixture(client);
const { authHeadersFor, cleanup, createStoredProjectFixture } = projectFixture;

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.clearAllMocks();
  await cleanup();
});

describe("project asset route", () => {
  it("serves stored file bytes inline for CAT image tags", async () => {
    const { identity, organization, user, project } = await createStoredProjectFixture();
    const headers = await authHeadersFor(identity);

    const imageBytes = Buffer.from("fake-png-bytes");
    const file = await createStoredFile({
      organizationId: organization.id,
      projectId: project.id,
      createdByUserId: user.id,
      role: "source",
      sourceKind: "repository_file",
      filename: "banner.png",
      contentType: "image/png",
      content: imageBytes,
      adapter: fileStorageAdapter,
    });

    const response = await app.request(
      `/api/orgs/${identity.organization.slug}/projects/${project.id}/assets/${file.id}`,
      {
        method: "GET",
        headers,
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("content-disposition")).toContain("inline");
    expect(response.headers.get("content-disposition")).toContain("banner.png");
    expect(response.headers.get("content-security-policy")).toContain("sandbox");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toContain("private");
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("fake-png-bytes");
  });
});

async function imageFixture() {
  const fixture = await createStoredProjectFixture();
  const file = await createStoredFile({
    organizationId: fixture.organization.id,
    projectId: fixture.project.id,
    createdByUserId: fixture.user.id,
    role: "source",
    sourceKind: "repository_file",
    filename: "hero.png",
    contentType: "image/png",
    content: Buffer.from("source-image"),
    adapter: fileStorageAdapter,
    metadata: { provenance: "keep-me" },
  });
  return {
    ...fixture,
    file,
    headers: await authHeadersFor(fixture.identity),
    path: `/api/orgs/${fixture.identity.organization.slug}/projects/${fixture.project.id}/assets/${file.id}/text-layers`,
  };
}
const extractedRegions = [
  {
    id: "headline",
    text: "A little closer",
    bounds: { x: 0.1, y: 0.2, width: 0.6, height: 0.2 },
    translations: {},
  },
];

describe("project image text layers", () => {
  it("extracts once, persists on the file, and rejects stale saves", async () => {
    const { path, headers, file } = await imageFixture();
    vi.mocked(extractImageText).mockResolvedValue(ok(extractedRegions));
    const empty = await app.request(path, { headers });
    expect(await empty.json()).toEqual({ textLayers: null });
    const extracted = await app.request(path, { method: "POST", headers });
    expect(extracted.status).toBe(200);
    const { textLayers } = await extracted.json();
    expect(textLayers.sourceHash).toBe(file.sha256);
    const repeated = await app.request(path, { method: "POST", headers });
    expect(repeated.status).toBe(200);
    expect(extractImageText).toHaveBeenCalledTimes(1);
    const edited = {
      ...textLayers,
      regions: [
        {
          ...textLayers.regions[0],
          translations: { fr: { text: "Plus près", instructions: "Friendly" } },
        },
      ],
    };
    const saved = await app.request(path, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(edited),
    });
    expect(saved.status).toBe(200);
    const read = await app.request(path, { headers });
    expect((await read.json()).textLayers.regions[0].translations.fr.text).toBe("Plus près");
    const stale = await app.request(path, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(edited),
    });
    expect(stale.status).toBe(409);
    const [stored] = await db
      .select()
      .from(schema.storedFiles)
      .where(eq(schema.storedFiles.id, file.id));
    expect(stored.metadata.provenance).toBe("keep-me");
  });
  it("does not expose another project's file", async () => {
    const source = await imageFixture();
    const other = await imageFixture();
    const path = other.path.replace(other.file.id, source.file.id);
    for (const method of ["GET", "POST", "PATCH"]) {
      const response = await app.request(path, { method, headers: other.headers });
      expect(response.status).toBe(404);
    }
    expect(extractImageText).not.toHaveBeenCalled();
  });
  it("does not extract when AI access is unavailable", async () => {
    const { path, headers } = await imageFixture();
    vi.mocked(rejectIfAiFeaturesUnavailable).mockResolvedValueOnce(
      Response.json({ error: "ai_features_required" }, { status: 403 }) as Awaited<
        ReturnType<typeof rejectIfAiFeaturesUnavailable>
      >,
    );
    const response = await app.request(path, { method: "POST", headers });
    expect(response.status).toBe(403);
    expect(extractImageText).not.toHaveBeenCalled();
  });
  it("rejects invalid regions and ignores old source hashes", async () => {
    const { path, headers, file } = await imageFixture();
    vi.mocked(extractImageText).mockResolvedValue(ok(extractedRegions));
    const response = await app.request(path, { method: "POST", headers });
    const { textLayers } = await response.json();
    const bad = {
      ...textLayers,
      regions: [{ ...textLayers.regions[0], bounds: { x: 2, y: 0, width: 1, height: 1 } }],
    };
    expect(
      (
        await app.request(path, {
          method: "PATCH",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify(bad),
        })
      ).status,
    ).toBe(400);
    await db
      .update(schema.storedFiles)
      .set({ sha256: "replaced-image" })
      .where(eq(schema.storedFiles.id, file.id));
    expect(await (await app.request(path, { headers })).json()).toEqual({ textLayers: null });
    expect(
      (
        await app.request(path, {
          method: "PATCH",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify(textLayers),
        })
      ).status,
    ).toBe(409);
  });
});
