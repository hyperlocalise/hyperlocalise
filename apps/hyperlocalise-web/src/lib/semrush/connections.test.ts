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
  createSemrushConnection,
  getSemrushConnection,
  loadSemrushConnectionWithApiKey,
  updateSemrushConnection,
} from "./connections";
import type { SemrushConnectionError } from "./types";

const fixture = createAuthTestFixture();

function expectOk<T>(result: Result<T, SemrushConnectionError>): T {
  if (isErr(result)) {
    throw new Error(`expected ok result, got ${result.error.code}`);
  }
  return result.value;
}

async function seedSemrushScope() {
  const identity = fixture.createWorkosIdentityWithRole("admin");
  await fixture.authHeadersFor(identity);

  return {
    organizationId: globalThis.__testApiAuthContext!.organization.localOrganizationId,
    userId: globalThis.__testApiAuthContext!.user.localUserId,
  };
}

describe("semrush connections", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it("encrypts API keys and only exposes decrypted keys through the loader", async () => {
    const scope = await seedSemrushScope();
    const apiKey = "semrush-secret-key-abcd";

    const created = expectOk(
      await createSemrushConnection({
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
      .from(schema.semrushConnections)
      .where(eq(schema.semrushConnections.id, created.id))
      .limit(1);
    expect(row).toBeDefined();
    expect(row!.ciphertext).not.toContain(apiKey);

    const publicConnection = await getSemrushConnection({
      organizationId: scope.organizationId,
      connectionId: created.id,
    });
    expect(JSON.stringify(publicConnection)).not.toContain(apiKey);

    const loaded = expectOk(
      await loadSemrushConnectionWithApiKey({
        organizationId: scope.organizationId,
        connectionId: created.id,
      }),
    );
    expect(loaded.apiKey).toBe(apiKey);
    expect(JSON.stringify(loaded.connection)).not.toContain(apiKey);

    const wrongOrganization = await loadSemrushConnectionWithApiKey({
      organizationId: crypto.randomUUID(),
      connectionId: created.id,
    });
    expect(isOk(wrongOrganization)).toBe(false);
    if (isErr(wrongOrganization)) {
      expect(wrongOrganization.error.code).toBe("semrush_connection_not_found");
    }
  });

  // enabled/validationStatus guards live in the Semrush tool consumer (use_semrush.ts),
  // not in loadSemrushConnectionWithApiKey — keep the loader permissive for callers that
  // need credentials while configuring or re-validating a connection.
  it("loads credentials when the connection is disabled and unvalidated", async () => {
    const scope = await seedSemrushScope();
    const apiKey = "semrush-disabled-key-efgh";

    const created = expectOk(
      await createSemrushConnection({
        organizationId: scope.organizationId,
        userId: scope.userId,
        displayName: "Disabled Semrush",
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
      await loadSemrushConnectionWithApiKey({
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
    const scope = await seedSemrushScope();
    const apiKey = "semrush-original-key-wxyz";
    const lastValidatedAt = new Date("2026-07-22T12:00:00.000Z");

    const created = expectOk(
      await createSemrushConnection({
        organizationId: scope.organizationId,
        userId: scope.userId,
        displayName: "Semrush",
        apiKey,
        enabled: true,
        validate: false,
      }),
    );

    await db
      .update(schema.semrushConnections)
      .set({
        validationStatus: "valid",
        validationMessage: "Connected (42 tools).",
        lastValidatedAt,
      })
      .where(eq(schema.semrushConnections.id, created.id));

    const updated = expectOk(
      await updateSemrushConnection({
        organizationId: scope.organizationId,
        userId: scope.userId,
        connectionId: created.id,
        displayName: "  Renamed Semrush  ",
        enabled: false,
        validate: false,
      }),
    );
    // updateSemrushConnection returns ok(null) when the row is missing — not an Err.
    expect(updated).not.toBeNull();

    expect(updated).toMatchObject({
      id: created.id,
      displayName: "Renamed Semrush",
      enabled: false,
      validationStatus: "valid",
      validationMessage: "Connected (42 tools).",
      lastValidatedAt: lastValidatedAt.toISOString(),
    });

    const loaded = expectOk(
      await loadSemrushConnectionWithApiKey({
        organizationId: scope.organizationId,
        connectionId: created.id,
      }),
    );
    expect(loaded.apiKey).toBe(apiKey);
    expect(loaded.connection.maskedApiKeySuffix).toBe(created.maskedApiKeySuffix);
  });
});
