import "dotenv/config";

import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { createApp } from "@/api/app";
import { db } from "@/lib/database";
import { createStoredFile } from "@/lib/file-storage/records";
import { createProjectTestFixture } from "../project/project.fixture";
import { createMemoryFileStorageAdapter } from "./file.fixture";

const { resolveApiAuthContextFromSessionMock } = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(() => globalThis.__testApiAuthContext ?? null),
}));

vi.mock("@/api/auth/workos-session", () => ({
  resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
}));

const fileStorageAdapter = createMemoryFileStorageAdapter();
const app = createApp({ fileStorageAdapter });
const { authHeadersFor, cleanup, createWorkosIdentity } = createProjectTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.clearAllMocks();
  await cleanup();
});

describe("file download route", () => {
  it("streams a stored file when the user belongs to the organization", async () => {
    const identity = createWorkosIdentity();
    const headers = await authHeadersFor(identity);
    const orgId = globalThis.__testApiAuthContext!.activeOrganization.localOrganizationId;
    const fileContent = Buffer.from(JSON.stringify({ hello: "world" }));

    const file = await createStoredFile({
      organizationId: orgId,
      role: "source",
      sourceKind: "chat_upload",
      filename: "source.json",
      contentType: "application/json",
      content: fileContent,
      adapter: fileStorageAdapter,
    });

    const response = await app.request(`/api/orgs/${identity.organization.slug}/files/${file.id}`, {
      method: "GET",
      headers,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.headers.get("content-disposition")).toContain("source.json");
  });

  it("returns 404 when the file does not exist", async () => {
    const identity = createWorkosIdentity();
    const headers = await authHeadersFor(identity);

    const response = await app.request(
      `/api/orgs/${identity.organization.slug}/files/file_missing`,
      {
        method: "GET",
        headers,
      },
    );

    expect(response.status).toBe(404);
    const responseBody = await response.json();
    expect(responseBody).toMatchObject({ error: "not_found", message: expect.any(String) });
  });

  it("returns 404 when the file belongs to another organization", async () => {
    const identityA = createWorkosIdentity();
    const identityB = createWorkosIdentity();
    const headersA = await authHeadersFor(identityA);
    const authContextA = globalThis.__testApiAuthContext!;

    // Switch to identityB and create a file in orgB
    await authHeadersFor(identityB);
    const orgIdB = globalThis.__testApiAuthContext!.activeOrganization.localOrganizationId;

    const file = await createStoredFile({
      organizationId: orgIdB,
      role: "source",
      sourceKind: "chat_upload",
      filename: "source.json",
      contentType: "application/json",
      content: Buffer.from("secret"),
      adapter: fileStorageAdapter,
    });

    // Restore identityA auth context and request
    globalThis.__testApiAuthContext = authContextA;
    const response = await app.request(
      `/api/orgs/${identityA.organization.slug}/files/${file.id}`,
      {
        method: "GET",
        headers: headersA,
      },
    );

    expect(response.status).toBe(404);
  });
});
