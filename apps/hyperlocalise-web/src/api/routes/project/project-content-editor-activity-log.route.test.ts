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

import { randomUUID } from "node:crypto";

import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { app } from "@/api/app";
import type { AppType } from "@/api/typed-app";
import { db, schema } from "@/lib/database/client";
import { fileActivityTargetId, segmentActivityTargetId } from "@/lib/activity-log/activity-log-ids";

import { createProjectTestFixture } from "./project.fixture";

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
  return {
    ...actual,
    resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
  };
});

const client = testClient<AppType>(app);
const projectFixture = createProjectTestFixture(client);

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await projectFixture.cleanup();
});

describe("project file content editor activity logs", () => {
  it("lists file and segment events for the requested source path", async () => {
    const { identity, project, organization } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const sourcePath = "locales/en.json";
    const otherPath = "locales/other.json";
    const stringId = randomUUID();

    await db.insert(schema.organizationActivityEvents).values([
      {
        organizationId: organization.id,
        actorKind: "user",
        actorUserId: identity.user.localUserId,
        eventType: "file_uploaded",
        targetKind: "file",
        targetId: fileActivityTargetId(project.id, sourcePath),
        payload: {
          name: "en.json",
          projectId: project.id,
          sourcePath,
        },
      },
      {
        organizationId: organization.id,
        actorKind: "user",
        actorUserId: identity.user.localUserId,
        eventType: "segment_approved",
        targetKind: "segment",
        targetId: segmentActivityTargetId(project.id, stringId),
        payload: {
          externalStringId: stringId,
          name: "home.title",
          projectId: project.id,
          sourcePath,
          targetLocale: "fr-FR",
        },
      },
      {
        organizationId: organization.id,
        actorKind: "user",
        actorUserId: identity.user.localUserId,
        eventType: "file_uploaded",
        targetKind: "file",
        targetId: fileActivityTargetId(project.id, otherPath),
        payload: {
          name: "other.json",
          projectId: project.id,
          sourcePath: otherPath,
        },
      },
    ]);

    const response = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat["activity-logs"].$get(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
        },
        query: { sourcePath, limit: "50" },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      activityLogs: Array<{
        eventType: string;
        target: { displayName: string | null; kind: string };
      }>;
    };
    expect(body.activityLogs.map((item) => item.eventType)).toEqual([
      "segment_approved",
      "file_uploaded",
    ]);
    expect(body.activityLogs[0]?.target.displayName).toBe("home.title");
    expect(body.activityLogs[1]?.target.displayName).toBe("en.json");
  });

  it("returns project_not_found for a missing project", async () => {
    const { identity } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);

    const response = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat["activity-logs"].$get(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: "project_missing",
        },
        query: { sourcePath: "locales/en.json" },
      },
      { headers },
    );

    expect(response.status).toBe(404);
  });
});
