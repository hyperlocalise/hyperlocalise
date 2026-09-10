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
import { db, schema } from "@/lib/database/client";
import { isErr, isOk, type Result } from "@/lib/primitives/result/results";

import {
  createZernioConnection,
  getZernioConnection,
  loadZernioConnectionWithApiKey,
  resolveZernioConnectionWithApiKey,
  updateZernioConnection,
} from "./connections";
import type { ZernioConnectionError } from "./types";

const fixture = createAuthTestFixture();

function expectOk<T>(result: Result<T, ZernioConnectionError>): T {
  if (isErr(result)) {
    throw new Error(`expected ok result, got ${result.error.code}`);
  }
  return result.value;
}

async function seedZernioScope() {
  const identity = fixture.createWorkosIdentityWithRole("admin");
  await fixture.authHeadersFor(identity);

  return {
    organizationId: globalThis.__testApiAuthContext!.organization.localOrganizationId,
    userId: globalThis.__testApiAuthContext!.user.localUserId,
  };
}

async function markValid(connectionId: string) {
  await db
    .update(schema.zernioConnections)
    .set({
      enabled: true,
      validationStatus: "valid",
      validationMessage: "Connected (1 accounts).",
    })
    .where(eq(schema.zernioConnections.id, connectionId));
}

describe("zernio connections", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it("encrypts API keys and only exposes decrypted keys through the loader", async () => {
    const scope = await seedZernioScope();
    const apiKey = "zernio-secret-key-abcd";

    const created = expectOk(
      await createZernioConnection({
        organizationId: scope.organizationId,
        userId: scope.userId,
        displayName: "  Production ads  ",
        apiKey: `  ${apiKey}  `,
        enabled: false,
        validate: false,
      }),
    );

    expect(created).toMatchObject({
      organizationId: scope.organizationId,
      displayName: "Production ads",
      enabled: false,
      validationStatus: "unvalidated",
      validationMessage: null,
      lastValidatedAt: null,
    });
    expect(created.maskedApiKeySuffix).toContain("abcd");
    expect(JSON.stringify(created)).not.toContain(apiKey);

    const [row] = await db
      .select()
      .from(schema.zernioConnections)
      .where(eq(schema.zernioConnections.id, created.id))
      .limit(1);
    expect(row).toBeDefined();
    expect(row!.ciphertext).not.toContain(apiKey);

    const publicConnection = await getZernioConnection({
      organizationId: scope.organizationId,
      connectionId: created.id,
    });
    expect(JSON.stringify(publicConnection)).not.toContain(apiKey);

    const loaded = expectOk(
      await loadZernioConnectionWithApiKey({
        organizationId: scope.organizationId,
        connectionId: created.id,
      }),
    );
    expect(loaded.apiKey).toBe(apiKey);
    expect(JSON.stringify(loaded.connection)).not.toContain(apiKey);

    const wrongOrganization = await loadZernioConnectionWithApiKey({
      organizationId: crypto.randomUUID(),
      connectionId: created.id,
    });
    expect(isOk(wrongOrganization)).toBe(false);
    if (isErr(wrongOrganization)) {
      expect(wrongOrganization.error.code).toBe("zernio_connection_not_found");
    }
  });

  it("loads credentials when the connection is disabled and unvalidated", async () => {
    const scope = await seedZernioScope();
    const apiKey = "zernio-disabled-key-efgh";

    const created = expectOk(
      await createZernioConnection({
        organizationId: scope.organizationId,
        userId: scope.userId,
        displayName: "Disabled Zernio",
        apiKey,
        enabled: false,
        validate: false,
      }),
    );

    const loaded = expectOk(
      await loadZernioConnectionWithApiKey({
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
    const scope = await seedZernioScope();
    const apiKey = "zernio-original-key-wxyz";
    const lastValidatedAt = new Date("2026-07-22T12:00:00.000Z");

    const created = expectOk(
      await createZernioConnection({
        organizationId: scope.organizationId,
        userId: scope.userId,
        displayName: "Zernio",
        apiKey,
        enabled: true,
        validate: false,
      }),
    );

    await db
      .update(schema.zernioConnections)
      .set({
        validationStatus: "valid",
        validationMessage: "Connected (3 accounts).",
        lastValidatedAt,
      })
      .where(eq(schema.zernioConnections.id, created.id));

    const updated = expectOk(
      await updateZernioConnection({
        organizationId: scope.organizationId,
        userId: scope.userId,
        connectionId: created.id,
        displayName: "  Renamed Zernio  ",
        enabled: false,
        validate: false,
      }),
    );
    expect(updated).not.toBeNull();

    expect(updated).toMatchObject({
      id: created.id,
      displayName: "Renamed Zernio",
      enabled: false,
      validationStatus: "valid",
      validationMessage: "Connected (3 accounts).",
      lastValidatedAt: lastValidatedAt.toISOString(),
    });

    const loaded = expectOk(
      await loadZernioConnectionWithApiKey({
        organizationId: scope.organizationId,
        connectionId: created.id,
      }),
    );
    expect(loaded.apiKey).toBe(apiKey);
    expect(loaded.connection.maskedApiKeySuffix).toBe(created.maskedApiKeySuffix);
  });

  it("resolves the only enabled valid connection when no id is supplied", async () => {
    const scope = await seedZernioScope();
    const created = expectOk(
      await createZernioConnection({
        organizationId: scope.organizationId,
        userId: scope.userId,
        displayName: "Solo Zernio",
        apiKey: "zernio-solo-key-1111",
        enabled: true,
        validate: false,
      }),
    );
    await markValid(created.id);

    const resolved = expectOk(
      await resolveZernioConnectionWithApiKey({
        organizationId: scope.organizationId,
      }),
    );
    expect(resolved.connection.id).toBe(created.id);
    expect(resolved.apiKey).toBe("zernio-solo-key-1111");
  });

  it("requires an explicit connection id when more than one valid connection exists", async () => {
    const scope = await seedZernioScope();
    const first = expectOk(
      await createZernioConnection({
        organizationId: scope.organizationId,
        userId: scope.userId,
        displayName: "Zernio A",
        apiKey: "zernio-key-aaaa",
        enabled: true,
        validate: false,
      }),
    );
    const second = expectOk(
      await createZernioConnection({
        organizationId: scope.organizationId,
        userId: scope.userId,
        displayName: "Zernio B",
        apiKey: "zernio-key-bbbb",
        enabled: true,
        validate: false,
      }),
    );
    await markValid(first.id);
    await markValid(second.id);

    const ambiguous = await resolveZernioConnectionWithApiKey({
      organizationId: scope.organizationId,
    });
    expect(isErr(ambiguous)).toBe(true);
    if (isErr(ambiguous)) {
      expect(ambiguous.error.code).toBe("zernio_connection_ambiguous");
    }

    const resolved = expectOk(
      await resolveZernioConnectionWithApiKey({
        organizationId: scope.organizationId,
        connectionId: second.id,
      }),
    );
    expect(resolved.connection.id).toBe(second.id);
  });
});
