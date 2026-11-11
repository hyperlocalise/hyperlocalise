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
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { WorkspaceAutomationRecord } from "@/lib/agents/workspace-automation-types";
import { db } from "@/lib/database/client";

import { getIterablePushEligibility } from "./push-eligibility";

const mocks = vi.hoisted(() => ({
  loadAsPrefilledEntries: vi.fn(),
}));

vi.mock("@/lib/projects/translations/project-translation-service", () => ({
  ProjectTranslationService: class {
    loadAsPrefilledEntries = mocks.loadAsPrefilledEntries;
  },
}));

function iterableConfig(
  overrides: Partial<NonNullable<WorkspaceAutomationRecord["toolConfig"]["iterable"]>> = {},
) {
  return {
    enabled: true,
    sourceLocale: "en",
    templateIds: ["tmpl-1"],
    snippetIds: [],
    existingTranslationPolicy: "seed_empty" as const,
    ...overrides,
  };
}

function automation(
  overrides: Partial<WorkspaceAutomationRecord> & {
    toolConfig?: WorkspaceAutomationRecord["toolConfig"];
  } = {},
): WorkspaceAutomationRecord {
  return {
    id: "automation-1",
    organizationId: "org-1",
    authorUserId: "user-1",
    status: "active",
    name: "Iterable templates",
    instructions: "",
    projectId: "project-1",
    triggerConfig: {
      mode: "scheduled",
      schedule: { cadence: "daily", hourUtc: 9, timezone: "UTC" },
    },
    repositoryTarget: { kind: "none" },
    toolConfig: overrides.toolConfig ?? { iterable: iterableConfig() },
    model: "openai/gpt-6-luna",
    configVersion: 1,
    nextRunAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
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

function approvedLoad() {
  mocks.loadAsPrefilledEntries.mockImplementation(
    async (request: { targetLocale: string; approvedTranslationsOnly?: boolean }) => {
      if (request.targetLocale !== "vi-VN") {
        return { translatedKeyCount: 0, loadedKeyCount: 2, prefilled: {} };
      }
      if (request.approvedTranslationsOnly) {
        return {
          translatedKeyCount: 1,
          loadedKeyCount: 2,
          prefilled: { hello: "xin chào" },
        };
      }
      return {
        translatedKeyCount: 2,
        loadedKeyCount: 2,
        prefilled: { hello: "xin chào", bye: "tạm biệt" },
      };
    },
  );
}

describe("getIterablePushEligibility mapping", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mocks.loadAsPrefilledEntries.mockReset();
  });

  beforeEach(() => {
    approvedLoad();
  });

  it("returns null when Iterable is disabled or the automation has no project", async () => {
    await expect(
      getIterablePushEligibility({
        organizationId: "org-1",
        automation: automation({ toolConfig: { iterable: iterableConfig({ enabled: false }) } }),
      }),
    ).resolves.toBeNull();
    await expect(
      getIterablePushEligibility({
        organizationId: "org-1",
        automation: automation({ projectId: "   " }),
      }),
    ).resolves.toBeNull();
    expect(mocks.loadAsPrefilledEntries).not.toHaveBeenCalled();
  });

  it("returns empty eligibility when the project is missing from the database", async () => {
    const selectSpy = mockSelectQueue([[]]);

    await expect(
      getIterablePushEligibility({
        organizationId: "org-1",
        automation: automation(),
      }),
    ).resolves.toEqual({ eligibleLocaleCount: 0, mappedItemCount: 0, items: [] });
    expect(selectSpy).toHaveBeenCalledTimes(1);
    expect(mocks.loadAsPrefilledEntries).not.toHaveBeenCalled();
  });

  it("drops the source locale and duplicate targets before checking approval", async () => {
    mockSelectQueue([
      [{ sourceLocale: "en", targetLocales: ["en", "EN", "vi-VN", "vi-vn", "  "] }],
      [
        {
          sourceId: "tmpl-1",
          sourcePath: "iterable/templates/email/welcome.html",
          resourceKind: "email",
          sourceName: "Welcome",
          status: "active",
          lastPushedAt: null,
          lastError: null,
        },
      ],
    ]);

    await expect(
      getIterablePushEligibility({
        organizationId: "org-1",
        automation: automation(),
      }),
    ).resolves.toEqual({
      eligibleLocaleCount: 1,
      mappedItemCount: 1,
      items: [expect.objectContaining({ eligibleLocales: ["vi-VN"], targetLocaleCount: 1 })],
    });
    expect(mocks.loadAsPrefilledEntries).toHaveBeenCalledTimes(1);
    expect(mocks.loadAsPrefilledEntries).toHaveBeenCalledWith(
      expect.objectContaining({ targetLocale: "vi-VN" }),
    );
  });

  it("counts templates with any approved locale and extracts lastError", async () => {
    mockSelectQueue([
      [{ sourceLocale: "en", targetLocales: ["vi-VN", "ja-JP"] }],
      [
        {
          sourceId: "tmpl-1",
          sourcePath: "iterable/templates/email/welcome.html",
          resourceKind: "email",
          sourceName: "Welcome",
          status: "push_failed",
          lastPushedAt: new Date("2026-05-01T12:00:00.000Z"),
          lastError: { message: "Iterable rejected the copy" },
        },
        {
          sourceId: "tmpl-empty",
          sourcePath: "iterable/templates/email/empty.html",
          resourceKind: "email",
          sourceName: "",
          status: "active",
          lastPushedAt: null,
          lastError: { code: "ignored" },
        },
        {
          sourceId: "snippet-out",
          sourcePath: "iterable/snippets/footer.html",
          resourceKind: "snippet",
          sourceName: "Footer",
          status: "active",
          lastPushedAt: null,
          lastError: null,
        },
      ],
    ]);
    mocks.loadAsPrefilledEntries.mockImplementation(
      async (request: { sourcePath: string; targetLocale: string }) => {
        if (
          request.sourcePath === "iterable/templates/email/welcome.html" &&
          request.targetLocale === "vi-VN"
        ) {
          return {
            translatedKeyCount: 1,
            loadedKeyCount: 1,
            prefilled: { hello: "xin chào" },
          };
        }
        return { translatedKeyCount: 0, loadedKeyCount: 1, prefilled: {} };
      },
    );

    await expect(
      getIterablePushEligibility({
        organizationId: "org-1",
        automation: automation({
          toolConfig: {
            iterable: iterableConfig({
              templateIds: ["tmpl-1", "tmpl-empty"],
              snippetIds: ["never"],
            }),
          },
        }),
      }),
    ).resolves.toEqual({
      eligibleLocaleCount: 1,
      mappedItemCount: 1,
      items: [
        {
          sourceId: "tmpl-1",
          sourcePath: "iterable/templates/email/welcome.html",
          resourceKind: "email",
          name: "Welcome",
          status: "push_failed",
          eligibleLocaleCount: 1,
          targetLocaleCount: 2,
          eligibleLocales: ["vi-VN"],
          locales: [],
          lastPushedAt: "2026-05-01T12:00:00.000Z",
          lastError: "Iterable rejected the copy",
        },
        {
          sourceId: "tmpl-empty",
          sourcePath: "iterable/templates/email/empty.html",
          resourceKind: "email",
          name: "",
          status: "active",
          eligibleLocaleCount: 0,
          targetLocaleCount: 2,
          eligibleLocales: [],
          locales: [],
          lastPushedAt: null,
          lastError: null,
        },
      ],
    });
  });

  it("attaches per-locale progress when includeLocaleProgress is true", async () => {
    mockSelectQueue([
      [{ sourceLocale: "en", targetLocales: ["vi-VN", "ja-JP"] }],
      [
        {
          sourceId: "tmpl-1",
          sourcePath: "iterable/templates/email/welcome.html",
          resourceKind: "email",
          sourceName: "Welcome",
          status: "active",
          lastPushedAt: null,
          lastError: null,
        },
      ],
    ]);
    approvedLoad();

    await expect(
      getIterablePushEligibility({
        organizationId: "org-1",
        automation: automation(),
        includeLocaleProgress: true,
      }),
    ).resolves.toEqual({
      eligibleLocaleCount: 1,
      mappedItemCount: 1,
      items: [
        expect.objectContaining({
          sourceId: "tmpl-1",
          eligibleLocales: ["vi-VN"],
          locales: [
            { locale: "vi-VN", translationProgress: 100, approvalProgress: 50 },
            { locale: "ja-JP", translationProgress: 0, approvalProgress: 0 },
          ],
          lastError: null,
        }),
      ],
    });
  });
});
