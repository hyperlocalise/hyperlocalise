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
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(
    (options) =>
      globalThis.__resolveTestApiAuthContextFromSession?.(options) ??
      globalThis.__testApiAuthContext ??
      null,
  ),
  loadGoogleDrivePipesAccessToken: vi.fn(),
  listGoogleDriveChildren: vi.fn(),
  getGoogleDriveFile: vi.fn(),
  listGoogleSharedDrives: vi.fn(),
}));

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: mocks.resolveApiAuthContextFromSessionMock,
  };
});

vi.mock("@/lib/google-drive/pipes", () => ({
  loadGoogleDrivePipesAccessToken: (...args: unknown[]) =>
    mocks.loadGoogleDrivePipesAccessToken(...args),
}));

vi.mock("@/lib/google-drive/drive-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/google-drive/drive-api")>();
  return {
    ...actual,
    listGoogleDriveChildren: (...args: unknown[]) => mocks.listGoogleDriveChildren(...args),
    getGoogleDriveFile: (...args: unknown[]) => mocks.getGoogleDriveFile(...args),
    listGoogleSharedDrives: (...args: unknown[]) => mocks.listGoogleSharedDrives(...args),
  };
});

import { createApp } from "@/api/app";
import type { AppType } from "@/api/typed-app";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db } from "@/lib/database/client";
import { GOOGLE_MIME } from "@/lib/google-drive/constants";
import { ok } from "@/lib/primitives/result/results";

const client = testClient<AppType>(createApp());
const fixture = createAuthTestFixture();

describe("googleDriveRoutes", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  beforeEach(() => {
    mocks.loadGoogleDrivePipesAccessToken.mockReset();
    mocks.listGoogleDriveChildren.mockReset();
    mocks.getGoogleDriveFile.mockReset();
    mocks.listGoogleSharedDrives.mockReset();
    mocks.loadGoogleDrivePipesAccessToken.mockResolvedValue(ok("drive-token"));
    mocks.listGoogleSharedDrives.mockResolvedValue(ok([]));
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await fixture.cleanup();
  });

  it("returns forbidden for children when the member lacks integrations read", async () => {
    const identity = fixture.createWorkosIdentityWithRole("translator");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const response = await client.api.orgs[":organizationSlug"]["google-drive"].children.$get(
      {
        param: { organizationSlug },
        query: { folderId: "root", showTranslations: "false", depth: "0" },
      },
      { headers },
    );

    expect(response.status).toBe(403);
  });

  it("lists children and keeps locale-named folders visible while hiding prefix files", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    mocks.listGoogleDriveChildren.mockResolvedValue(
      ok({
        files: [
          {
            id: "folder-en",
            name: "en",
            mimeType: GOOGLE_MIME.folder,
            size: null,
            modifiedTime: null,
            md5Checksum: null,
            parents: ["root"],
            driveId: null,
          },
          {
            id: "file-prefix",
            name: "[vi-VN] overview.docx",
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            size: 100,
            modifiedTime: null,
            md5Checksum: null,
            parents: ["root"],
            driveId: null,
          },
        ],
        nextPageToken: null,
      }),
    );

    const response = await client.api.orgs[":organizationSlug"]["google-drive"].children.$get(
      {
        param: { organizationSlug },
        query: { folderId: "root", depth: "0", showTranslations: "false" },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    if (!response.ok || !("items" in body)) {
      throw new Error("expected children payload");
    }
    expect(body.items.map((item) => item.id)).toEqual(["folder-en"]);
  });

  it("verifies Drive metadata before saving a connected folder", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    mocks.getGoogleDriveFile.mockResolvedValue(
      ok({
        id: "folder-campaigns",
        name: "Campaigns",
        mimeType: GOOGLE_MIME.folder,
        size: null,
        modifiedTime: null,
        md5Checksum: null,
        parents: ["root"],
        driveId: null,
      }),
    );

    const response = await client.api.orgs[":organizationSlug"]["google-drive"].folders.$post(
      {
        param: { organizationSlug },
        json: {
          folderId: "folder-campaigns",
          name: "Wrong label",
          pathLabel: "My Drive/Campaigns",
        },
      },
      { headers },
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    if (!response.ok || !("folder" in body) || !body.folder) {
      throw new Error("expected folder payload");
    }
    expect(body.folder).toMatchObject({
      folderId: "folder-campaigns",
      name: "Campaigns",
      pathLabel: "My Drive/Campaigns",
    });
  });
});
