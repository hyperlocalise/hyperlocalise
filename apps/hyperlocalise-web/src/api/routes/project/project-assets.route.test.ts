import "dotenv/config";

import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { createApp } from "@/api/app";
import { db } from "@/lib/database";
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

const fileStorageAdapter = createMemoryFileStorageAdapter();
const app = createApp({ fileStorageAdapter });
const client = testClient(app);
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
