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
import "dotenv/config";

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { sql, type SQL } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import type { ApiAuthContext, WorkosAuthIdentity } from "@/api/auth/workos";
import { db, schema } from "@/lib/database/client";
import { syncWorkosIdentityToAuthContext } from "@/test/auth-seed";

import { createApiKeyTestFixture } from "./api-key.fixture";
import { revocableApiKeyWhere, visibleApiKeysWhere } from "./api-key.shared";

const fixture = createApiKeyTestFixture();
const migrationsDirectory = path.join(process.cwd(), "drizzle");

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await fixture.cleanup();
});

async function authContextFor(identity: WorkosAuthIdentity): Promise<ApiAuthContext> {
  const { authContext } = await syncWorkosIdentityToAuthContext(identity);
  return authContext;
}

async function selectApiKeyNames(where: SQL | undefined) {
  const rows = await db
    .select({ name: schema.organizationApiKeys.name })
    .from(schema.organizationApiKeys)
    .where(where);

  return rows.map((row) => row.name).sort();
}

/** The backfill ships inside a generated migration, so find it by its predicate. */
async function readLegacyRevocationBackfillStatement() {
  const fileNames = (await readdir(migrationsDirectory)).filter((name) => name.endsWith(".sql"));
  const statements: string[] = [];

  for (const fileName of fileNames) {
    const contents = await readFile(path.join(migrationsDirectory, fileName), "utf8");

    for (const statement of contents.split("--> statement-breakpoint")) {
      const withoutComments = statement
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("--"))
        .join("\n")
        .trim();

      if (withoutComments.startsWith('UPDATE "organization_api_keys" SET "revoked_at"')) {
        statements.push(withoutComments.replace(/;\s*$/, ""));
      }
    }
  }

  expect(statements).toHaveLength(1);
  return statements[0]!;
}

describe("api key ownership predicates", () => {
  it("scopes listing to the owner unless the caller administers tokens", async () => {
    const adminIdentity = fixture.createWorkosIdentity();
    const memberIdentity = fixture.createWorkosIdentityForOrganization(
      adminIdentity.organization,
      "member",
    );

    const adminAuth = await authContextFor(adminIdentity);
    const memberAuth = await authContextFor(memberIdentity);
    const organizationId = adminAuth.organization.localOrganizationId;

    await fixture.insertApiKey({
      organizationId,
      name: "admin-owned",
      createdByUserId: adminAuth.user.localUserId,
    });
    await fixture.insertApiKey({
      organizationId,
      name: "member-owned",
      createdByUserId: memberAuth.user.localUserId,
    });
    await fixture.insertApiKey({ organizationId, name: "legacy-unowned" });

    expect(await selectApiKeyNames(visibleApiKeysWhere(memberAuth))).toEqual(["member-owned"]);
    expect(await selectApiKeyNames(visibleApiKeysWhere(adminAuth))).toEqual([
      "admin-owned",
      "legacy-unowned",
      "member-owned",
    ]);
  });

  it("keeps listing scoped to the caller's organization", async () => {
    const identityA = fixture.createWorkosIdentity();
    const identityB = fixture.createWorkosIdentity();

    const authA = await authContextFor(identityA);
    const authB = await authContextFor(identityB);

    await fixture.insertApiKey({
      organizationId: authA.organization.localOrganizationId,
      name: "org-a-key",
      createdByUserId: authA.user.localUserId,
    });

    expect(await selectApiKeyNames(visibleApiKeysWhere(authA))).toEqual(["org-a-key"]);
    expect(await selectApiKeyNames(visibleApiKeysWhere(authB))).toEqual([]);
  });

  it("matches a revocable token only for its owner or a token administrator", async () => {
    const adminIdentity = fixture.createWorkosIdentity();
    const memberIdentity = fixture.createWorkosIdentityForOrganization(
      adminIdentity.organization,
      "member",
    );

    const adminAuth = await authContextFor(adminIdentity);
    const memberAuth = await authContextFor(memberIdentity);
    const organizationId = adminAuth.organization.localOrganizationId;

    const { apiKey: adminKey } = await fixture.insertApiKey({
      organizationId,
      name: "admin-owned",
      createdByUserId: adminAuth.user.localUserId,
    });
    const { apiKey: memberKey } = await fixture.insertApiKey({
      organizationId,
      name: "member-owned",
      createdByUserId: memberAuth.user.localUserId,
    });

    expect(await selectApiKeyNames(revocableApiKeyWhere(memberAuth, memberKey.id))).toEqual([
      "member-owned",
    ]);
    expect(await selectApiKeyNames(revocableApiKeyWhere(memberAuth, adminKey.id))).toEqual([]);
    expect(await selectApiKeyNames(revocableApiKeyWhere(adminAuth, memberKey.id))).toEqual([
      "member-owned",
    ]);
  });
});

describe("legacy token revocation backfill", () => {
  it("revokes only unowned tokens that are still active", async () => {
    const identity = fixture.createWorkosIdentity();
    const auth = await authContextFor(identity);
    const organizationId = auth.organization.localOrganizationId;

    const { apiKey: legacyKey } = await fixture.insertApiKey({
      organizationId,
      name: "legacy-unowned",
    });
    const { apiKey: ownedKey } = await fixture.insertApiKey({
      organizationId,
      name: "owned",
      createdByUserId: auth.user.localUserId,
    });
    const alreadyRevokedAt = new Date("2026-01-01T00:00:00.000Z");
    const { apiKey: revokedLegacyKey } = await fixture.insertApiKey({
      organizationId,
      name: "legacy-already-revoked",
      revokedAt: alreadyRevokedAt,
    });

    const backfill = await readLegacyRevocationBackfillStatement();
    // Scope the shipped statement to this test's workspace so concurrent tests
    // keep their own rows.
    await db.execute(sql.raw(`${backfill} AND "organization_id" = '${organizationId}'`));

    const rows = await db
      .select({
        id: schema.organizationApiKeys.id,
        revokedAt: schema.organizationApiKeys.revokedAt,
      })
      .from(schema.organizationApiKeys)
      .where(visibleApiKeysWhere(auth));
    const revokedAtById = new Map(rows.map((row) => [row.id, row.revokedAt]));

    expect(revokedAtById.get(legacyKey.id)).not.toBeNull();
    expect(revokedAtById.get(ownedKey.id)).toBeNull();
    expect(revokedAtById.get(revokedLegacyKey.id)).toEqual(alreadyRevokedAt);
  });
});
