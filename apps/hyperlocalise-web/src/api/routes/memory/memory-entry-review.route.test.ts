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
import type { AppType } from "@/api/typed-app";
import { db } from "@/lib/database/client";

import { createMemoryTestFixture } from "./memory.fixture";

const client = testClient<AppType>(createApp());
const fixture = createMemoryTestFixture(client);

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.clearAllMocks();
  await fixture.cleanup();
});

describe("memory entry review", () => {
  it("summarizes draft, rejected, and same-as-source entries", async () => {
    const { identity, memory } = await fixture.createStoredMemoryFixture();
    const headers = await fixture.authHeadersFor(identity);

    await fixture.insertMemoryEntry(memory.id, {
      sourceText: "Save",
      targetText: "Guardar",
      reviewStatus: "pending",
      provenance: "file_job",
    });
    await fixture.insertMemoryEntry(memory.id, {
      sourceText: "Cancel",
      targetText: "Cancel",
      reviewStatus: "rejected",
    });
    await fixture.insertMemoryEntry(memory.id, {
      sourceText: "Done",
      targetText: "Listo",
      reviewStatus: "approved",
    });

    const response = await client.api.orgs[":organizationSlug"]["translation-memories"][
      ":memoryId"
    ].entries["review-summary"].$get(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          memoryId: memory.id,
        },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      reviewSummary: {
        pending: 1,
        rejected: 1,
        sameAsSource: 1,
      },
    });
  });

  it("approves selected draft entries", async () => {
    const { identity, memory } = await fixture.createStoredMemoryFixture();
    const headers = await fixture.authHeadersFor(identity);
    const draft = await fixture.insertMemoryEntry(memory.id, {
      sourceText: "Save",
      targetText: "Guardar",
      reviewStatus: "pending",
      provenance: "file_job",
    });

    const response = await client.api.orgs[":organizationSlug"]["translation-memories"][
      ":memoryId"
    ].entries["bulk-review"].$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          memoryId: memory.id,
        },
        json: {
          entryIds: [draft.id],
          reviewStatus: "approved",
        },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ updated: 1 });

    const detail = await client.api.orgs[":organizationSlug"]["translation-memories"][":memoryId"]
      .entries[":entryId"].$get(
        {
          param: {
            organizationSlug: identity.organization.slug ?? "missing-slug",
            memoryId: memory.id,
            entryId: draft.id,
          },
        },
        { headers },
      );
    expect(detail.status).toBe(200);
    const body = (await detail.json()) as { memoryEntry: { reviewStatus: string } };
    expect(body.memoryEntry.reviewStatus).toBe("approved");
  });

  it("deletes selected entries in bulk", async () => {
    const { identity, memory } = await fixture.createStoredMemoryFixture();
    const headers = await fixture.authHeadersFor(identity);
    const draft = await fixture.insertMemoryEntry(memory.id, {
      sourceText: "Delete me",
      targetText: "Eliminar",
      reviewStatus: "rejected",
    });

    const response = await client.api.orgs[":organizationSlug"]["translation-memories"][
      ":memoryId"
    ].entries["bulk-delete"].$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          memoryId: memory.id,
        },
        json: {
          entryIds: [draft.id],
        },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ deleted: 1 });

    const detail = await client.api.orgs[":organizationSlug"]["translation-memories"][":memoryId"]
      .entries[":entryId"].$get(
        {
          param: {
            organizationSlug: identity.organization.slug ?? "missing-slug",
            memoryId: memory.id,
            entryId: draft.id,
          },
        },
        { headers },
      );
    expect(detail.status).toBe(404);
  });
});
