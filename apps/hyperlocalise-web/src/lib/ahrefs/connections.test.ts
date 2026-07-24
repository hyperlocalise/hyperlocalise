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

import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db, schema } from "@/lib/database";
import { isErr, isOk, type Result } from "@/lib/primitives/result/results";

import {
  createAhrefsConnection,
  getAhrefsConnection,
  loadAhrefsConnectionWithApiKey,
  updateAhrefsConnection,
} from "./connections";
import type { AhrefsConnectionError } from "./types";

const fixture = createAuthTestFixture();

function expectOk<T>(result: Result<T, AhrefsConnectionError>): T {
  if (isErr(result)) {
    throw new Error(`expected ok result, got ${result.error.code}`);
  }
  return result.value;
}

async function seedAhrefsScope() {
  const identity = fixture.createWorkosIdentityWithRole("admin");
  await fixture.authHeadersFor(identity);

  return {
    organizationId: globalThis.__testApiAuthContext!.organization.localOrganizationId,
    userId: globalThis.__testApiAuthContext!.user.localUserId,
  };
}

describe("ahrefs connections", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it("encrypts API keys and only exposes decrypted keys through the loader", async () => {
    const scope = await seedAhrefsScope();
    const apiKey = "ahrefs-secret-key-abcd";

    const created = expectOk(
      await createAhrefsConnection({
        organizationId: scope.organizationId,
        userId: scope.userId,
        displayName: "  Production SEO  ",
        apiKey: `  ${apiKey}  `,
        enabled: false,
        validate: false,
      }),
    );

    expect(created).toMatchObject({
      organizationId: scope.organizationId,
      displayName: "Production SEO",
      enabled: false,
      validationStatus: "unvalidated",
      validationMessage: null,
      lastValidatedAt: null,
    });
    expect(created.maskedApiKeySuffix).toContain("abcd");
    expect(JSON.stringify(created)).not.toContain(apiKey);

    const [row] = await db
      .select()
      .from(schema.ahrefsConnections)
      .where(eq(schema.ahrefsConnections.id, created.id))
      .limit(1);
    expect(row).toBeDefined();
    expect(row!.ciphertext).not.toContain(apiKey);

    const publicConnection = await getAhrefsConnection({
      organizationId: scope.organizationId,
      connectionId: created.id,
    });
    expect(JSON.stringify(publicConnection)).not.toContain(apiKey);

    const loaded = expectOk(
      await loadAhrefsConnectionWithApiKey({
        organizationId: scope.organizationId,
        connectionId: created.id,
      }),
    );
    expect(loaded.apiKey).toBe(apiKey);
    expect(JSON.stringify(loaded.connection)).not.toContain(apiKey);

    const wrongOrganization = await loadAhrefsConnectionWithApiKey({
      organizationId: crypto.randomUUID(),
      connectionId: created.id,
    });
    expect(isOk(wrongOrganization)).toBe(false);
    if (isErr(wrongOrganization)) {
      expect(wrongOrganization.error.code).toBe("ahrefs_connection_not_found");
    }
  });

  // enabled/validationStatus guards live in the Ahrefs tool consumer (use_ahrefs.ts),
  // not in loadAhrefsConnectionWithApiKey — keep the loader permissive for callers that
  // need credentials while configuring or re-validating a connection.
  it("loads credentials when the connection is disabled and unvalidated", async () => {
    const scope = await seedAhrefsScope();
    const apiKey = "ahrefs-disabled-key-efgh";

    const created = expectOk(
      await createAhrefsConnection({
        organizationId: scope.organizationId,
        userId: scope.userId,
        displayName: "Disabled Ahrefs",
        apiKey,
        enabled: false,
        validate: false,
      }),
    );

    expect(created).toMatchObject({
      enabled: false,
      validationStatus: "unvalidated",
    });

    const loaded = expectOk(
      await loadAhrefsConnectionWithApiKey({
        organizationId: scope.organizationId,
        connectionId: created.id,
      }),
    );
    expect(loaded.apiKey).toBe(apiKey);
    expect(loaded.connection).toMatchObject({
      enabled: false,
      validationStatus: "unvalidated",
    });
  });

  it("preserves validation state and stored API key on metadata-only updates", async () => {
    const scope = await seedAhrefsScope();
    const apiKey = "ahrefs-original-key-wxyz";
    const lastValidatedAt = new Date("2026-07-24T12:00:00.000Z");

    const created = expectOk(
      await createAhrefsConnection({
        organizationId: scope.organizationId,
        userId: scope.userId,
        displayName: "Ahrefs",
        apiKey,
        enabled: true,
        validate: false,
      }),
    );

    await db
      .update(schema.ahrefsConnections)
      .set({
        validationStatus: "valid",
        validationMessage: "Connected (42 tools).",
        lastValidatedAt,
      })
      .where(eq(schema.ahrefsConnections.id, created.id));

    const updated = expectOk(
      await updateAhrefsConnection({
        organizationId: scope.organizationId,
        userId: scope.userId,
        connectionId: created.id,
        displayName: "  Renamed Ahrefs  ",
        enabled: false,
        validate: false,
      }),
    );
    // updateAhrefsConnection returns ok(null) when the row is missing — not an Err.
    expect(updated).not.toBeNull();

    expect(updated).toMatchObject({
      id: created.id,
      displayName: "Renamed Ahrefs",
      enabled: false,
      validationStatus: "valid",
      validationMessage: "Connected (42 tools).",
      lastValidatedAt: lastValidatedAt.toISOString(),
    });

    const loaded = expectOk(
      await loadAhrefsConnectionWithApiKey({
        organizationId: scope.organizationId,
        connectionId: created.id,
      }),
    );
    expect(loaded.apiKey).toBe(apiKey);
    expect(loaded.connection.maskedApiKeySuffix).toBe(created.maskedApiKeySuffix);
  });
});
