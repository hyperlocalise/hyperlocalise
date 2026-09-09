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
import { rejectIfAiFeaturesUnavailable } from "@/api/billing/ai-features-response";
import { extractImageText } from "@/lib/agents/image-text-extraction";
import { db } from "@/lib/database/client";
import { createStoredFile } from "@/lib/file-storage/records";
import { ok } from "@/lib/primitives/result/results";
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
const { authHeadersFor, cleanup, createStoredProjectFixture, createWorkosIdentityForOrganization } =
  projectFixture;
const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=";

async function videoFixture() {
  const fixture = await createStoredProjectFixture();
  const file = await createStoredFile({
    organizationId: fixture.organization.id,
    projectId: fixture.project.id,
    createdByUserId: fixture.user.id,
    role: "source",
    sourceKind: "repository_file",
    filename: "walkthrough.mp4",
    contentType: "video/mp4",
    content: Buffer.from("source-video"),
    adapter: fileStorageAdapter,
  });
  return {
    ...fixture,
    file,
    headers: await authHeadersFor(fixture.identity),
    path: `/api/orgs/${fixture.identity.organization.slug}/projects/${fixture.project.id}/assets/${file.id}/frame-text`,
  };
}

function post(
  path: string,
  headers: { cookie: string },
  input: { timestamp: number; frame: string } = { timestamp: 2, frame: png },
) {
  return app.request(path, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.clearAllMocks();
  vi.mocked(rejectIfAiFeaturesUnavailable).mockResolvedValue(null);
  vi.mocked(extractImageText).mockResolvedValue(ok([]));
  await cleanup();
});

describe("explicit project asset subroutes", () => {
  it("extracts a bounded frame at the unchanged public URL", async () => {
    const { path, headers, file } = await videoFixture();
    vi.mocked(extractImageText).mockResolvedValue(ok([]));
    const response = await post(path, headers);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ frameText: { timestamp: 2, regions: [] } });
    expect(extractImageText).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: file.id,
        organizationId: file.organizationId,
        contentType: "image/png",
      }),
    );
  });

  it("still loads image text layers through the mounted resource", async () => {
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
    });
    const headers = await authHeadersFor(fixture.identity);
    const response = await app.request(
      `/api/orgs/${fixture.identity.organization.slug}/projects/${fixture.project.id}/assets/${file.id}/text-layers`,
      { headers },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ textLayers: null });
  });

  it("rejects inaccessible assets before using the vision model", async () => {
    const source = await videoFixture();
    const other = await videoFixture();
    const path = other.path.replace(other.file.id, source.file.id);
    expect((await post(path, other.headers)).status).toBe(404);
    expect(extractImageText).not.toHaveBeenCalled();
  });

  it("rejects read-only access before querying assets", async () => {
    const { path, identity } = await videoFixture();
    const member = createWorkosIdentityForOrganization(identity.organization, "member");
    const headers = await authHeadersFor(member);
    expect((await post(path, headers)).status).toBe(403);
    expect(extractImageText).not.toHaveBeenCalled();
  });

  it("rejects invalid frames and out-of-range timestamps", async () => {
    const { path, headers } = await videoFixture();
    expect((await post(path, headers, { timestamp: 31, frame: png })).status).toBe(400);
    expect(
      (await post(path, headers, { timestamp: 1, frame: "data:image/png;base64,AAAA" })).status,
    ).toBe(400);
    expect(extractImageText).not.toHaveBeenCalled();
  });

  it("rejects oversized frame dimensions and request bodies", async () => {
    const { path, headers } = await videoFixture();
    const bytes = Buffer.from(png.split(",")[1], "base64");
    bytes.writeUInt32BE(1281, 16);
    expect(
      (
        await post(path, headers, {
          timestamp: 1,
          frame: `data:image/png;base64,${bytes.toString("base64")}`,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await post(path, headers, {
          timestamp: 1,
          frame: `data:image/png;base64,${"A".repeat(3 * 1024 * 1024)}`,
        })
      ).status,
    ).toBe(413);
    expect(extractImageText).not.toHaveBeenCalled();
  });

  it("honors billing denial without using the vision model", async () => {
    const { path, headers } = await videoFixture();
    vi.mocked(rejectIfAiFeaturesUnavailable).mockResolvedValueOnce(
      Response.json({ error: "ai_unavailable" }, { status: 403 }) as Awaited<
        ReturnType<typeof rejectIfAiFeaturesUnavailable>
      >,
    );
    expect((await post(path, headers)).status).toBe(403);
    expect(extractImageText).not.toHaveBeenCalled();
  });
});
