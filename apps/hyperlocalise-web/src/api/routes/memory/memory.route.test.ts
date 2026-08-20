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

import { createApp } from "@/api/app";
import { PRODUCT_USAGE_ANALYTICS_EVENTS } from "@/lib/analytics/events";
import { serverAnalytics } from "@/lib/analytics/server";
import { db } from "@/lib/database";

import { createMemoryTestFixture } from "./memory.fixture";

const client = testClient(createApp());
const fixture = createMemoryTestFixture(client);

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.clearAllMocks();
  await fixture.cleanup();
});

describe("memoryRoutes", () => {
  it("denies memory mutations for roles without memories:write", async () => {
    const deniedRoles = ["member", "developer", "translator", "reviewer"] as const;

    for (const role of deniedRoles) {
      const identity = fixture.createWorkosIdentityWithRole(role);
      const headers = await fixture.authHeadersFor(identity);

      const createResponse = await client.api.orgs[":organizationSlug"][
        "translation-memories"
      ].$post(
        {
          param: { organizationSlug: identity.organization.slug ?? "missing-slug" },
          json: {
            name: "Unauthorized TM",
            description: "Should be forbidden",
          },
        },
        { headers },
      );

      expect(createResponse.status).toBe(403);
      await expect(createResponse.json()).resolves.toMatchObject({
        error: "forbidden",
      });
    }

    const { identity: adminIdentity, memory } = await fixture.createStoredMemoryFixture();
    const member = fixture.createWorkosIdentityForOrganization(
      adminIdentity.organization,
      "member",
    );
    const memberHeaders = await fixture.authHeadersFor(member);
    const organizationSlug = adminIdentity.organization.slug ?? "missing-slug";

    const entryResponse = await client.api.orgs[":organizationSlug"]["translation-memories"][
      ":memoryId"
    ].entries.$post(
      {
        param: {
          organizationSlug,
          memoryId: memory.id,
        },
        json: {
          sourceLocale: "en",
          targetLocale: "es",
          sourceText: "Save",
          targetText: "Guardar",
          matchScore: 100,
        },
      },
      { headers: memberHeaders },
    );
    expect(entryResponse.status).toBe(403);
    await expect(entryResponse.json()).resolves.toMatchObject({
      error: "forbidden",
    });

    const deleteResponse = await client.api.orgs[":organizationSlug"]["translation-memories"][
      ":memoryId"
    ].$delete(
      {
        param: {
          organizationSlug,
          memoryId: memory.id,
        },
      },
      { headers: memberHeaders },
    );
    expect(deleteResponse.status).toBe(403);
    await expect(deleteResponse.json()).resolves.toMatchObject({
      error: "forbidden",
    });
  });

  it("imports CSV memory entries with quoted multiline cells and clamps match scores", async () => {
    const { identity, memory } = await fixture.createStoredMemoryFixture();
    const headers = await fixture.authHeadersFor(identity);

    const response = await client.api.orgs[":organizationSlug"]["translation-memories"][
      ":memoryId"
    ].entries.import.$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          memoryId: memory.id,
        },
        json: {
          format: "csv",
          content: [
            "sourceLocale,targetLocale,sourceText,targetText,score",
            'en,es,"Tap, hold","Mantener\npulsado",150',
            'en,fr,"Line one\nline two","Ligne ""citee""",-15',
          ].join("\r\n"),
        },
      },
      { headers },
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      imported: number;
      skipped: number;
      memoryEntries: Array<{
        sourceLocale: string;
        targetLocale: string;
        sourceText: string;
        targetText: string;
        matchScore: number;
      }>;
    };
    expect(body).toMatchObject({
      imported: 2,
      skipped: 0,
    });
    expect(body.memoryEntries).toEqual([
      expect.objectContaining({
        sourceLocale: "en",
        targetLocale: "es",
        sourceText: "Tap, hold",
        targetText: "Mantener\npulsado",
        matchScore: 100,
      }),
      expect.objectContaining({
        sourceLocale: "en",
        targetLocale: "fr",
        sourceText: "Line one\nline two",
        targetText: 'Ligne "citee"',
        matchScore: 0,
      }),
    ]);
  });

  it("emits product usage analytics when creating a translation memory", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const trackSpy = vi.spyOn(serverAnalytics, "track").mockImplementation(() => {});

    const response = await fixture.createMemoryViaApi(identity);
    expect(response.status).toBe(201);
    expect(trackSpy).toHaveBeenCalledWith(PRODUCT_USAGE_ANALYTICS_EVENTS.memoryCreated, {
      status: "created",
      source: "memory",
    });
    trackSpy.mockRestore();
  });
});
