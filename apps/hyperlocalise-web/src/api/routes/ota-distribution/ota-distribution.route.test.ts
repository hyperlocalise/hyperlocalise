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

import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { app } from "@/api/app";
import type { WorkosAuthIdentity } from "@/api/auth/workos";
import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import type { AppType } from "@/api/typed-app";
import { db, schema } from "@/lib/database/client";
import { createMemoryOtaObjectStore } from "@/lib/ota/memory-store";
import { setHostedOtaObjectStoreForTests } from "@/lib/ota/release";

const { resolveApiAuthContextFromSessionMock } = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(
    (options) =>
      globalThis.__resolveTestApiAuthContextFromSession?.(options) ??
      globalThis.__testApiAuthContext ??
      null,
  ),
}));

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return { ...actual, resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock };
});

const client = testClient<AppType>(app);
const fixture = createProjectTestFixture();
const distributionsApi =
  client.api.orgs[":organizationSlug"].projects[":projectId"]["ota-distributions"];

function param(identity: WorkosAuthIdentity, projectId: string) {
  return {
    organizationSlug: identity.organization.slug ?? "missing-slug",
    projectId,
  };
}

async function headers(identity: WorkosAuthIdentity) {
  return { headers: await fixture.authHeadersFor(identity) };
}

describe("otaDistributionRoutes", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    setHostedOtaObjectStoreForTests(null);
    vi.clearAllMocks();
    await fixture.cleanup();
  });

  it("creates, releases, and revokes a hosted distribution", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const projectResponse = await fixture.createProjectViaApi(identity);
    const projectBody = (await projectResponse.json()) as {
      project: { id: string; organizationId: string };
    };
    const projectId = projectBody.project.id;
    const organizationId = projectBody.project.organizationId;
    const auth = await headers(identity);
    const routeParam = param(identity, projectId);

    const [file] = await db
      .insert(schema.repositorySourceFiles)
      .values({
        organizationId,
        projectId,
        sourcePath: "messages.json",
      })
      .returning();
    if (!file) {
      throw new Error("expected source file");
    }
    const [key] = await db
      .insert(schema.projectTranslationKeys)
      .values({
        organizationId,
        projectId,
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
      organizationId,
      projectId,
      translationKeyId: key.id,
      targetLocale: "fr-FR",
      text: "Bonjour",
      status: "approved",
      provenance: "manual",
    });

    const created = await distributionsApi.$post(
      {
        param: routeParam,
        json: {
          name: "Web",
          fileIds: [file.id],
          locales: ["fr-FR"],
          format: "json",
        },
      },
      auth,
    );
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as {
      distribution: {
        id: string;
        publicHash: string;
        destinationName: string | null;
        manifestUrl: string | null;
      };
    };
    expect(createdBody.distribution.destinationName).toBe("Hyperlocalise CDN");
    expect(createdBody.distribution.manifestUrl).toBeNull();

    const listed = await distributionsApi.$get({ param: routeParam }, auth);
    expect(listed.status).toBe(200);
    const listBody = (await listed.json()) as { distributions: Array<{ id: string }> };
    expect(listBody.distributions).toHaveLength(1);

    const store = createMemoryOtaObjectStore();
    setHostedOtaObjectStoreForTests(store);

    const released = await distributionsApi[":distributionId"].release.$post(
      { param: { ...routeParam, distributionId: createdBody.distribution.id } },
      auth,
    );
    expect(released.status).toBe(201);
    expect(await store.get(`${createdBody.distribution.publicHash}/manifest.json`)).not.toBeNull();

    const listedAfterRelease = await distributionsApi.$get({ param: routeParam }, auth);
    const listedAfterReleaseBody = (await listedAfterRelease.json()) as {
      distributions: Array<{ manifestUrl: string | null }>;
    };
    expect(listedAfterReleaseBody.distributions[0]?.manifestUrl).toBe(
      `https://ota.test/${createdBody.distribution.publicHash}/manifest.json`,
    );

    const publicManifest = await app.request(
      `http://localhost/api/ota/${createdBody.distribution.publicHash}/manifest.json`,
    );
    expect(publicManifest.status).toBe(200);

    const revoked = await distributionsApi[":distributionId"].revoke.$post(
      { param: { ...routeParam, distributionId: createdBody.distribution.id } },
      auth,
    );
    expect(revoked.status).toBe(200);
    const missing = await app.request(
      `http://localhost/api/ota/${createdBody.distribution.publicHash}/manifest.json`,
    );
    expect(missing.status).toBe(404);
  });

  it("releases and serves from Postgres when hosted object storage is not configured", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const projectResponse = await fixture.createProjectViaApi(identity);
    const projectBody = (await projectResponse.json()) as {
      project: { id: string; organizationId: string };
    };
    const projectId = projectBody.project.id;
    const organizationId = projectBody.project.organizationId;
    const auth = await headers(identity);

    const [file] = await db
      .insert(schema.repositorySourceFiles)
      .values({
        organizationId,
        projectId,
        sourcePath: "messages.json",
      })
      .returning();
    if (!file) {
      throw new Error("expected source file");
    }

    const created = await distributionsApi.$post(
      {
        param: param(identity, projectId),
        json: {
          name: "Web",
          fileIds: [file.id],
          locales: ["fr-FR"],
          format: "json",
        },
      },
      auth,
    );
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as {
      distribution: { id: string; publicHash: string };
    };

    const released = await distributionsApi[":distributionId"].release.$post(
      {
        param: {
          ...param(identity, projectId),
          distributionId: createdBody.distribution.id,
        },
      },
      auth,
    );
    expect(released.status).toBe(201);

    const publicManifest = await app.request(
      `http://localhost/api/ota/${createdBody.distribution.publicHash}/manifest.json`,
    );
    expect(publicManifest.status).toBe(200);
    const manifest = (await publicManifest.json()) as { schema_version: number };
    expect(manifest.schema_version).toBe(1);
  });
});
