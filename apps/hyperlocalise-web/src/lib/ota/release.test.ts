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

import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { db, schema } from "@/lib/database/client";
import { isOk } from "@/lib/primitives/result/results";

import { createMemoryOtaObjectStore } from "./memory-store";
import { createCdnDestination } from "./destinations";
import {
  publishOtaDistributionRelease,
  revokeOtaDistributionAndPurge,
  rotateOtaDistributionHash,
  setHostedOtaObjectStoreForTests,
  setOtaObjectStoreFactoryForTests,
} from "./release";
import { otaDistributionWriter } from "./writer";

const fixture = createProjectTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  setHostedOtaObjectStoreForTests(null);
  setOtaObjectStoreFactoryForTests(null);
  await fixture.cleanup();
});

describe("publishOtaDistributionRelease", () => {
  it("writes a snapshot under the public hash, then 404s after revoke", async () => {
    const { organization, user, project } = await fixture.createStoredProjectFixture();
    const store = createMemoryOtaObjectStore();
    setHostedOtaObjectStoreForTests(store);

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

    const [key] = await db
      .insert(schema.projectTranslationKeys)
      .values({
        organizationId: organization.id,
        projectId: project.id,
        repositorySourceFileId: file.id,
        key: "greeting",
        sourceText: "Hello",
        normalizedSourceText: "hello",
      })
      .returning();
    if (!key) {
      throw new Error("expected key");
    }
    await db.insert(schema.projectTranslations).values({
      organizationId: organization.id,
      projectId: project.id,
      translationKeyId: key.id,
      targetLocale: "fr-FR",
      text: "Bonjour",
      status: "approved",
      provenance: "manual",
    });

    const created = await otaDistributionWriter.create({
      projectId: project.id,
      name: "Web",
      fileIds: [file.id],
      locales: ["fr-FR"],
      format: "json",
      actorUserId: user.id,
    });
    expect(isOk(created)).toBe(true);
    if (!isOk(created)) {
      return;
    }

    const published = await publishOtaDistributionRelease({
      distributionId: created.value.id,
      actorUserId: user.id,
    });
    expect(isOk(published)).toBe(true);
    if (!isOk(published)) {
      return;
    }

    const manifest = await store.get(`${created.value.publicHash}/manifest.json`);
    expect(manifest).not.toBeNull();
    const parsed = JSON.parse(manifest!.body.toString("utf8")) as {
      timestamp: number;
      files: string[];
    };
    expect(parsed.files).toEqual(["/messages.json"]);
    expect(published.value.release.manifest.timestamp).toBe(parsed.timestamp);

    const content = await store.get(`${created.value.publicHash}/content/fr-FR/messages.json`);
    expect(JSON.parse(content!.body.toString("utf8"))).toEqual({ greeting: "Bonjour" });

    const rotated = await rotateOtaDistributionHash({
      distributionId: created.value.id,
      actorUserId: user.id,
    });
    expect(isOk(rotated)).toBe(true);
    if (isOk(rotated)) {
      expect(await store.get(`${created.value.publicHash}/manifest.json`)).toBeNull();
      expect(
        await store.get(`${rotated.value.distribution.publicHash}/manifest.json`),
      ).not.toBeNull();
    }

    await db
      .update(schema.projectTranslations)
      .set({ text: "Salut" })
      .where(eq(schema.projectTranslations.translationKeyId, key.id));

    const rotatedAgain = await rotateOtaDistributionHash({
      distributionId: created.value.id,
      actorUserId: user.id,
    });
    expect(isOk(rotatedAgain)).toBe(true);
    if (!isOk(rotatedAgain)) {
      return;
    }
    const frozenManifest = await store.get(
      `${rotatedAgain.value.distribution.publicHash}/manifest.json`,
    );
    expect(JSON.parse(frozenManifest!.body.toString("utf8")).timestamp).toBe(parsed.timestamp);
    const frozenContent = await store.get(
      `${rotatedAgain.value.distribution.publicHash}/content/fr-FR/messages.json`,
    );
    expect(JSON.parse(frozenContent!.body.toString("utf8"))).toEqual({ greeting: "Bonjour" });
    if (isOk(rotated)) {
      expect(await store.get(`${rotated.value.distribution.publicHash}/manifest.json`)).toBeNull();
    }

    const revoked = await revokeOtaDistributionAndPurge({
      distributionId: created.value.id,
      actorUserId: user.id,
    });
    expect(isOk(revoked)).toBe(true);
    expect(
      await store.get(`${rotatedAgain.value.distribution.publicHash}/manifest.json`),
    ).toBeNull();
  });

  it("writes custom-destination releases to that bucket URL, not the hosted origin", async () => {
    const { organization, user, project } = await fixture.createStoredProjectFixture();
    const store = createMemoryOtaObjectStore();
    setOtaObjectStoreFactoryForTests(() => store);

    const destination = await createCdnDestination({
      organizationId: organization.id,
      actorUserId: user.id,
      name: "Acme CDN",
      bucket: "acme-ota-prod",
      region: "eu-west-1",
      publicBaseUrl: "https://cdn.acme.test",
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      probe: async () => undefined,
    });
    expect(isOk(destination)).toBe(true);
    if (!isOk(destination)) {
      return;
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
    const [key] = await db
      .insert(schema.projectTranslationKeys)
      .values({
        organizationId: organization.id,
        projectId: project.id,
        repositorySourceFileId: file.id,
        key: "greeting",
        sourceText: "Hello",
        normalizedSourceText: "hello",
      })
      .returning();
    if (!key) {
      throw new Error("expected key");
    }
    await db.insert(schema.projectTranslations).values({
      organizationId: organization.id,
      projectId: project.id,
      translationKeyId: key.id,
      targetLocale: "fr-FR",
      text: "Bonjour",
      status: "approved",
      provenance: "manual",
    });

    const created = await otaDistributionWriter.create({
      projectId: project.id,
      name: "Mobile",
      fileIds: [file.id],
      locales: ["fr-FR"],
      format: "json",
      destinationId: destination.value.id,
      actorUserId: user.id,
    });
    expect(isOk(created)).toBe(true);
    if (!isOk(created)) {
      return;
    }

    const published = await publishOtaDistributionRelease({
      distributionId: created.value.id,
      actorUserId: user.id,
    });
    expect(isOk(published)).toBe(true);
    if (!isOk(published)) {
      return;
    }
    expect(published.value.manifestUrl).toBe(
      `https://cdn.acme.test/${created.value.publicHash}/manifest.json`,
    );
    expect(await store.get(`${created.value.publicHash}/manifest.json`)).not.toBeNull();
  });
});
