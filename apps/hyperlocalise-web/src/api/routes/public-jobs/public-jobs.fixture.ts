import { createHash, randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";

const createdWorkosOrganizationIds = new Set<string>();
const createdWorkosUserIds = new Set<string>();

export function hashApiKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

export async function createPublicApiFixture() {
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
      translationContext: "Use concise product-marketing language.",
    })
    .returning();

  await db.insert(schema.organizationApiKeys).values({
    organizationId: organization.id,
    name: "Public API Test Key",
    keyHash: hashApiKey(apiKey),
    keyPrefix: apiKey.slice(0, 8),
    permissions: ["jobs:read", "jobs:write"],
    createdByUserId: user.id,
  });

  return { apiKey, project };
}

export async function insertStoredSourceFile(params: {
  projectId: string;
  organizationId: string;
  filename?: string;
  contentType?: string;
}) {
  const id = `file_${randomUUID()}`;
  const filename = params.filename ?? "source.xliff";
  const [file] = await db
    .insert(schema.storedFiles)
    .values({
      id,
      organizationId: params.organizationId,
      projectId: params.projectId,
      role: "source",
      sourceKind: "chat_upload",
      storageProvider: "vercel_blob",
      storageKey: `test/${id}/${filename}`,
      storageUrl: `https://example.com/${id}/${filename}`,
      downloadUrl: `https://example.com/${id}/${filename}?download=1`,
      filename,
      contentType: params.contentType ?? "application/xliff+xml",
      byteSize: 2,
      sha256: "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
      metadata: {},
    })
    .returning();

  if (!file) {
    throw new Error("stored file insert failed");
  }

  return file;
}

export async function insertCompletedPublicFileJob(params: {
  projectId: string;
  organizationId: string;
  apiKeyId?: string;
  outputFiles: Array<{ fileId: string; locale: string; filename: string }>;
}) {
  return db.transaction(async (tx) => {
    const id = `job_${randomUUID()}`;
    const [job] = await tx
      .insert(schema.jobs)
      .values({
        id,
        organizationId: params.organizationId,
        projectId: params.projectId,
        kind: "translation",
        status: "succeeded",
        inputPayload: {
          sourceFileId: "file_source",
          fileFormat: "xliff",
          sourceLocale: "en-US",
          targetLocales: params.outputFiles.map((file) => file.locale),
        },
        outcomePayload: {
          outputFiles: params.outputFiles,
        },
        apiKeyId: params.apiKeyId ?? null,
        completedAt: new Date(),
      })
      .returning();

    if (!job) {
      throw new Error("job insert failed");
    }

    await tx.insert(schema.translationJobDetails).values({
      jobId: id,
      type: "file",
      outcomeKind: "file_result",
    });

    return job;
  });
}

export async function cleanupPublicApiFixture() {
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
}

export async function ensurePublicJobsTestSchema() {
  await db.$client.query(`
    CREATE TABLE IF NOT EXISTS organization_api_keys (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE cascade,
      name text NOT NULL,
      key_hash text NOT NULL,
      key_prefix text NOT NULL,
      permissions jsonb DEFAULT '["jobs:read", "jobs:write"]'::jsonb NOT NULL,
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
