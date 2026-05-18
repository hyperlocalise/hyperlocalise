import "dotenv/config";

import { createHash, randomUUID } from "node:crypto";

import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { createApp } from "@/api/app";
import { db, schema } from "@/lib/database";
import type { TranslationJobEventData } from "@/lib/workflow/types";
import { cleanupWorkosTestRecords } from "../test-cleanup";

const enqueueJob = vi.fn(async (event: TranslationJobEventData) => ({
  ids: [event.jobId],
}));

const client = testClient(
  createApp({
    jobQueue: {
      enqueue: enqueueJob,
    },
  }),
);

const createdWorkosOrganizationIds = new Set<string>();
const createdWorkosUserIds = new Set<string>();

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

async function insertStoredSourceFile(params: {
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

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.clearAllMocks();

  await cleanupWorkosTestRecords({
    workosOrganizationIds: createdWorkosOrganizationIds,
    workosUserIds: createdWorkosUserIds,
  });

  createdWorkosOrganizationIds.clear();
  createdWorkosUserIds.clear();
});

describe("publicJobRoutes", () => {
  it("creates and enqueues a string translation job with an API key", async () => {
    const { apiKey, project } = await createPublicApiFixture();

    const response = await client.api.v1.jobs.$post(
      {
        json: {
          type: "string",
          projectId: project.id,
          stringInput: {
            sourceText: "Hello world",
            sourceLocale: "en-US",
            targetLocales: ["fr-FR"],
          },
        },
      },
      { headers: { "x-api-key": apiKey } },
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as { job: { id: string; status: string; type: string } };
    expect(body.job).toEqual({
      id: expect.stringMatching(/^job_/),
      status: "queued",
      type: "string",
    });
    expect(enqueueJob).toHaveBeenCalledWith({
      kind: "translation",
      jobId: body.job.id,
      projectId: project.id,
      type: "string",
    });
  });

  it("creates and enqueues a file translation job with an API key", async () => {
    const { apiKey, project } = await createPublicApiFixture();
    const sourceFile = await insertStoredSourceFile({
      organizationId: project.organizationId,
      projectId: project.id,
      filename: "source.xliff",
      contentType: "application/xliff+xml",
    });

    const response = await client.api.v1.jobs.$post(
      {
        json: {
          type: "file",
          projectId: project.id,
          fileInput: {
            sourceFileId: sourceFile.id,
            fileFormat: "xliff",
            sourceLocale: "en-US",
            targetLocales: ["fr-FR"],
            metadata: {
              instructions: "Keep product names unchanged.",
            },
          },
        },
      },
      { headers: { "x-api-key": apiKey } },
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as { job: { id: string; status: string; type: string } };
    expect(body.job).toEqual({
      id: expect.stringMatching(/^job_/),
      status: "queued",
      type: "file",
    });
    expect(enqueueJob).toHaveBeenCalledWith({
      kind: "translation",
      jobId: body.job.id,
      projectId: project.id,
      type: "file",
    });
  });

  it("rejects public file jobs when the source file is not in scope", async () => {
    const { apiKey, project } = await createPublicApiFixture();

    const response = await client.api.v1.jobs.$post(
      {
        json: {
          type: "file",
          projectId: project.id,
          fileInput: {
            sourceFileId: "file_missing",
            fileFormat: "xliff",
            sourceLocale: "en-US",
            targetLocales: ["fr-FR"],
          },
        },
      },
      { headers: { "x-api-key": apiKey } },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "source_file_not_found" });
    expect(enqueueJob).not.toHaveBeenCalled();
  });
});
