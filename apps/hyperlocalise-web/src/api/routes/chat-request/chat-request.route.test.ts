import "dotenv/config";

import { eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { createApp } from "@/api/app";
import { db, schema } from "@/lib/database";
import type { FileStorageAdapter, PutStoredObjectInput } from "@/lib/file-storage";
import { createProjectTestFixture } from "../project/project.fixture";

const { resolveApiAuthContextFromSessionMock } = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(() => globalThis.__testApiAuthContext ?? null),
}));

vi.mock("@/api/auth/workos-session", () => ({
  resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
}));

function createMemoryFileStorageAdapter(): FileStorageAdapter {
  return {
    provider: "vercel_blob",
    async put(input: PutStoredObjectInput) {
      return {
        provider: "vercel_blob",
        key: input.key,
        url: `https://blob.example/${input.key}`,
        downloadUrl: `https://blob.example/${input.key}?download=1`,
        contentType: input.contentType,
        etag: "test-etag",
      };
    },
    async get() {
      return null;
    },
    async delete() {},
    async getSignedUrl() {
      return null;
    },
  };
}

const app = createApp({ fileStorageAdapter: createMemoryFileStorageAdapter() });
const client = testClient(app);
const { authHeadersFor, cleanup, createProjectViaApi, createWorkosIdentity } =
  createProjectTestFixture(client);

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

describe("chat request uploads", () => {
  it("stores translation source files and links them to the chat message", async () => {
    const identity = createWorkosIdentity();
    const projectResponse = await createProjectViaApi(identity);
    const projectBody = (await projectResponse.json()) as { project: { id: string } };
    const headers = await authHeadersFor(identity);
    const formData = new FormData();
    formData.set("text", "Translate this to fr-FR");
    formData.set("projectId", projectBody.project.id);
    formData.append(
      "files",
      new File([JSON.stringify({ hello: "Hello" })], "source.json", {
        type: "application/json",
      }),
    );

    const response = await app.request(
      `/api/orgs/${identity.organization.slug}/chat-requests/upload`,
      {
        method: "POST",
        headers,
        body: formData,
      },
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      conversation: { id: string };
      files: Array<{ id: string; filename: string; sourceInteractionId: string }>;
    };
    expect(body.files).toHaveLength(1);
    expect(body.files[0]).toMatchObject({
      filename: "source.json",
      sourceInteractionId: body.conversation.id,
    });

    const [message] = await db
      .select()
      .from(schema.interactionMessages)
      .where(eq(schema.interactionMessages.interactionId, body.conversation.id))
      .limit(1);

    expect(message?.attachments).toEqual([
      expect.objectContaining({
        id: body.files[0]!.id,
        filename: "source.json",
        contentType: "application/json",
      }),
    ]);
  });

  it("rejects unsupported translation source files", async () => {
    const identity = createWorkosIdentity();
    const headers = await authHeadersFor(identity);
    const formData = new FormData();
    formData.set("text", "Translate this");
    formData.append("files", new File(["hello"], "source.txt", { type: "text/plain" }));

    const response = await app.request(
      `/api/orgs/${identity.organization.slug}/chat-requests/upload`,
      {
        method: "POST",
        headers,
        body: formData,
      },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "unsupported_translation_source_file",
      filename: "source.txt",
    });
  });
});
