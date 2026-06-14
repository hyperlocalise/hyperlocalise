import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { db, schema } from "@/lib/database";

import { isContentfulPublishFromRecentHyperlocaliseWriteback } from "./events";

const organizationIds: string[] = [];
const userIds: string[] = [];

async function seedContentfulWritebackScope() {
  const organizationId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const projectId = `project-${organizationId.slice(0, 8)}`;
  const [connection] = await db
    .insert(schema.organizations)
    .values({
      id: organizationId,
      workosOrganizationId: `org_${organizationId}`,
      slug: `contentful-events-${organizationId.slice(0, 8)}`,
      name: "Contentful Events Test Org",
    })
    .returning()
    .then(async () => {
      organizationIds.push(organizationId);
      userIds.push(userId);

      await db.insert(schema.users).values({
        id: userId,
        workosUserId: `user_${userId}`,
        email: `${userId}@example.test`,
      });

      await db.insert(schema.projects).values({
        id: projectId,
        organizationId,
        createdByUserId: userId,
        name: "Website",
      });

      return db
        .insert(schema.contentfulConnections)
        .values({
          organizationId,
          createdByUserId: userId,
          displayName: "Contentful Help Center",
          spaceId: `space-${organizationId.slice(0, 8)}`,
          environmentId: "master",
          contentTypeIds: ["helpCenterArticle"],
          fieldConfig: { fieldMode: "auto" },
          encryptionAlgorithm: "aes-256-gcm",
          ciphertext: "ciphertext",
          iv: "iv",
          authTag: "auth-tag",
          maskedTokenSuffix: "token",
        })
        .returning();
    });

  if (!connection) {
    throw new Error("failed to seed contentful connection");
  }

  return { organizationId, connectionId: connection.id, projectId };
}

async function seedTranslationRun(input: {
  organizationId: string;
  connectionId: string;
  projectId: string;
  entryId?: string;
  status?: string;
  completedAt: Date;
  writebackSummary: Record<string, unknown>;
}) {
  await db.insert(schema.contentfulTranslationRuns).values({
    organizationId: input.organizationId,
    connectionId: input.connectionId,
    projectId: input.projectId,
    entryId: input.entryId ?? "entry-1",
    status: input.status ?? "succeeded",
    sourceLocale: "en-US",
    targetLocales: ["fr-FR"],
    completedAt: input.completedAt,
    writebackSummary: input.writebackSummary,
  });
}

describe("contentful webhook events", () => {
  afterEach(async () => {
    for (const organizationId of organizationIds.splice(0)) {
      await db.delete(schema.organizations).where(eq(schema.organizations.id, organizationId));
    }
    for (const userId of userIds.splice(0)) {
      await db.delete(schema.users).where(eq(schema.users.id, userId));
    }
  });

  it("detects recent Contentful publishes caused by Hyperlocalise writeback", async () => {
    const scope = await seedContentfulWritebackScope();

    await seedTranslationRun({
      ...scope,
      completedAt: new Date(Date.now() - 5 * 60 * 1000),
      writebackSummary: { contentfulVersion: 12, localeValuesWritten: 2 },
    });

    await expect(
      isContentfulPublishFromRecentHyperlocaliseWriteback({
        ...scope,
        entryId: "entry-1",
        publishedVersion: 12,
      }),
    ).resolves.toBe(true);
  });

  it("detects recent writebacks with succeeded_with_warnings status", async () => {
    const scope = await seedContentfulWritebackScope();

    await seedTranslationRun({
      ...scope,
      status: "succeeded_with_warnings",
      completedAt: new Date(Date.now() - 5 * 60 * 1000),
      writebackSummary: { contentfulVersion: 12, localeValuesWritten: 2 },
    });

    await expect(
      isContentfulPublishFromRecentHyperlocaliseWriteback({
        ...scope,
        entryId: "entry-1",
        publishedVersion: 12,
      }),
    ).resolves.toBe(true);
  });

  it("does not treat QA-only writebacks as Contentful publish loops", async () => {
    const scope = await seedContentfulWritebackScope();

    await seedTranslationRun({
      ...scope,
      completedAt: new Date(Date.now() - 5 * 60 * 1000),
      writebackSummary: { contentfulVersion: 12, localeValuesWritten: 0 },
    });

    await expect(
      isContentfulPublishFromRecentHyperlocaliseWriteback({
        ...scope,
        entryId: "entry-1",
        publishedVersion: 12,
      }),
    ).resolves.toBe(false);
  });

  it("ignores stale writeback runs", async () => {
    const scope = await seedContentfulWritebackScope();

    await seedTranslationRun({
      ...scope,
      completedAt: new Date(Date.now() - 16 * 60 * 1000),
      writebackSummary: { contentfulVersion: 12, localeValuesWritten: 2 },
    });

    await expect(
      isContentfulPublishFromRecentHyperlocaliseWriteback({
        ...scope,
        entryId: "entry-1",
        publishedVersion: 12,
      }),
    ).resolves.toBe(false);
  });

  it("ignores failed writeback runs", async () => {
    const scope = await seedContentfulWritebackScope();

    await seedTranslationRun({
      ...scope,
      status: "failed",
      completedAt: new Date(Date.now() - 5 * 60 * 1000),
      writebackSummary: { contentfulVersion: 12, localeValuesWritten: 2 },
    });

    await expect(
      isContentfulPublishFromRecentHyperlocaliseWriteback({
        ...scope,
        entryId: "entry-1",
        publishedVersion: 12,
      }),
    ).resolves.toBe(false);
  });
});
