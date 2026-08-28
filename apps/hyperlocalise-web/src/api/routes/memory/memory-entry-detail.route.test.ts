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
import type {
  MemoryEntryDetailResponse,
  MemoryEntryResponse,
} from "@/api/routes/memory/memory.schema";
import { db, schema } from "@/lib/database/client";

import { createMemoryTestFixture } from "./memory.fixture";

const client = testClient(createApp());
const fixture = createMemoryTestFixture(client);

async function readDetail(response: Response): Promise<MemoryEntryDetailResponse> {
  return (await response.json()) as MemoryEntryDetailResponse;
}

async function readCreatedEntry(response: Response): Promise<MemoryEntryResponse> {
  return (await response.json()) as MemoryEntryResponse;
}

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.clearAllMocks();
  await fixture.cleanup();
});

describe("memory entry detail", () => {
  it("round-trips native entry fields including provenance, review state, and metadata", async () => {
    const { identity, memory, user } = await fixture.createStoredMemoryFixture();
    const headers = await fixture.authHeadersFor(identity);
    const importBatchId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const entry = await fixture.insertMemoryEntry(memory.id, {
      sourceText: "Save changes",
      targetText: "Guardar cambios",
      sourceLocale: "en-US",
      targetLocale: "es-ES",
      provenance: "import",
      reviewStatus: "pending",
      createdByUserId: user.id,
      importBatchId,
      metadata: { context: "checkout button", provider: "crowdin", segmentKey: "save_changes" },
    });

    const response = await client.api.orgs[":organizationSlug"]["translation-memories"][
      ":memoryId"
    ].entries[":entryId"].$get(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          memoryId: memory.id,
          entryId: entry.id,
        },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    const body = await readDetail(response);
    expect(body.memoryEntry).toMatchObject({
      id: entry.id,
      sourceText: "Save changes",
      targetText: "Guardar cambios",
      sourceLocale: "en-US",
      targetLocale: "es-ES",
      provenance: "import",
      reviewStatus: "pending",
      version: 1,
      createdByUserId: user.id,
      importBatchId,
      metadata: {
        context: "checkout button",
        provider: "crowdin",
        segmentKey: "save_changes",
      },
    });
    expect(body.provenance).toMatchObject({
      origin: "import",
      provider: "crowdin",
      importBatchId,
      context: "checkout button",
      created: { userId: user.id, source: "created" },
      modified: { source: "modified" },
      reviewed: { source: "reviewed", userId: null, at: null },
      imported: { userId: user.id, source: "imported" },
      providerSupplied: { displayName: "crowdin", source: "provider" },
    });
    expect(body.capabilities).toEqual({ canEdit: true, readOnlyReason: null });
  });

  it("keeps missing optional provenance fields null", async () => {
    const { identity, memory } = await fixture.createStoredMemoryFixture();
    const headers = await fixture.authHeadersFor(identity);
    const entry = await fixture.insertMemoryEntry(memory.id, {
      sourceText: "Cancel",
      targetText: "Annuler",
    });

    const response = await client.api.orgs[":organizationSlug"]["translation-memories"][
      ":memoryId"
    ].entries[":entryId"].$get(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          memoryId: memory.id,
          entryId: entry.id,
        },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    const body = await readDetail(response);
    expect(body.provenance.created.userId).toBeNull();
    expect(body.provenance.reviewed.at).toBeNull();
    expect(body.provenance.imported.at).toBeNull();
    expect(body.provenance.provider).toBeNull();
    expect(body.provenance.importBatchId).toBeNull();
    expect(body.memoryEntry.reviewedByUserId).toBeNull();
    expect(body.memoryEntry.modifiedByUserId).toBeNull();
  });

  it("links related variants that share source text or a variant group", async () => {
    const { identity, memory } = await fixture.createStoredMemoryFixture();
    const headers = await fixture.authHeadersFor(identity);
    const primary = await fixture.insertMemoryEntry(memory.id, {
      sourceText: "Save",
      targetText: "Guardar",
      sourceLocale: "en",
      targetLocale: "es",
      metadata: { variantGroupId: "save-cta", context: "button" },
    });
    const localeVariant = await fixture.insertMemoryEntry(memory.id, {
      sourceText: "Save",
      targetText: "Enregistrer",
      sourceLocale: "en",
      targetLocale: "fr",
      metadata: { context: "button" },
    });
    const grouped = await fixture.insertMemoryEntry(memory.id, {
      sourceText: "Save now",
      targetText: "Jetzt speichern",
      sourceLocale: "en",
      targetLocale: "de",
      metadata: { variantGroupId: "save-cta" },
    });

    const response = await client.api.orgs[":organizationSlug"]["translation-memories"][
      ":memoryId"
    ].entries[":entryId"].$get(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          memoryId: memory.id,
          entryId: primary.id,
        },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    const body = await readDetail(response);
    const variantIds = body.variants.map((variant) => variant.id).toSorted();
    expect(variantIds).toEqual([grouped.id, localeVariant.id].toSorted());
  });

  it("returns ordered attributable audit events without raw content attributes", async () => {
    const { identity, memory } = await fixture.createStoredMemoryFixture();
    const headers = await fixture.authHeadersFor(identity);
    const created = await client.api.orgs[":organizationSlug"]["translation-memories"][
      ":memoryId"
    ].entries.$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          memoryId: memory.id,
        },
        json: {
          sourceLocale: "en",
          targetLocale: "es",
          sourceText: "Private source",
          targetText: "Texto privado",
          matchScore: 100,
        },
      },
      { headers },
    );
    expect(created.status).toBe(201);
    const createdBody = await readCreatedEntry(created);

    const updated = await client.api.orgs[":organizationSlug"]["translation-memories"][
      ":memoryId"
    ].entries[":entryId"].$patch(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          memoryId: memory.id,
          entryId: createdBody.memoryEntry.id,
        },
        json: {
          expectedVersion: createdBody.memoryEntry.version,
          targetText: "Texto actualizado",
          reviewStatus: "pending",
        },
      },
      { headers },
    );
    expect(updated.status).toBe(200);
    const detail = await readDetail(updated);

    expect(detail.auditEvents.map((event) => event.eventType)).toEqual([
      "created",
      "updated",
      "reviewed",
    ]);
    expect(detail.auditEvents[0].occurredAt <= detail.auditEvents[1].occurredAt).toBe(true);
    expect(detail.auditEvents[1].occurredAt <= detail.auditEvents[2].occurredAt).toBe(true);
    for (const event of detail.auditEvents) {
      expect(event.attributes).not.toHaveProperty("sourceText");
      expect(event.attributes).not.toHaveProperty("targetText");
      expect(JSON.stringify(event)).not.toContain("Private source");
    }
  });

  it("preserves a creation event after the first edit of a pre-migration entry", async () => {
    const { identity, memory } = await fixture.createStoredMemoryFixture();
    const headers = await fixture.authHeadersFor(identity);
    const entry = await fixture.insertMemoryEntry(memory.id, {
      sourceText: "Legacy source",
      targetText: "Legacy target",
      provenance: "import",
    });

    const updated = await client.api.orgs[":organizationSlug"]["translation-memories"][
      ":memoryId"
    ].entries[":entryId"].$patch(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          memoryId: memory.id,
          entryId: entry.id,
        },
        json: {
          expectedVersion: 1,
          targetText: "Updated target",
        },
      },
      { headers },
    );
    expect(updated.status).toBe(200);
    const detail = await readDetail(updated);
    expect(detail.auditEvents.map((event) => event.eventType)).toEqual(["imported", "updated"]);
  });

  it("rejects a stale edit without overwriting the newer change", async () => {
    const { identity, memory } = await fixture.createStoredMemoryFixture();
    const headers = await fixture.authHeadersFor(identity);
    const created = await client.api.orgs[":organizationSlug"]["translation-memories"][
      ":memoryId"
    ].entries.$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          memoryId: memory.id,
        },
        json: {
          sourceLocale: "en",
          targetLocale: "es",
          sourceText: "Original",
          targetText: "Original",
          matchScore: 100,
        },
      },
      { headers },
    );
    const createdBody = await readCreatedEntry(created);

    const first = await client.api.orgs[":organizationSlug"]["translation-memories"][
      ":memoryId"
    ].entries[":entryId"].$patch(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          memoryId: memory.id,
          entryId: createdBody.memoryEntry.id,
        },
        json: {
          expectedVersion: createdBody.memoryEntry.version,
          targetText: "First writer",
        },
      },
      { headers },
    );
    expect(first.status).toBe(200);

    const stale = await client.api.orgs[":organizationSlug"]["translation-memories"][
      ":memoryId"
    ].entries[":entryId"].$patch(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          memoryId: memory.id,
          entryId: createdBody.memoryEntry.id,
        },
        json: {
          expectedVersion: createdBody.memoryEntry.version,
          targetText: "Stale writer",
        },
      },
      { headers },
    );

    expect(stale.status).toBe(409);
    await expect(stale.json()).resolves.toMatchObject({
      error: "stale_memory_entry",
      details: {
        memoryEntry: {
          id: createdBody.memoryEntry.id,
          targetText: "First writer",
          version: 2,
        },
      },
    });

    const latest = await client.api.orgs[":organizationSlug"]["translation-memories"][
      ":memoryId"
    ].entries[":entryId"].$get(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          memoryId: memory.id,
          entryId: createdBody.memoryEntry.id,
        },
      },
      { headers },
    );
    const latestBody = await readDetail(latest);
    expect(latestBody.memoryEntry.targetText).toBe("First writer");
    expect(latestBody.memoryEntry.version).toBe(2);
  });

  it("rejects edits to a provider-backed read-only entry", async () => {
    const { identity, organization, user } = await fixture.createStoredMemoryFixture();
    const headers = await fixture.authHeadersFor(identity);
    const [memory] = await db
      .insert(schema.memories)
      .values({
        organizationId: organization.id,
        createdByUserId: user.id,
        name: "Crowdin TM",
        source: "external_tms",
        externalProviderKind: "crowdin",
        capabilityMode: "synced_import",
        externalMemoryId: "ext-tm-1",
      })
      .returning();
    const entry = await fixture.insertMemoryEntry(memory.id, {
      sourceText: "Provider source",
      targetText: "Provider target",
      provenance: "sync",
      metadata: { provider: "crowdin" },
    });

    const getResponse = await client.api.orgs[":organizationSlug"]["translation-memories"][
      ":memoryId"
    ].entries[":entryId"].$get(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          memoryId: memory.id,
          entryId: entry.id,
        },
      },
      { headers },
    );
    expect(getResponse.status).toBe(200);
    await expect(getResponse.json()).resolves.toMatchObject({
      capabilities: { canEdit: false, readOnlyReason: "external_tms" },
      provenance: { origin: "sync", provider: "crowdin" },
    });

    const patchResponse = await client.api.orgs[":organizationSlug"]["translation-memories"][
      ":memoryId"
    ].entries[":entryId"].$patch(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          memoryId: memory.id,
          entryId: entry.id,
        },
        json: {
          expectedVersion: 1,
          targetText: "Should not save",
        },
      },
      { headers },
    );
    expect(patchResponse.status).toBe(403);
    await expect(patchResponse.json()).resolves.toMatchObject({
      error: "external_tms_memory_immutable",
    });
  });

  it("rejects edits to a reference-only memory entry", async () => {
    const { identity, organization, user } = await fixture.createStoredMemoryFixture();
    const headers = await fixture.authHeadersFor(identity);
    const [memory] = await db
      .insert(schema.memories)
      .values({
        organizationId: organization.id,
        createdByUserId: user.id,
        name: "Reference TM",
        source: "native",
        capabilityMode: "reference_only",
      })
      .returning();
    const entry = await fixture.insertMemoryEntry(memory.id, {
      sourceText: "Reference source",
      targetText: "Reference target",
    });

    const patchResponse = await client.api.orgs[":organizationSlug"]["translation-memories"][
      ":memoryId"
    ].entries[":entryId"].$patch(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          memoryId: memory.id,
          entryId: entry.id,
        },
        json: {
          expectedVersion: 1,
          targetText: "Should not save",
        },
      },
      { headers },
    );

    expect(patchResponse.status).toBe(403);
    await expect(patchResponse.json()).resolves.toMatchObject({
      error: "memory_entry_read_only",
    });
  });
});
