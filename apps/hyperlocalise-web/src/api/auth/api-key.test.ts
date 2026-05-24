import "dotenv/config";

import { eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { createApp } from "@/api/app";
import {
  cleanupPublicApiFixture,
  createPublicApiFixture,
} from "@/api/routes/public-jobs/public-jobs.fixture";
import { db, schema } from "@/lib/database";

const client = testClient(createApp());

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await cleanupPublicApiFixture();
});

describe("apiKeyAuthMiddleware", () => {
  it("rejects API keys for archived workspaces", async () => {
    const { apiKey, project } = await createPublicApiFixture();

    await db
      .update(schema.organizations)
      .set({ lifecycleStatus: "archived", archivedAt: new Date() })
      .where(eq(schema.organizations.id, project.organizationId));

    const response = await client.api.v1.jobs.$post(
      {
        json: {
          type: "string",
          projectId: project.id,
          stringInput: {
            sourceText: "Hello",
            sourceLocale: "en-US",
            targetLocales: ["fr-FR"],
          },
        },
      },
      { headers: { "x-api-key": apiKey } },
    );

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("workspace_archived");
  });
});
