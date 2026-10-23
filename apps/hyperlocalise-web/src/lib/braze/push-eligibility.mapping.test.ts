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

import { getBrazeCampaignPushEligibility, getBrazePushEligibility } from "./push-eligibility";

const mocks = vi.hoisted(() => ({
  loadAsPrefilledEntries: vi.fn(),
}));

vi.mock("@/lib/projects/translations/project-translation-service", () => ({
  ProjectTranslationService: class {
    loadAsPrefilledEntries = mocks.loadAsPrefilledEntries;
  },
}));

function baseAutomation(): Omit<WorkspaceAutomationRecord, "toolConfig"> {
  return {
    id: "automation-1",
    organizationId: "org-1",
    authorUserId: "user-1",
    status: "active",
    name: "Braze",
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
  };
}

function templateAutomation(): WorkspaceAutomationRecord {
  return {
    ...baseAutomation(),
    toolConfig: {
      braze: {
        enabled: true,
        sourceLocale: "en",
        templateIds: [],
        contentBlockIds: [],
        existingTranslationPolicy: "seed_empty",
        overwriteWhenRemoteNewer: true,
      },
    },
  };
}

function campaignAutomation(): WorkspaceAutomationRecord {
  return {
    ...baseAutomation(),
    toolConfig: {
      brazeCampaigns: {
        enabled: true,
        sourceLocale: "en",
        campaignIds: [],
        canvasIds: [],
        existingTranslationPolicy: "seed_empty",
        overwriteWhenRemoteNewer: true,
      },
    },
  };
}

function mockSelectQueue(rowSets: unknown[][]) {
  let callIndex = 0;
  return vi.spyOn(db, "select").mockImplementation(() => {
    const rows = rowSets[callIndex++] ?? [];
    const builder = Promise.resolve(rows) as Promise<unknown[]> & {
      from: ReturnType<typeof vi.fn>;
      where: ReturnType<typeof vi.fn>;
      limit: ReturnType<typeof vi.fn>;
    };
    builder.from = vi.fn(() => builder);
    builder.where = vi.fn(() => builder);
    builder.limit = vi.fn(async () => rows);
    return builder as unknown as ReturnType<typeof db.select>;
  });
}

describe("getBrazePushEligibility mapping", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mocks.loadAsPrefilledEntries.mockReset();
  });

  it("returns null when Braze is disabled or the automation has no project", async () => {
    await expect(
      getBrazePushEligibility({
        organizationId: "org-1",
        automation: { ...baseAutomation(), toolConfig: {} },
      }),
    ).resolves.toBeNull();
    await expect(
      getBrazePushEligibility({
        organizationId: "org-1",
        automation: { ...templateAutomation(), projectId: null },
      }),
    ).resolves.toBeNull();
  });

  it("returns empty eligibility when the project row is missing", async () => {
    mockSelectQueue([[]]);

    await expect(
      getBrazePushEligibility({
        organizationId: "org-1",
        automation: templateAutomation(),
      }),
    ).resolves.toEqual({ eligibleLocaleCount: 0, mappedItemCount: 0, items: [] });
  });

  it("counts templates with any approved locale and extracts lastError", async () => {
    mockSelectQueue([
      [{ sourceLocale: "en", targetLocales: ["de", "ja"] }],
      [
        {
          sourceId: "tpl-1",
          sourcePath: "braze/templates/welcome.json",
          resourceKind: "email_template",
          status: "push_failed",
          lastPushedAt: new Date("2026-04-01T08:00:00.000Z"),
          lastError: { message: "Braze rejected the template" },
        },
      ],
    ]);
    mocks.loadAsPrefilledEntries.mockImplementation(async (request: { targetLocale: string }) =>
      request.targetLocale === "de"
        ? { translatedKeyCount: 2, loadedKeyCount: 2, prefilled: { subject: "Hallo" } }
        : { translatedKeyCount: 0, loadedKeyCount: 2, prefilled: {} },
    );

    await expect(
      getBrazePushEligibility({
        organizationId: "org-1",
        automation: templateAutomation(),
      }),
    ).resolves.toEqual({
      eligibleLocaleCount: 1,
      mappedItemCount: 1,
      items: [
        {
          sourceId: "tpl-1",
          sourcePath: "braze/templates/welcome.json",
          resourceKind: "email_template",
          status: "push_failed",
          eligibleLocaleCount: 1,
          targetLocaleCount: 2,
          eligibleLocales: ["de"],
          locales: [],
          lastPushedAt: "2026-04-01T08:00:00.000Z",
          lastError: "Braze rejected the template",
        },
      ],
    });
  });

  it("skips campaign locales without a mapped locale id", async () => {
    mockSelectQueue([
      [{ sourceLocale: "en", targetLocales: ["de", "ja"] }],
      [
        {
          sourceId: "camp-1",
          sourcePath: "braze/campaigns/welcome.json",
          resourceKind: "campaign",
          campaignId: "camp-1",
          status: "active",
          lastPushedAt: null,
          lastError: null,
          localeIds: { de: "locale-de" },
        },
      ],
    ]);
    mocks.loadAsPrefilledEntries.mockResolvedValue({
      translatedKeyCount: 1,
      loadedKeyCount: 1,
      prefilled: { subject: "Hallo" },
    });

    const eligibility = await getBrazeCampaignPushEligibility({
      organizationId: "org-1",
      automation: campaignAutomation(),
    });

    expect(eligibility).toEqual({
      eligibleLocaleCount: 1,
      mappedItemCount: 1,
      items: [
        expect.objectContaining({
          sourceId: "camp-1",
          eligibleLocales: ["de"],
          targetLocaleCount: 2,
        }),
      ],
    });
    expect(mocks.loadAsPrefilledEntries).toHaveBeenCalledTimes(1);
    expect(mocks.loadAsPrefilledEntries).toHaveBeenCalledWith(
      expect.objectContaining({ targetLocale: "de", approvedTranslationsOnly: true }),
    );
  });

  it("attaches per-locale progress for campaign items when requested", async () => {
    mockSelectQueue([
      [{ sourceLocale: "en", targetLocales: ["de"] }],
      [
        {
          sourceId: "camp-1",
          sourcePath: "braze/campaigns/welcome.json",
          resourceKind: "campaign",
          campaignId: "camp-1",
          status: "active",
          lastPushedAt: null,
          lastError: { code: 12 },
          localeIds: { de: "locale-de" },
        },
      ],
    ]);
    mocks.loadAsPrefilledEntries.mockImplementation(
      async (request: { approvedTranslationsOnly?: boolean }) =>
        request.approvedTranslationsOnly
          ? { translatedKeyCount: 1, loadedKeyCount: 2, prefilled: { subject: "Hallo" } }
          : {
              translatedKeyCount: 2,
              loadedKeyCount: 2,
              prefilled: { subject: "Hallo", body: "Welt" },
            },
    );

    await expect(
      getBrazeCampaignPushEligibility({
        organizationId: "org-1",
        automation: campaignAutomation(),
        includeLocaleProgress: true,
      }),
    ).resolves.toEqual({
      eligibleLocaleCount: 1,
      mappedItemCount: 1,
      items: [
        expect.objectContaining({
          locales: [{ locale: "de", translationProgress: 100, approvalProgress: 50 }],
          lastError: null,
        }),
      ],
    });
  });
});
