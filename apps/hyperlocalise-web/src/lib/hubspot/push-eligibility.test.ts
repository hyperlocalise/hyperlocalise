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

import { getHubspotPushEligibility, isHubspotPushRunActive } from "./push-eligibility";
import { readHubspotPushSourcePaths } from "./push-hubspot-content";

function hubspotConfig(
  overrides: Partial<NonNullable<WorkspaceAutomationRecord["toolConfig"]["hubspot"]>> = {},
) {
  return {
    enabled: true,
    sourceLocale: "en",
    emailIds: ["email-1"],
    formIds: [],
    blogPostIds: [],
    landingPageIds: [],
    websitePageIds: [],
    messageTemplateIds: [],
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
    name: "HubSpot content",
    instructions: "",
    projectId: "project-1",
    triggerConfig: {
      mode: "scheduled",
      schedule: { cadence: "daily", hourUtc: 9, timezone: "UTC" },
    },
    repositoryTarget: { kind: "none" },
    toolConfig: overrides.toolConfig ?? { hubspot: hubspotConfig() },
    model: "openai/gpt-6-luna",
    configVersion: 1,
    nextRunAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("isHubspotPushRunActive", () => {
  it("is true only for queued or running push_approved runs", () => {
    expect(
      isHubspotPushRunActive([{ status: "queued", inputSnapshot: { operation: "push_approved" } }]),
    ).toBe(true);
    expect(
      isHubspotPushRunActive([
        { status: "running", inputSnapshot: { operation: "push_approved" } },
      ]),
    ).toBe(true);
    expect(
      isHubspotPushRunActive([{ status: "queued", inputSnapshot: { operation: "import" } }]),
    ).toBe(false);
    expect(
      isHubspotPushRunActive([
        { status: "succeeded", inputSnapshot: { operation: "push_approved" } },
      ]),
    ).toBe(false);
    expect(isHubspotPushRunActive([{ status: "queued", inputSnapshot: {} }])).toBe(false);
  });
});

describe("readHubspotPushSourcePaths", () => {
  it("returns undefined without a sourcePaths snapshot", () => {
    expect(readHubspotPushSourcePaths(undefined)).toBeUndefined();
    expect(readHubspotPushSourcePaths({})).toBeUndefined();
    expect(readHubspotPushSourcePaths({ sourcePaths: "hubspot/emails/a.html" })).toBeUndefined();
  });

  it("keeps only non-empty string paths", () => {
    expect(
      readHubspotPushSourcePaths({
        sourcePaths: ["hubspot/emails/a.html", "", 42, "hubspot/forms/b.json"],
      }),
    ).toEqual(["hubspot/emails/a.html", "hubspot/forms/b.json"]);
  });
});

describe("getHubspotPushEligibility", () => {
  it("returns null when HubSpot is not enabled", async () => {
    await expect(
      getHubspotPushEligibility({
        organizationId: "org-1",
        automation: automation({
          toolConfig: { hubspot: hubspotConfig({ enabled: false }) },
        }),
      }),
    ).resolves.toBeNull();
  });

  it("returns null when the automation has no project", async () => {
    await expect(
      getHubspotPushEligibility({
        organizationId: "org-1",
        automation: automation({ projectId: null }),
      }),
    ).resolves.toBeNull();
    await expect(
      getHubspotPushEligibility({
        organizationId: "org-1",
        automation: automation({ projectId: "   " }),
      }),
    ).resolves.toBeNull();
  });
});
