import "dotenv/config";

import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { createApp } from "@/api/app";
import { db } from "@/lib/database";
import type { FileStorageAdapter, PutStoredObjectInput } from "@/lib/file-storage";
import { createStoredFile } from "@/lib/file-storage/records";
import { createProjectTestFixture } from "../project/project.fixture";

const { resolveApiAuthContextFromSessionMock } = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(() => globalThis.__testApiAuthContext ?? null),
}));

vi.mock("@/api/auth/workos-session", () => ({
  resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
}));

function createMemoryFileStorageAdapter(): FileStorageAdapter {
  const store = new Map<string, { buffer: Buffer; contentType: string }>();

  return {
    provider: "vercel_blob",
    async put(input: PutStoredObjectInput) {
      let buffer: Buffer;
      if (input.body instanceof ReadableStream) {
        const chunks: Uint8Array[] = [];
        const reader = input.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) chunks.push(value);
        }
        buffer = Buffer.concat(chunks.map((c) => Buffer.from(c)));
      } else if (Buffer.isBuffer(input.body)) {
        buffer = input.body;
      } else if (input.body instanceof ArrayBuffer) {
        buffer = Buffer.from(input.body);
      } else if (input.body instanceof Uint8Array) {
        buffer = Buffer.from(input.body.buffer, input.body.byteOffset, input.body.byteLength);
      } else {
        buffer = Buffer.from(await input.body.arrayBuffer());
      }

      store.set(input.key, { buffer, contentType: input.contentType });

      return {
        provider: "vercel_blob",
        key: input.key,
        url: `https://blob.example/${input.key}`,
        downloadUrl: `https://blob.example/${input.key}?download=1`,
        contentType: input.contentType,
        etag: "test-etag",
      };
    },
    async get(input) {
      const entry = store.get(input.keyOrUrl);
      if (!entry) return null;
      return {
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(entry.buffer));
            controller.close();
          },
        }),
        contentType: entry.contentType,
        etag: "test-etag",
      };
    },
    async delete(input) {
      store.delete(input.keyOrUrl);
    },
    async getSignedUrl(input) {
      return `https://blob.example/${input.keyOrUrl}?signed=1`;
    },
  };
}

const fileStorageAdapter = createMemoryFileStorageAdapter();
const app = createApp({ fileStorageAdapter });
const client = testClient(app);
const { authHeadersFor, cleanup, createWorkosIdentity } = createProjectTestFixture(client);

async function ensureStoredFilesTestSchema() {
  await db.$client.query(`
    DO $$
    BEGIN
      CREATE TYPE stored_file_role AS ENUM ('source', 'output', 'reference', 'asset');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);
  await db.$client.query(`
    DO $$
    BEGIN
      CREATE TYPE stored_file_source_kind AS ENUM (
        'chat_upload',
        'email_attachment',
        'job_output',
        'repository_file',
        'tms_file'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);
  await db.$client.query(`
    CREATE TABLE IF NOT EXISTS stored_files (
      id text PRIMARY KEY NOT NULL,
      organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE cascade,
      project_id text REFERENCES projects(id) ON DELETE set null,
      created_by_user_id uuid REFERENCES users(id) ON DELETE set null,
      role stored_file_role NOT NULL,
      source_kind stored_file_source_kind NOT NULL,
      source_interaction_id uuid REFERENCES interactions(id) ON DELETE set null,
      source_job_id text REFERENCES jobs(id) ON DELETE set null,
      storage_provider text NOT NULL,
      storage_key text NOT NULL,
      storage_url text NOT NULL,
      download_url text,
      filename text NOT NULL,
      content_type text NOT NULL,
      byte_size integer NOT NULL,
      sha256 text NOT NULL,
      etag text,
      metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL
    )
  `);
}

beforeAll(async () => {
  await db.$client.query("select 1");
  await ensureStoredFilesTestSchema();
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
    await expect(response.json()).resolves.toEqual({ error: "not_found" });
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
