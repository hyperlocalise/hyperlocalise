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

import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { db, schema } from "@/lib/database/client";
import { isErr, isOk } from "@/lib/primitives/result/results";

import {
  createCdnDestination,
  deleteCdnDestination,
  decryptCdnDestinationSecret,
  getCdnDestination,
  listCdnDestinations,
} from "./destinations";
import { otaDistributionWriter } from "./writer";

const fixture = createProjectTestFixture();

const ACCESS_KEY = "AKIAIOSFODNN7EXAMPLE";
const SECRET_KEY = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await fixture.cleanup();
});

describe("cdn destinations", () => {
  it("encrypts credentials, probes, and lists a destination without secrets", async () => {
    const { organization, user } = await fixture.createStoredProjectFixture();
    let probed = 0;

    const created = await createCdnDestination({
      organizationId: organization.id,
      actorUserId: user.id,
      name: " Customer CDN ",
      bucket: "acme-ota-prod",
      region: "eu-west-1",
      publicBaseUrl: "https://cdn.acme.test",
      accessKeyId: ACCESS_KEY,
      secretAccessKey: SECRET_KEY,
      probe: async () => {
        probed += 1;
      },
    });

    expect(isOk(created)).toBe(true);
    if (!isOk(created)) {
      return;
    }
    expect(probed).toBe(1);
    expect(created.value.name).toBe("Customer CDN");
    expect(created.value.bucket).toBe("acme-ota-prod");
    expect(created.value.maskedSecretSuffix).toBe("••••MPLE");
    expect(JSON.stringify(created.value)).not.toContain(SECRET_KEY);

    const listed = await listCdnDestinations(organization.id);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(created.value.id);

    const row = await getCdnDestination({
      organizationId: organization.id,
      destinationId: created.value.id,
    });
    expect(row).not.toBeNull();
    if (!row) {
      return;
    }
    const secret = decryptCdnDestinationSecret(row);
    expect(isOk(secret)).toBe(true);
    if (isOk(secret)) {
      expect(secret.value.accessKeyId).toBe(ACCESS_KEY);
      expect(secret.value.secretAccessKey).toBe(SECRET_KEY);
    }
  });

  it("refuses private endpoints, duplicate names, and destinations still in use", async () => {
    const { organization, user, project } = await fixture.createStoredProjectFixture();
    const privateEndpoint = await createCdnDestination({
      organizationId: organization.id,
      actorUserId: user.id,
      name: "Loopback",
      bucket: "acme-ota-prod",
      region: "us-east-1",
      endpoint: "https://127.0.0.1:9000",
      publicBaseUrl: "https://cdn.acme.test",
      accessKeyId: ACCESS_KEY,
      secretAccessKey: SECRET_KEY,
      probe: async () => undefined,
    });
    expect(isErr(privateEndpoint)).toBe(true);
    if (isErr(privateEndpoint)) {
      expect(privateEndpoint.error).toEqual({ code: "invalid_endpoint" });
    }

    const first = await createCdnDestination({
      organizationId: organization.id,
      actorUserId: user.id,
      name: "Prod",
      bucket: "acme-ota-prod",
      region: "us-east-1",
      publicBaseUrl: "https://cdn.acme.test",
      accessKeyId: ACCESS_KEY,
      secretAccessKey: SECRET_KEY,
      probe: async () => undefined,
    });
    expect(isOk(first)).toBe(true);
    if (!isOk(first)) {
      return;
    }

    const duplicate = await createCdnDestination({
      organizationId: organization.id,
      actorUserId: user.id,
      name: "Prod",
      bucket: "acme-ota-other",
      region: "us-east-1",
      publicBaseUrl: "https://cdn.acme.test",
      accessKeyId: ACCESS_KEY,
      secretAccessKey: SECRET_KEY,
      probe: async () => undefined,
    });
    expect(isErr(duplicate)).toBe(true);
    if (isErr(duplicate)) {
      expect(duplicate.error).toEqual({ code: "destination_name_taken" });
    }

    const [file] = await db
      .insert(schema.repositorySourceFiles)
      .values({
        organizationId: organization.id,
        projectId: project.id,
        sourcePath: "messages.json",
      })
      .returning();
    if (!file) {
      throw new Error("expected source file");
    }

    const distribution = await otaDistributionWriter.create({
      projectId: project.id,
      name: "Mobile",
      fileIds: [file.id],
      locales: ["fr-FR"],
      format: "json",
      destinationId: first.value.id,
      actorUserId: user.id,
    });
    expect(isOk(distribution)).toBe(true);

    const inUse = await deleteCdnDestination({
      organizationId: organization.id,
      destinationId: first.value.id,
    });
    expect(isErr(inUse)).toBe(true);
    if (isErr(inUse)) {
      expect(inUse.error).toEqual({ code: "destination_in_use" });
    }
  });
});
