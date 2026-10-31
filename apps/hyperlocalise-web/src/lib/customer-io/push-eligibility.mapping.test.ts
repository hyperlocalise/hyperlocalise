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

import type { CustomerIoAction } from "./client";
import type { CustomerIoImportResource } from "./import-customer-io-campaigns";
import { getCustomerIoPushEligibility } from "./push-eligibility";

const mocks = vi.hoisted(() => ({
  loadAsPrefilledEntries: vi.fn(),
  loadCustomerIoAutomationClient: vi.fn(),
  resolveCustomerIoImportResources: vi.fn(),
  listCustomerIoResourceActions: vi.fn(),
}));

vi.mock("@/lib/projects/translations/project-translation-service", () => ({
  ProjectTranslationService: class {
    loadAsPrefilledEntries = mocks.loadAsPrefilledEntries;
  },
}));

vi.mock("./credentials", () => ({
  loadCustomerIoAutomationClient: (...args: unknown[]) =>
    mocks.loadCustomerIoAutomationClient(...args),
}));

vi.mock("./import-customer-io-campaigns", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./import-customer-io-campaigns")>();
  return {
    ...actual,
    resolveCustomerIoImportResources: (...args: unknown[]) =>
      mocks.resolveCustomerIoImportResources(...args),
  };
});

vi.mock("./push-customer-io-campaigns", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./push-customer-io-campaigns")>();
  return {
    ...actual,
    listCustomerIoResourceActions: (...args: unknown[]) =>
      mocks.listCustomerIoResourceActions(...args),
  };
});

function customerIoConfig(
  overrides: Partial<NonNullable<WorkspaceAutomationRecord["toolConfig"]["customerIo"]>> = {},
) {
  return {
    enabled: true,
    workosUserId: "user_workos_1",
    broadcastIds: [],
    campaignIds: ["campaign-1"],
    newsletterIds: [],
    transactionalMessageIds: [],
    broadcastActions: {},
    campaignActions: {},
    newsletterActions: {},
    transactionalMessageActions: {},
    existingTranslationPolicy: "seed_empty" as const,
    overwriteWhenRemoteNewer: true,
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
    name: "Customer.io campaigns",
    instructions: "",
    projectId: "project-1",
    triggerConfig: {
      mode: "scheduled",
      schedule: { cadence: "daily", hourUtc: 9, timezone: "UTC" },
    },
    repositoryTarget: { kind: "none" },
    toolConfig: overrides.toolConfig ?? { customerIo: customerIoConfig() },
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

function campaignResource(): CustomerIoImportResource {
  return { kind: "campaign", id: "campaign-1", name: "Welcome" };
}

function action(
  overrides: Partial<CustomerIoAction> & Pick<CustomerIoAction, "id" | "type">,
): CustomerIoAction {
  return {
    name: overrides.name ?? overrides.id,
    language: overrides.language ?? "",
    ...overrides,
  };
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

function mockReadyClient() {
  mocks.loadCustomerIoAutomationClient.mockResolvedValue({
    ok: true,
    value: { apiKey: "key", region: "us" },
  });
}

describe("getCustomerIoPushEligibility mapping", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mocks.loadAsPrefilledEntries.mockReset();
    mocks.loadCustomerIoAutomationClient.mockReset();
    mocks.resolveCustomerIoImportResources.mockReset();
    mocks.listCustomerIoResourceActions.mockReset();
  });

  beforeEach(() => {
    approvedLoad();
    mockReadyClient();
    mocks.resolveCustomerIoImportResources.mockResolvedValue([campaignResource()]);
    mocks.listCustomerIoResourceActions.mockResolvedValue([
      action({ id: "email-1", type: "email", name: "Welcome email" }),
    ]);
  });

  it("returns null when Customer.io is disabled or the automation has no project", async () => {
    await expect(
      getCustomerIoPushEligibility({
        organizationId: "org-1",
        automation: automation({
          toolConfig: { customerIo: customerIoConfig({ enabled: false }) },
        }),
      }),
    ).resolves.toBeNull();
    await expect(
      getCustomerIoPushEligibility({
        organizationId: "org-1",
        automation: automation({ projectId: "   " }),
      }),
    ).resolves.toBeNull();
    expect(mocks.loadCustomerIoAutomationClient).not.toHaveBeenCalled();
    expect(mocks.loadAsPrefilledEntries).not.toHaveBeenCalled();
  });

  it("returns empty eligibility when the project is missing or credentials fail", async () => {
    const selectSpy = mockSelectQueue([[]]);

    await expect(
      getCustomerIoPushEligibility({
        organizationId: "org-1",
        automation: automation(),
      }),
    ).resolves.toEqual({ eligibleLocaleCount: 0, mappedItemCount: 0, items: [] });
    expect(selectSpy).toHaveBeenCalledTimes(1);
    expect(mocks.loadCustomerIoAutomationClient).not.toHaveBeenCalled();

    mockSelectQueue([[{ sourceLocale: "en", targetLocales: ["vi-VN"] }]]);
    mocks.loadCustomerIoAutomationClient.mockResolvedValue({
      ok: false,
      error: { code: "customer_io_not_connected" },
    });

    await expect(
      getCustomerIoPushEligibility({
        organizationId: "org-1",
        automation: automation(),
      }),
    ).resolves.toEqual({ eligibleLocaleCount: 0, mappedItemCount: 0, items: [] });
    expect(mocks.resolveCustomerIoImportResources).not.toHaveBeenCalled();
    expect(mocks.loadAsPrefilledEntries).not.toHaveBeenCalled();
  });

  it("drops the source locale and duplicate targets before checking approval", async () => {
    mockSelectQueue([
      [{ sourceLocale: "en", targetLocales: ["en", "EN", "vi-VN", "vi-vn", "  "] }],
    ]);

    await expect(
      getCustomerIoPushEligibility({
        organizationId: "org-1",
        automation: automation(),
      }),
    ).resolves.toEqual({
      eligibleLocaleCount: 1,
      mappedItemCount: 1,
      items: [
        expect.objectContaining({
          sourceId: "campaign-1/email-1",
          sourcePath: "customer-io/campaigns/campaign-1/actions/email-1.html",
          eligibleLocales: ["vi-VN"],
          targetLocaleCount: 1,
        }),
      ],
    });
    expect(mocks.loadAsPrefilledEntries).toHaveBeenCalledTimes(1);
    expect(mocks.loadAsPrefilledEntries).toHaveBeenCalledWith(
      expect.objectContaining({
        sourcePath: "customer-io/campaigns/campaign-1/actions/email-1.html",
        targetLocale: "vi-VN",
      }),
    );
  });

  it("keeps only blank-language localizable actions and optional selected action ids", async () => {
    mockSelectQueue([[{ sourceLocale: "en", targetLocales: ["vi-VN", "ja-JP"] }]]);
    mocks.listCustomerIoResourceActions.mockResolvedValue([
      action({ id: "email-1", type: "email", name: "Welcome email" }),
      action({ id: "webhook-1", type: "webhook", name: "Notify slack" }),
      action({ id: "email-fr", type: "email", name: "French copy", language: "fr" }),
      action({ id: "push-1", type: "push", name: "Launch push" }),
    ]);

    await expect(
      getCustomerIoPushEligibility({
        organizationId: "org-1",
        automation: automation({
          toolConfig: {
            customerIo: customerIoConfig({
              campaignActions: { "campaign-1": ["email-1", "webhook-1", "email-fr"] },
            }),
          },
        }),
      }),
    ).resolves.toEqual({
      eligibleLocaleCount: 1,
      mappedItemCount: 1,
      items: [
        {
          sourceId: "campaign-1/email-1",
          sourcePath: "customer-io/campaigns/campaign-1/actions/email-1.html",
          resourceKind: "campaign",
          name: "Welcome — Welcome email",
          status: "active",
          eligibleLocaleCount: 1,
          targetLocaleCount: 2,
          eligibleLocales: ["vi-VN"],
          locales: [],
          lastPushedAt: null,
          lastError: null,
        },
      ],
    });
    expect(mocks.listCustomerIoResourceActions).toHaveBeenCalledTimes(1);
  });

  it("counts any approved key as eligible and attaches locale progress when requested", async () => {
    mockSelectQueue([[{ sourceLocale: "en", targetLocales: ["vi-VN", "ja-JP"] }]]);
    approvedLoad();

    await expect(
      getCustomerIoPushEligibility({
        organizationId: "org-1",
        automation: automation(),
        includeLocaleProgress: true,
      }),
    ).resolves.toEqual({
      eligibleLocaleCount: 1,
      mappedItemCount: 1,
      items: [
        expect.objectContaining({
          sourceId: "campaign-1/email-1",
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
