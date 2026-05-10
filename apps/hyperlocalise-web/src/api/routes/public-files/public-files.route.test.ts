import "dotenv/config";

import { createHash, randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { createApp } from "@/api/app";
import { db, schema } from "@/lib/database";
import type { FileStorageAdapter, PutStoredObjectInput } from "@/lib/file-storage";

const createdWorkosOrganizationIds = new Set<string>();
const createdWorkosUserIds = new Set<string>();

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
        buffer = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
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
const client = testClient(createApp({ fileStorageAdapter }));

function hashApiKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

async function createPublicApiFixture() {
  const suffix = randomUUID();
  const workosOrganizationId = `org_${suffix}`;
  const workosUserId = `user_${suffix}`;
  const apiKey = `hl_${suffix.replaceAll("-", "")}`;

  createdWorkosOrganizationIds.add(workosOrganizationId);
  createdWorkosUserIds.add(workosUserId);

  const [organization] = await db
    .insert(schema.organizations)
    .values({
      workosOrganizationId,
      name: `Example Org ${suffix}`,
      slug: `example-org-${suffix}`,
    })
    .returning();

  const [user] = await db
    .insert(schema.users)
    .values({
      workosUserId,
      email: `${suffix}@example.com`,
    })
    .returning();

  const [project] = await db
    .insert(schema.projects)
    .values({
      id: `project_${suffix}`,
      organizationId: organization.id,
      createdByUserId: user.id,
      name: "Marketing Site",
      description: "Primary website strings",
    })
    .returning();

  await db.insert(schema.organizationApiKeys).values({
    organizationId: organization.id,
    name: "Public API Test Key",
    keyHash: hashApiKey(apiKey),
    keyPrefix: apiKey.slice(0, 8),
    permissions: ["jobs:read", "jobs:write", "files:read", "files:write"],
    createdByUserId: user.id,
  });

  return { apiKey, project };
}

async function ensurePublicFilesTestSchema() {
  await db.$client.query(`
    CREATE TABLE IF NOT EXISTS organization_api_keys (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE cascade,
      name text NOT NULL,
      key_hash text NOT NULL,
      key_prefix text NOT NULL,
      permissions jsonb DEFAULT '["jobs:read", "jobs:write", "files:read", "files:write"]'::jsonb NOT NULL,
      created_by_user_id uuid REFERENCES users(id) ON DELETE set null,
      last_used_at timestamp with time zone,
      revoked_at timestamp with time zone,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL
    )
  `);
  await db.$client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS organization_api_keys_key_hash_key ON organization_api_keys USING btree (key_hash)
  `);
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
  await ensurePublicFilesTestSchema();
});

afterEach(async () => {
  for (const workosOrganizationId of createdWorkosOrganizationIds) {
    await db
      .delete(schema.organizations)
      .where(eq(schema.organizations.workosOrganizationId, workosOrganizationId));
  }

  for (const workosUserId of createdWorkosUserIds) {
    await db.delete(schema.users).where(eq(schema.users.workosUserId, workosUserId));
  }

  createdWorkosOrganizationIds.clear();
  createdWorkosUserIds.clear();
});

describe("publicFileRoutes", () => {
  it("uploads and downloads a repository source file with an API key", async () => {
    const { apiKey, project } = await createPublicApiFixture();

    const uploadResponse = await client.api.v1.files.$post(
      {
        form: {
          projectId: project.id,
          sourcePath: "content/en/home.md",
          sourceHash: "sha256:abc123",
          file: new File(["# Hello"], "home.md", { type: "text/markdown" }),
        },
      },
      { headers: { "x-api-key": apiKey } },
    );

    expect(uploadResponse.status).toBe(201);
    const uploadBody = (await uploadResponse.json()) as { file: { id: string } };
    expect(uploadBody.file.id).toMatch(/^file_/);

    const downloadResponse = await client.api.v1.files[":fileId"].download.$get(
      { param: { fileId: uploadBody.file.id } },
      { headers: { "x-api-key": apiKey } },
    );

    expect(downloadResponse.status).toBe(200);
    expect(await downloadResponse.text()).toBe("# Hello");
  });

  it("rejects unsupported source file formats", async () => {
    const { apiKey, project } = await createPublicApiFixture();

    const response = await client.api.v1.files.$post(
      {
        form: {
          projectId: project.id,
          file: new File(["FROM node"], "Dockerfile", { type: "text/plain" }),
        },
      },
      { headers: { "x-api-key": apiKey } },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "unsupported_translation_source_file",
      filename: "Dockerfile",
    });
  });
});
