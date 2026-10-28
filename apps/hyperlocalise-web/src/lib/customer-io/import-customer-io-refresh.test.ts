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
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { WorkspaceAutomationRecord } from "@/lib/agents/workspace-automation-types";
import { db } from "@/lib/database/client";

import { runImportCustomerIoCampaigns } from "./import-customer-io-campaigns";
import { hashCustomerIoTranslationMap } from "./translation-map";

const mocks = vi.hoisted(() => ({
  getLatestRepositorySourceFileVersion: vi.fn(),
  getRepositorySourceFileByPath: vi.fn(),
  listKeysForFile: vi.fn(),
  getTranslationsByKeyIds: vi.fn(),
  importApprovedTranslationsFromEntries: vi.fn(),
}));

vi.mock("@/lib/file-storage/records", () => ({
  getLatestRepositorySourceFileVersion: mocks.getLatestRepositorySourceFileVersion,
  getStoredFileContent: vi.fn(),
}));

vi.mock("@/lib/projects/translations/project-translation-service", () => ({
  ProjectTranslationService: class {
    getRepositorySourceFileByPath = mocks.getRepositorySourceFileByPath;
    listKeysForFile = mocks.listKeysForFile;
    getTranslationsByKeyIds = mocks.getTranslationsByKeyIds;
    importApprovedTranslationsFromEntries = mocks.importApprovedTranslationsFromEntries;
  },
  importApprovedProjectTranslationsFromEntries: (...args: unknown[]) =>
    mocks.importApprovedTranslationsFromEntries(...args),
}));

vi.mock("./credentials", () => ({
  loadCustomerIoAutomationClient: vi.fn(async () => ({
    ok: true,
    value: { apiKey: "key", region: "us" },
  })),
}));

function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function automation(policy: "seed_empty" | "refresh_imported"): WorkspaceAutomationRecord {
  return {
    id: "automation-1",
    organizationId: "org-1",
    authorUserId: "user-1",
    status: "active",
    name: "Customer.io",
    instructions: "",
    projectId: "project-1",
    triggerConfig: {
      mode: "scheduled",
      schedule: { cadence: "daily", hourUtc: 9, timezone: "UTC" },
    },
    repositoryTarget: { kind: "none" },
    model: "openai/gpt-6-luna",
    configVersion: 1,
    nextRunAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    toolConfig: {
      customerIo: {
        enabled: true,
        broadcastIds: ["2"],
        campaignIds: [],
        newsletterIds: [],
        transactionalMessageIds: [],
        broadcastActions: {},
        campaignActions: {},
        newsletterActions: {},
        transactionalMessageActions: {},
        existingTranslationPolicy: policy,
        overwriteWhenRemoteNewer: true,
      },
    },
  };
}

const SOURCE_MAP = { title: "Hi", body: "Hello" };
const REMOTE_MAP = { title: "Salut", body: "Bonjour" };

function setup(stored: { title: string; body: string }): void {
  // Project row for locale mapping; open-jobs query awaits the builder directly.
  vi.spyOn(db, "select").mockImplementation((() => {
    const builder = Promise.resolve([] as unknown[]) as Promise<unknown[]> & {
      from: () => unknown;
      where: () => unknown;
      limit: () => Promise<unknown[]>;
    };
    builder.from = () => builder;
    builder.where = () => builder;
    builder.limit = async () => [{ sourceLocale: "en", targetLocales: ["fr"] }];
    return builder;
  }) as unknown as typeof db.select);

  mocks.getLatestRepositorySourceFileVersion.mockResolvedValue({
    id: "version-1",
    storedFileId: "file-1",
    sourceHash: hashCustomerIoTranslationMap(SOURCE_MAP),
    ingestState: "ingested",
  });
  mocks.getRepositorySourceFileByPath.mockResolvedValue({ id: "file-1" });
  mocks.listKeysForFile.mockResolvedValue([
    { id: "key-title", key: "title", isHidden: false },
    { id: "key-body", key: "body", isHidden: false },
  ]);
  mocks.getTranslationsByKeyIds.mockResolvedValue([
    { translationKeyId: "key-title", text: stored.title, provenance: "import" },
    { translationKeyId: "key-body", text: stored.body, provenance: "import" },
  ]);
  mocks.importApprovedTranslationsFromEntries.mockResolvedValue({
    matched: 2,
    imported: 2,
    skipped: 0,
  });

  const fetchImpl = vi.fn<typeof fetch>(async (url) => {
    const href = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
    if (href.endsWith("/broadcasts?limit=100")) {
      return jsonResponse({ broadcasts: [{ id: 2, name: "Launch", updated_at: 1552341937 }] });
    }
    if (href.endsWith("/campaigns?limit=100")) {
      return jsonResponse({ campaigns: [] });
    }
    if (href.endsWith("/newsletters?limit=100")) {
      return jsonResponse({ newsletters: [] });
    }
    if (href.endsWith("/transactional?limit=100")) {
      return jsonResponse({ messages: [] });
    }
    if (href.endsWith("/broadcasts/2/actions")) {
      return jsonResponse({
        actions: [{ id: 96, type: "push", language: "", ...SOURCE_MAP }],
      });
    }
    if (href.endsWith("/broadcasts/2/actions/96/language/fr")) {
      return jsonResponse({ language: "fr", ...REMOTE_MAP });
    }
    throw new Error(`unexpected Customer.io request: ${href}`);
  });
  vi.stubGlobal("fetch", fetchImpl);
}

describe("runImportCustomerIoCampaigns refresh policy", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    mocks.getLatestRepositorySourceFileVersion.mockReset();
    mocks.getRepositorySourceFileByPath.mockReset();
    mocks.listKeysForFile.mockReset();
    mocks.getTranslationsByKeyIds.mockReset();
    mocks.importApprovedTranslationsFromEntries.mockReset();
  });

  it("re-imports a changed import-provenance locale under refresh_imported", async () => {
    setup({ title: "Vieux", body: "Ancien" });

    const result = await runImportCustomerIoCampaigns({
      organizationId: "org-1",
      automation: automation("refresh_imported"),
    });

    expect(result.failed).toBe(0);
    expect(mocks.importApprovedTranslationsFromEntries).toHaveBeenCalledTimes(1);
    expect(mocks.importApprovedTranslationsFromEntries).toHaveBeenCalledWith(
      expect.objectContaining({ targetLocale: "fr", entries: REMOTE_MAP }),
    );
  });

  it("skips an unchanged import-provenance locale under refresh_imported", async () => {
    setup({ title: "Salut", body: "Bonjour" });

    const result = await runImportCustomerIoCampaigns({
      organizationId: "org-1",
      automation: automation("refresh_imported"),
    });

    expect(result.failed).toBe(0);
    expect(mocks.importApprovedTranslationsFromEntries).not.toHaveBeenCalled();
  });

  it("keeps skipping existing translations under seed_empty", async () => {
    setup({ title: "Vieux", body: "Ancien" });

    const result = await runImportCustomerIoCampaigns({
      organizationId: "org-1",
      automation: automation("seed_empty"),
    });

    expect(result.failed).toBe(0);
    expect(mocks.importApprovedTranslationsFromEntries).not.toHaveBeenCalled();
  });
});
