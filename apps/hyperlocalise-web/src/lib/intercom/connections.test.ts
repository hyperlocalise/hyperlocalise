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
  createIntercomConnection,
  getIntercomConnection,
  loadIntercomConnectionWithAccessToken,
  updateIntercomConnection,
} from "./connections";
import type { IntercomConnectionError } from "./types";

const fixture = createAuthTestFixture();

function expectOk<T>(result: Result<T, IntercomConnectionError>): T {
  if (isErr(result)) {
    throw new Error(`expected ok result, got ${result.error.code}`);
  }
  return result.value;
}

async function seedIntercomScope() {
  const identity = fixture.createWorkosIdentityWithRole("admin");
  await fixture.authHeadersFor(identity);

  return {
    organizationId: globalThis.__testApiAuthContext!.organization.localOrganizationId,
    userId: globalThis.__testApiAuthContext!.user.localUserId,
  };
}

describe("intercom connections", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it("encrypts access tokens and only exposes decrypted tokens through the loader", async () => {
    const scope = await seedIntercomScope();
    const accessToken = "intercom-secret-token-abcd";

    const created = expectOk(
      await createIntercomConnection({
        organizationId: scope.organizationId,
        userId: scope.userId,
        displayName: "  Production Intercom  ",
        accessToken: `  ${accessToken}  `,
        restEndpoint: "eu",
        enabled: false,
        validate: false,
      }),
    );

    expect(created).toMatchObject({
      organizationId: scope.organizationId,
      displayName: "Production Intercom",
      restEndpoint: "eu",
      enabled: false,
      validationStatus: "unvalidated",
      validationMessage: null,
      lastValidatedAt: null,
    });
    expect(created.maskedAccessTokenSuffix).toContain("abcd");
    expect(JSON.stringify(created)).not.toContain(accessToken);

    const [row] = await db
      .select()
      .from(schema.intercomConnections)
      .where(eq(schema.intercomConnections.id, created.id))
      .limit(1);
    expect(row).toBeDefined();
    expect(row!.ciphertext).not.toContain(accessToken);
    expect(row!.restEndpoint).toBe("eu");

    const publicConnection = await getIntercomConnection({
      organizationId: scope.organizationId,
      connectionId: created.id,
    });
    expect(JSON.stringify(publicConnection)).not.toContain(accessToken);

    const loaded = expectOk(
      await loadIntercomConnectionWithAccessToken({
        organizationId: scope.organizationId,
        connectionId: created.id,
      }),
    );
    expect(loaded.accessToken).toBe(accessToken);
    expect(JSON.stringify(loaded.connection)).not.toContain(accessToken);

    const wrongOrganization = await loadIntercomConnectionWithAccessToken({
      organizationId: crypto.randomUUID(),
      connectionId: created.id,
    });
    expect(isOk(wrongOrganization)).toBe(false);
    if (isErr(wrongOrganization)) {
      expect(wrongOrganization.error.code).toBe("intercom_connection_not_found");
    }
  });

  it("rejects invalid regional endpoints", async () => {
    const scope = await seedIntercomScope();

    const result = await createIntercomConnection({
      organizationId: scope.organizationId,
      userId: scope.userId,
      displayName: "Bad region",
      accessToken: "token",
      restEndpoint: "https://api.intercom.io",
      validate: false,
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("intercom_rest_endpoint_invalid");
    }
  });

  it("updates display name without clearing credentials", async () => {
    const scope = await seedIntercomScope();
    const created = expectOk(
      await createIntercomConnection({
        organizationId: scope.organizationId,
        userId: scope.userId,
        displayName: "Original",
        accessToken: "intercom-token-keep",
        restEndpoint: "us",
        validate: false,
      }),
    );

    const updated = expectOk(
      await updateIntercomConnection({
        organizationId: scope.organizationId,
        userId: scope.userId,
        connectionId: created.id,
        displayName: "Renamed",
        validate: false,
      }),
    );

    expect(updated?.displayName).toBe("Renamed");
    expect(updated?.restEndpoint).toBe("us");
    expect(updated?.maskedAccessTokenSuffix).toBe(created.maskedAccessTokenSuffix);
  });
});
