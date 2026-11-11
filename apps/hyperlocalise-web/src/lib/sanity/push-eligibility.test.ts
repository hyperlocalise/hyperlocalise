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
import { describe, expect, it } from "vite-plus/test";

import type { WorkspaceAutomationRecord } from "@/lib/agents/workspace-automation-types";

import { getSanityPushEligibility, isSanityPushRunActive } from "./push-eligibility";

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
    name: "Sanity documents",
    instructions: "",
    projectId: "project-1",
    triggerConfig: {
      mode: "scheduled",
      schedule: { cadence: "daily", hourUtc: 9, timezone: "UTC" },
    },
    repositoryTarget: { kind: "none" },
    toolConfig: overrides.toolConfig ?? {
      sanity: {
        enabled: true,
        projectId: "abc123",
        dataset: "production",
        documentTypes: ["page"],
        documentTypeModes: {},
        localeCatalog: { documentType: "locale", tagField: "tag", titleField: "name" },
        languages: ["en", "de"],
        languagesByType: {},
        sourceLocale: "en",
        targetLocales: ["de"],
        includeDrafts: true,
        overwriteSanityDrafts: true,
        existingTranslationPolicy: "seed_empty",
      },
    },
    model: "openai/gpt-6-luna",
    configVersion: 1,
    nextRunAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("isSanityPushRunActive", () => {
  it("is true only for queued or running push_approved runs", () => {
    expect(
      isSanityPushRunActive([{ status: "queued", inputSnapshot: { operation: "push_approved" } }]),
    ).toBe(true);
    expect(
      isSanityPushRunActive([{ status: "running", inputSnapshot: { operation: "push_approved" } }]),
    ).toBe(true);
    expect(
      isSanityPushRunActive([{ status: "queued", inputSnapshot: { operation: "import" } }]),
    ).toBe(false);
    expect(
      isSanityPushRunActive([
        { status: "completed", inputSnapshot: { operation: "push_approved" } },
      ]),
    ).toBe(false);
    expect(isSanityPushRunActive([{ status: "queued", inputSnapshot: {} }])).toBe(false);
    expect(isSanityPushRunActive([{ status: "queued" }])).toBe(false);
  });
});

describe("getSanityPushEligibility", () => {
  it("returns null when Sanity is not enabled", async () => {
    await expect(
      getSanityPushEligibility({
        organizationId: "org-1",
        automation: automation({
          toolConfig: {
            sanity: {
              enabled: false,
              documentTypes: [],
              documentTypeModes: {},
              localeCatalog: { documentType: "locale", tagField: "tag", titleField: "name" },
              languages: [],
              languagesByType: {},
              sourceLocale: "en",
              targetLocales: [],
              includeDrafts: true,
              overwriteSanityDrafts: true,
              existingTranslationPolicy: "seed_empty",
            },
          },
        }),
      }),
    ).resolves.toBeNull();
  });

  it("returns an empty eligibility object when the project or dataset is missing", async () => {
    const empty = { eligibleLocaleCount: 0, mappedDocumentCount: 0, documents: [] };
    await expect(
      getSanityPushEligibility({
        organizationId: "org-1",
        automation: automation({ projectId: null }),
      }),
    ).resolves.toEqual(empty);
    await expect(
      getSanityPushEligibility({
        organizationId: "org-1",
        automation: automation({
          toolConfig: {
            sanity: {
              enabled: true,
              projectId: "abc123",
              dataset: "",
              documentTypes: [],
              documentTypeModes: {},
              localeCatalog: { documentType: "locale", tagField: "tag", titleField: "name" },
              languages: [],
              languagesByType: {},
              sourceLocale: "en",
              targetLocales: [],
              includeDrafts: true,
              overwriteSanityDrafts: true,
              existingTranslationPolicy: "seed_empty",
            },
          },
        }),
      }),
    ).resolves.toEqual(empty);
  });
});
