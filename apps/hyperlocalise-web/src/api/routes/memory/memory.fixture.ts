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
import type { AppType } from "@/api/app";
import type { WorkosAuthIdentity } from "@/api/auth/workos";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db, schema } from "@/lib/database/client";
import { normalizeTranslationMemorySourceText } from "@/lib/translation/normalizeTranslationMemorySourceText";
import { testClient } from "hono/testing";

type CreateMemoryInput = Partial<{
  name: string;
  description: string;
}>;

type Client = ReturnType<typeof testClient<AppType>>;

export function createMemoryTestFixture(client?: Client) {
  const authFixture = createAuthTestFixture();

  async function createMemoryViaApi(identity: WorkosAuthIdentity, input?: CreateMemoryInput) {
    if (!client) {
      throw new Error("createMemoryViaApi requires a test client");
    }

    return client.api.orgs[":organizationSlug"]["translation-memories"].$post(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug" },
        json: {
          name: input?.name ?? "Product TM",
          description: input?.description ?? "Product translation memory",
        },
      },
      {
        headers: await authFixture.authHeadersFor(identity),
      },
    );
  }

  async function createStoredMemoryFixture() {
    const { identity, organization, user } = await authFixture.createLocalWorkosIdentity();

    const [memory] = await db
      .insert(schema.memories)
      .values({
        organizationId: organization.id,
        createdByUserId: user.id,
        name: "Test TM",
        description: "Test description",
      })
      .returning();

    return { identity, organization, user, memory };
  }

  async function insertMemoryEntry(
    memoryId: string,
    input: {
      sourceText: string;
      targetText: string;
      sourceLocale?: string;
      targetLocale?: string;
      provenance?: string;
      reviewStatus?: string;
      externalKey?: string;
      createdByUserId?: string;
      importBatchId?: string;
      metadata?: Record<string, unknown>;
      createdAt?: Date;
      updatedAt?: Date;
    },
  ) {
    const createdAt = input.createdAt ?? new Date();
    const [entry] = await db
      .insert(schema.memoryEntries)
      .values({
        memoryId,
        sourceLocale: input.sourceLocale ?? "en",
        targetLocale: input.targetLocale ?? "es",
        sourceText: input.sourceText,
        normalizedSourceText: normalizeTranslationMemorySourceText(input.sourceText),
        targetText: input.targetText,
        matchScore: 100,
        provenance: input.provenance ?? "manual",
        reviewStatus: input.reviewStatus ?? "approved",
        externalKey: input.externalKey,
        createdByUserId: input.createdByUserId,
        importBatchId: input.importBatchId,
        metadata: input.metadata ?? {},
        createdAt,
        updatedAt: input.updatedAt ?? createdAt,
      })
      .returning();

    return entry;
  }

  return {
    authHeadersFor: authFixture.authHeadersFor,
    cleanup: authFixture.cleanup,
    createMemoryViaApi,
    createStoredMemoryFixture,
    insertMemoryEntry,
    createLocalWorkosIdentity: authFixture.createLocalWorkosIdentity,
    createWorkosIdentity: authFixture.createWorkosIdentity,
    createWorkosIdentityForOrganization: authFixture.createWorkosIdentityForOrganization,
    createWorkosIdentityWithRole: authFixture.createWorkosIdentityWithRole,
    getLocalUserId: authFixture.getLocalUserId,
  };
}
