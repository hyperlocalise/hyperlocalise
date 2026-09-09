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
import { Hono } from "hono";
import { testClient } from "hono/testing";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { ApiAuthContext, AuthVariables } from "@/api/auth/workos";
import { ok } from "@/lib/primitives/result/results";
import { createProjectAssetRoutes } from "./project-assets.route";

const mocks = vi.hoisted(() => ({
  limit: vi.fn(),
  access: vi.fn(),
  project: vi.fn(),
  extract: vi.fn(),
  billing: vi.fn(),
  allowed: vi.fn(),
}));
vi.mock("@/lib/database/client", async (original) => {
  const actual = await original<typeof import("@/lib/database/client")>();
  return {
    ...actual,
    db: { select: () => ({ from: () => ({ where: () => ({ limit: mocks.limit }) }) }) },
  };
});
vi.mock("@/api/auth/team-access", () => ({ canAccessStoredFile: mocks.access }));
vi.mock("@/api/auth/capability-guards", () => ({
  isAiActionAllowed: mocks.allowed,
  isWriteBackTranslationAllowed: mocks.allowed,
}));
vi.mock("./project.shared", async (original) => ({
  ...(await original<typeof import("./project.shared")>()),
  getOwnedProject: mocks.project,
}));
vi.mock("@/lib/agents/image-text-extraction", () => ({ extractImageText: mocks.extract }));
vi.mock("@/api/billing/ai-features-response", () => ({
  rejectIfAiFeaturesUnavailable: mocks.billing,
}));

// Exercise the actual asset router and its explicit child mounts. Stub external
// boundaries so routing and authorization regressions need no running database.
const membership = { role: "admin", accessSource: "workos_authoritative" } as const;
const organization = {
  localOrganizationId: "org-1",
  workosOrganizationId: "workos-1",
  name: "Test",
  membership,
};
const auth: ApiAuthContext = {
  user: { localUserId: "user-1", workosUserId: "workos-user-1", email: "test@example.com" },
  organizations: [],
  organization,
  activeOrganization: organization,
  membership,
  activeTeam: null,
  capabilities: [],
};
const app = new Hono<{ Variables: AuthVariables }>()
  .use("*", async (c, next) => {
    c.set("auth", auth);
    await next();
  })
  .route("/projects/:projectId/assets", createProjectAssetRoutes());
const client = testClient(app);
const file = {
  id: "file-1",
  projectId: "project-1",
  organizationId: "org-1",
  contentType: "video/mp4",
  sha256: "hash",
  metadata: {},
};
const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=";
function post(input = { timestamp: 2, frame: png }) {
  return client.projects[":projectId"].assets[":fileId"]["frame-text"].$post({
    param: { projectId: "project-1", fileId: "file-1" },
    json: input,
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.limit.mockResolvedValue([file]);
  mocks.access.mockResolvedValue(true);
  mocks.project.mockResolvedValue({ id: "project-1" });
  mocks.allowed.mockReturnValue(true);
  mocks.billing.mockResolvedValue(null);
  mocks.extract.mockResolvedValue(ok([]));
});
describe("explicit project asset subroutes", () => {
  it("extracts a bounded frame at the unchanged public URL", async () => {
    const response = await post();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ frameText: { timestamp: 2, regions: [] } });
    expect(mocks.extract).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: "file-1",
        organizationId: "org-1",
        contentType: "image/png",
      }),
    );
  });
  it("still loads image text layers through the mounted resource", async () => {
    mocks.limit.mockResolvedValue([{ ...file, contentType: "image/png" }]);
    const response = await client.projects[":projectId"].assets[":fileId"]["text-layers"].$get({
      param: { projectId: "project-1", fileId: "file-1" },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ textLayers: null });
  });
  it("rejects inaccessible assets before using the vision model", async () => {
    mocks.access.mockResolvedValue(false);
    expect((await post()).status).toBe(404);
    expect(mocks.extract).not.toHaveBeenCalled();
  });
  it("rejects read-only access before querying assets", async () => {
    mocks.allowed.mockReturnValue(false);
    expect((await post()).status).toBe(403);
    expect(mocks.limit).not.toHaveBeenCalled();
  });
  it("rejects invalid frames and out-of-range timestamps", async () => {
    expect((await post({ timestamp: 31, frame: png })).status).toBe(400);
    expect((await post({ timestamp: 1, frame: "data:image/png;base64,AAAA" })).status).toBe(400);
    expect(mocks.extract).not.toHaveBeenCalled();
  });
  it("rejects oversized frame dimensions and request bodies", async () => {
    const bytes = Buffer.from(png.split(",")[1], "base64");
    bytes.writeUInt32BE(1281, 16);
    expect(
      (await post({ timestamp: 1, frame: `data:image/png;base64,${bytes.toString("base64")}` }))
        .status,
    ).toBe(400);
    expect(
      (await post({ timestamp: 1, frame: `data:image/png;base64,${"A".repeat(3 * 1024 * 1024)}` }))
        .status,
    ).toBe(413);
    expect(mocks.extract).not.toHaveBeenCalled();
  });
  it("honors billing denial without using the vision model", async () => {
    mocks.billing.mockResolvedValue(Response.json({ error: "ai_unavailable" }, { status: 403 }));
    expect((await post()).status).toBe(403);
    expect(mocks.extract).not.toHaveBeenCalled();
  });
});
