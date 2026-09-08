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

import { randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { db, schema } from "@/lib/database/client";
import { uniqueTestProjectIdentifier } from "@/lib/projects/issue-identifier/test-project-identifier";
import { isErr, isOk } from "@/lib/primitives/result/results";

import { isOtaPublicHash, OTA_PUBLIC_HASH_BYTE_LENGTH } from "./public-hash";
import { otaDistributionWriter } from "./writer";

const { generateOtaPublicHashMock } = vi.hoisted(() => ({
  generateOtaPublicHashMock: vi.fn(() => randomBytes(16).toString("hex")),
}));

vi.mock("./public-hash", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./public-hash")>();
  return {
    ...actual,
    generateOtaPublicHash: (...args: Parameters<typeof actual.generateOtaPublicHash>) =>
      generateOtaPublicHashMock(...args),
  };
});

const fixture = createProjectTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  generateOtaPublicHashMock.mockReset();
  generateOtaPublicHashMock.mockImplementation(() =>
    randomBytes(OTA_PUBLIC_HASH_BYTE_LENGTH).toString("hex"),
  );
  await fixture.cleanup();
});

async function seedSourceFile(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
}) {
  const [file] = await db
    .insert(schema.repositorySourceFiles)
    .values({
      organizationId: input.organizationId,
      projectId: input.projectId,
      sourcePath: input.sourcePath,
    })
    .returning();

  if (!file) {
    throw new Error("expected repository source file");
  }

  return file;
}

async function seedExternalProject(input: { organizationId: string; userId: string }) {
  const [project] = await db
    .insert(schema.projects)
    .values({
      id: `project_${crypto.randomUUID()}`,
      identifier: uniqueTestProjectIdentifier(),
      organizationId: input.organizationId,
      createdByUserId: input.userId,
      name: "Crowdin App",
      source: "external_tms",
      externalProviderKind: "crowdin",
      externalProjectId: `crowdin_${crypto.randomUUID()}`,
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
    })
    .returning();

  if (!project) {
    throw new Error("expected external project");
  }

  return project;
}

describe("otaDistributionWriter", () => {
  it("creates a native-project distribution with an unguessable public hash", async () => {
    const { organization, user, project } = await fixture.createStoredProjectFixture();
    const file = await seedSourceFile({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath: "locales/en.json",
    });

    const created = await otaDistributionWriter.create({
      projectId: project.id,
      name: " Mobile JSON ",
      fileIds: [file.id, file.id],
      locales: ["fr-fr"],
      format: "json",
      actorUserId: user.id,
    });

    expect(isOk(created)).toBe(true);
    if (!isOk(created)) {
      return;
    }

    expect(created.value.name).toBe("Mobile JSON");
    expect(created.value.projectId).toBe(project.id);
    expect(created.value.organizationId).toBe(organization.id);
    expect(created.value.fileIds).toEqual([file.id]);
    expect(created.value.locales).toEqual(["fr-FR"]);
    expect(created.value.format).toBe("json");
    expect(created.value.revokedAt).toBeNull();
    expect(isOtaPublicHash(created.value.publicHash)).toBe(true);
    expect(created.value.publicHash.includes(project.id)).toBe(false);
    expect(created.value.publicHash.toLowerCase().includes("docs")).toBe(false);
  });

  it("refuses external TMS projects", async () => {
    const { organization, user } = await fixture.createStoredProjectFixture();
    const project = await seedExternalProject({
      organizationId: organization.id,
      userId: user.id,
    });

    const created = await otaDistributionWriter.create({
      projectId: project.id,
      name: "CDN",
      fileIds: ["00000000-0000-0000-0000-000000000001"],
      locales: ["fr-FR"],
      format: "json",
      actorUserId: user.id,
    });

    expect(isErr(created)).toBe(true);
    if (!isErr(created)) {
      return;
    }
    expect(created.error).toEqual({ code: "not_native_project" });
  });

  it("refuses file ids and locales that do not belong to the project", async () => {
    const { organization, user, project } = await fixture.createStoredProjectFixture();
    const file = await seedSourceFile({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath: "android/values/strings.xml",
    });

    const unknownFiles = await otaDistributionWriter.create({
      projectId: project.id,
      name: "Android",
      fileIds: [file.id, "00000000-0000-4000-8000-000000000099"],
      locales: ["fr-FR"],
      format: "android_xml",
      actorUserId: user.id,
    });
    expect(isErr(unknownFiles)).toBe(true);
    if (isErr(unknownFiles)) {
      expect(unknownFiles.error).toEqual({
        code: "unknown_file_ids",
        fileIds: ["00000000-0000-4000-8000-000000000099"],
      });
    }

    const unknownLocales = await otaDistributionWriter.create({
      projectId: project.id,
      name: "Android",
      fileIds: [file.id],
      locales: ["ja-JP"],
      format: "android_xml",
      actorUserId: user.id,
    });
    expect(isErr(unknownLocales)).toBe(true);
    if (isErr(unknownLocales)) {
      expect(unknownLocales.error).toEqual({
        code: "locales_not_in_project",
        locales: ["ja-JP"],
      });
    }
  });

  it("updates selection and records a sequential release snapshot", async () => {
    const { user, project } = await fixture.createStoredProjectFixture();
    const firstFile = await seedSourceFile({
      organizationId: project.organizationId,
      projectId: project.id,
      sourcePath: "src/Localizable.strings",
    });
    const secondFile = await seedSourceFile({
      organizationId: project.organizationId,
      projectId: project.id,
      sourcePath: "src/InfoPlist.strings",
    });

    const created = await otaDistributionWriter.create({
      projectId: project.id,
      name: "iOS",
      fileIds: [firstFile.id],
      locales: ["fr-FR"],
      format: "ios_strings",
      actorUserId: user.id,
    });
    expect(isOk(created)).toBe(true);
    if (!isOk(created)) {
      return;
    }

    const updated = await otaDistributionWriter.update({
      distributionId: created.value.id,
      actorUserId: user.id,
      fileIds: [firstFile.id, secondFile.id],
      locales: ["fr-FR", "en-US"],
    });
    expect(isOk(updated)).toBe(true);
    if (!isOk(updated)) {
      return;
    }
    expect(updated.value.fileIds).toEqual([firstFile.id, secondFile.id]);
    expect(updated.value.locales).toEqual(["fr-FR", "en-US"]);

    const firstRelease = await otaDistributionWriter.release({
      distributionId: created.value.id,
      actorUserId: user.id,
      artifactPointer: "ota/demo/1",
    });
    const secondRelease = await otaDistributionWriter.release({
      distributionId: created.value.id,
      actorUserId: user.id,
    });

    expect(isOk(firstRelease)).toBe(true);
    expect(isOk(secondRelease)).toBe(true);
    if (!isOk(firstRelease) || !isOk(secondRelease)) {
      return;
    }

    expect(firstRelease.value.sequence).toBe(1);
    expect(secondRelease.value.sequence).toBe(2);
    expect(firstRelease.value.artifactPointer).toBe("ota/demo/1");
    expect(secondRelease.value.artifactPointer).toBeNull();
    expect(firstRelease.value.manifest.files).toEqual([
      "/src/Localizable.strings",
      "/src/InfoPlist.strings",
    ]);
    expect(firstRelease.value.manifest.languages).toEqual(["fr-FR", "en-US"]);
    expect(firstRelease.value.manifest.content["fr-FR"]).toEqual([
      "/content/fr-FR/src/Localizable.strings",
      "/content/fr-FR/src/InfoPlist.strings",
    ]);
    expect(firstRelease.value.manifest.format).toBe("ios_strings");
    expect(firstRelease.value.manifest.timestamp).toBeGreaterThan(0);

    const formatChange = await otaDistributionWriter.update({
      distributionId: created.value.id,
      actorUserId: user.id,
      format: "json",
    });
    expect(isOk(formatChange)).toBe(true);

    const [persistedFirstRelease] = await db
      .select()
      .from(schema.otaReleases)
      .where(eq(schema.otaReleases.id, firstRelease.value.id));
    expect(persistedFirstRelease?.manifest.format).toBe("ios_strings");

    const ignoredFormatOverride = await otaDistributionWriter.release({
      distributionId: created.value.id,
      actorUserId: user.id,
      manifest: {
        // @ts-expect-error format is taken from the locked distribution
        format: "android_xml",
      },
    });
    expect(isOk(ignoredFormatOverride)).toBe(true);
    if (isOk(ignoredFormatOverride)) {
      expect(ignoredFormatOverride.value.manifest.format).toBe("json");
    }
  });

  it("keeps rows on revoke and refuses further writes", async () => {
    const { user, project } = await fixture.createStoredProjectFixture();
    const file = await seedSourceFile({
      organizationId: project.organizationId,
      projectId: project.id,
      sourcePath: "messages.json",
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

    const released = await otaDistributionWriter.release({
      distributionId: created.value.id,
      actorUserId: user.id,
    });
    expect(isOk(released)).toBe(true);

    const revoked = await otaDistributionWriter.revoke({
      distributionId: created.value.id,
      actorUserId: user.id,
    });
    expect(isOk(revoked)).toBe(true);
    if (!isOk(revoked)) {
      return;
    }
    expect(revoked.value.revokedAt).toBeInstanceOf(Date);

    const again = await otaDistributionWriter.revoke({
      distributionId: created.value.id,
      actorUserId: user.id,
    });
    expect(isOk(again)).toBe(true);
    if (isOk(again) && isOk(revoked)) {
      expect(again.value.revokedAt?.getTime()).toBe(revoked.value.revokedAt?.getTime());
    }

    const [persisted] = await db
      .select()
      .from(schema.otaDistributions)
      .where(eq(schema.otaDistributions.id, created.value.id));
    expect(persisted?.revokedAt).toBeInstanceOf(Date);

    const [releaseRow] = await db
      .select()
      .from(schema.otaReleases)
      .where(eq(schema.otaReleases.distributionId, created.value.id));
    expect(releaseRow?.sequence).toBe(1);

    const update = await otaDistributionWriter.update({
      distributionId: created.value.id,
      actorUserId: user.id,
      name: "Still Web",
    });
    expect(isErr(update)).toBe(true);
    if (isErr(update)) {
      expect(update.error).toEqual({ code: "revoked" });
    }

    const releaseAfterRevoke = await otaDistributionWriter.release({
      distributionId: created.value.id,
      actorUserId: user.id,
    });
    expect(isErr(releaseAfterRevoke)).toBe(true);
    if (isErr(releaseAfterRevoke)) {
      expect(releaseAfterRevoke.error).toEqual({ code: "revoked" });
    }
  });

  it("returns the persisted revoked row when two revokes race", async () => {
    const { user, project } = await fixture.createStoredProjectFixture();
    const file = await seedSourceFile({
      organizationId: project.organizationId,
      projectId: project.id,
      sourcePath: "race.json",
    });

    const created = await otaDistributionWriter.create({
      projectId: project.id,
      name: "Race",
      fileIds: [file.id],
      locales: ["fr-FR"],
      format: "json",
      actorUserId: user.id,
    });
    expect(isOk(created)).toBe(true);
    if (!isOk(created)) {
      return;
    }

    const [first, second] = await Promise.all([
      otaDistributionWriter.revoke({
        distributionId: created.value.id,
        actorUserId: user.id,
      }),
      otaDistributionWriter.revoke({
        distributionId: created.value.id,
        actorUserId: user.id,
      }),
    ]);

    expect(isOk(first)).toBe(true);
    expect(isOk(second)).toBe(true);
    if (!isOk(first) || !isOk(second)) {
      return;
    }

    expect(first.value.revokedAt).toBeInstanceOf(Date);
    expect(second.value.revokedAt).toBeInstanceOf(Date);
    expect(first.value.revokedAt?.getTime()).toBe(second.value.revokedAt?.getTime());
  });

  it("cascades distribution and release rows when the project is deleted", async () => {
    const { user, project } = await fixture.createStoredProjectFixture();
    const file = await seedSourceFile({
      organizationId: project.organizationId,
      projectId: project.id,
      sourcePath: "app.json",
    });

    const created = await otaDistributionWriter.create({
      projectId: project.id,
      name: "Cascade",
      fileIds: [file.id],
      locales: ["fr-FR"],
      format: "json",
      actorUserId: user.id,
    });
    expect(isOk(created)).toBe(true);
    if (!isOk(created)) {
      return;
    }

    await otaDistributionWriter.release({
      distributionId: created.value.id,
      actorUserId: user.id,
    });

    await db.delete(schema.projects).where(eq(schema.projects.id, project.id));

    const distributions = await db
      .select()
      .from(schema.otaDistributions)
      .where(eq(schema.otaDistributions.id, created.value.id));
    const releases = await db
      .select()
      .from(schema.otaReleases)
      .where(eq(schema.otaReleases.distributionId, created.value.id));

    expect(distributions).toEqual([]);
    expect(releases).toEqual([]);
  });

  it("rejects invalid names, empty selections, and missing projects", async () => {
    const { user, project } = await fixture.createStoredProjectFixture();
    const file = await seedSourceFile({
      organizationId: project.organizationId,
      projectId: project.id,
      sourcePath: "messages.json",
    });

    const emptyName = await otaDistributionWriter.create({
      projectId: project.id,
      name: "   ",
      fileIds: [file.id],
      locales: ["fr-FR"],
      format: "json",
      actorUserId: user.id,
    });
    expect(isErr(emptyName)).toBe(true);
    if (isErr(emptyName)) {
      expect(emptyName.error).toEqual({ code: "invalid_name" });
    }

    const longName = await otaDistributionWriter.create({
      projectId: project.id,
      name: "x".repeat(121),
      fileIds: [file.id],
      locales: ["fr-FR"],
      format: "json",
      actorUserId: user.id,
    });
    expect(isErr(longName)).toBe(true);
    if (isErr(longName)) {
      expect(longName.error).toEqual({ code: "invalid_name" });
    }

    const emptyFiles = await otaDistributionWriter.create({
      projectId: project.id,
      name: "Empty files",
      fileIds: ["", "  "],
      locales: ["fr-FR"],
      format: "json",
      actorUserId: user.id,
    });
    expect(isErr(emptyFiles)).toBe(true);
    if (isErr(emptyFiles)) {
      expect(emptyFiles.error).toEqual({ code: "empty_file_ids" });
    }

    const emptyLocales = await otaDistributionWriter.create({
      projectId: project.id,
      name: "Empty locales",
      fileIds: [file.id],
      locales: [],
      format: "json",
      actorUserId: user.id,
    });
    expect(isErr(emptyLocales)).toBe(true);
    if (isErr(emptyLocales)) {
      expect(emptyLocales.error).toEqual({ code: "empty_locales" });
    }

    const missingProject = await otaDistributionWriter.create({
      projectId: `project_${crypto.randomUUID()}`,
      name: "Missing",
      fileIds: [file.id],
      locales: ["fr-FR"],
      format: "json",
      actorUserId: user.id,
    });
    expect(isErr(missingProject)).toBe(true);
    if (isErr(missingProject)) {
      expect(missingProject.error).toEqual({ code: "project_not_found" });
    }
  });

  it("rejects invalid formats and non-canonical locales", async () => {
    const { user, project } = await fixture.createStoredProjectFixture();
    const file = await seedSourceFile({
      organizationId: project.organizationId,
      projectId: project.id,
      sourcePath: "bad-format.json",
    });

    const invalidFormat = await otaDistributionWriter.create({
      projectId: project.id,
      name: "Bad format",
      fileIds: [file.id],
      locales: ["fr-FR"],
      format: "yaml" as "json",
      actorUserId: user.id,
    });
    expect(isErr(invalidFormat)).toBe(true);
    if (isErr(invalidFormat)) {
      expect(invalidFormat.error).toEqual({ code: "invalid_format" });
    }

    const invalidLocales = await otaDistributionWriter.create({
      projectId: project.id,
      name: "Bad locales",
      fileIds: [file.id],
      locales: ["not a locale", "!!!"],
      format: "json",
      actorUserId: user.id,
    });
    expect(isErr(invalidLocales)).toBe(true);
    if (isErr(invalidLocales)) {
      expect(invalidLocales.error).toEqual({
        code: "invalid_locales",
        locales: ["not a locale", "!!!"],
      });
    }
  });

  it("returns distribution_not_found for update, revoke, and release on missing ids", async () => {
    const { user } = await fixture.createStoredProjectFixture();
    const missingId = crypto.randomUUID();

    const update = await otaDistributionWriter.update({
      distributionId: missingId,
      actorUserId: user.id,
      name: "Ghost",
    });
    expect(isErr(update)).toBe(true);
    if (isErr(update)) {
      expect(update.error).toEqual({ code: "distribution_not_found" });
    }

    const revoke = await otaDistributionWriter.revoke({
      distributionId: missingId,
      actorUserId: user.id,
    });
    expect(isErr(revoke)).toBe(true);
    if (isErr(revoke)) {
      expect(revoke.error).toEqual({ code: "distribution_not_found" });
    }

    const release = await otaDistributionWriter.release({
      distributionId: missingId,
      actorUserId: user.id,
    });
    expect(isErr(release)).toBe(true);
    if (isErr(release)) {
      expect(release.error).toEqual({ code: "distribution_not_found" });
    }
  });

  it("returns hash_collision after repeated unique public-hash conflicts", async () => {
    const { user, project } = await fixture.createStoredProjectFixture();
    const file = await seedSourceFile({
      organizationId: project.organizationId,
      projectId: project.id,
      sourcePath: "collision.json",
    });

    const collidingHash = "a".repeat(32);
    generateOtaPublicHashMock.mockReturnValue(collidingHash);

    const first = await otaDistributionWriter.create({
      projectId: project.id,
      name: "First",
      fileIds: [file.id],
      locales: ["fr-FR"],
      format: "json",
      actorUserId: user.id,
    });
    expect(isOk(first)).toBe(true);
    if (!isOk(first)) {
      return;
    }
    expect(first.value.publicHash).toBe(collidingHash);

    const second = await otaDistributionWriter.create({
      projectId: project.id,
      name: "Second",
      fileIds: [file.id],
      locales: ["fr-FR"],
      format: "json",
      actorUserId: user.id,
    });
    expect(isErr(second)).toBe(true);
    if (isErr(second)) {
      expect(second.error).toEqual({ code: "hash_collision" });
    }
    expect(generateOtaPublicHashMock.mock.calls.length).toBeGreaterThanOrEqual(6);
  });
});
