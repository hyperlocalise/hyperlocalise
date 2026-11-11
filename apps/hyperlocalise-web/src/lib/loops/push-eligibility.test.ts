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

import { readLoopsPushSourcePaths } from "./push-loops-emails";
import { getLoopsPushEligibility, isLoopsPushRunActive } from "./push-eligibility";

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
    name: "Loops emails",
    instructions: "",
    projectId: "project-1",
    triggerConfig: {
      mode: "scheduled",
      schedule: { cadence: "daily", hourUtc: 9, timezone: "UTC" },
    },
    repositoryTarget: { kind: "none" },
    toolConfig: overrides.toolConfig ?? {
      loops: {
        enabled: true,
        sourceLocale: "en",
        transactionalIds: ["txn-1"],
        campaignIds: [],
        workflowIds: [],
        existingTranslationPolicy: "seed_empty",
        overwriteWhenRemoteNewer: true,
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

describe("isLoopsPushRunActive", () => {
  it("is true only for queued or running push_approved runs", () => {
    expect(
      isLoopsPushRunActive([{ status: "queued", inputSnapshot: { operation: "push_approved" } }]),
    ).toBe(true);
    expect(
      isLoopsPushRunActive([{ status: "running", inputSnapshot: { operation: "push_approved" } }]),
    ).toBe(true);
    expect(
      isLoopsPushRunActive([{ status: "queued", inputSnapshot: { operation: "import" } }]),
    ).toBe(false);
    expect(
      isLoopsPushRunActive([
        { status: "succeeded", inputSnapshot: { operation: "push_approved" } },
      ]),
    ).toBe(false);
    expect(isLoopsPushRunActive([{ status: "queued", inputSnapshot: {} }])).toBe(false);
  });
});

describe("readLoopsPushSourcePaths", () => {
  it("returns undefined without a sourcePaths snapshot", () => {
    expect(readLoopsPushSourcePaths(undefined)).toBeUndefined();
    expect(readLoopsPushSourcePaths({})).toBeUndefined();
    expect(readLoopsPushSourcePaths({ sourcePaths: "loops/a.html" })).toBeUndefined();
  });

  it("keeps only non-empty string paths", () => {
    expect(
      readLoopsPushSourcePaths({
        sourcePaths: ["loops/a.html", "", 42, "loops/b.html"],
      }),
    ).toEqual(["loops/a.html", "loops/b.html"]);
  });
});

describe("getLoopsPushEligibility", () => {
  it("returns null when Loops is not enabled", async () => {
    await expect(
      getLoopsPushEligibility({
        organizationId: "org-1",
        automation: automation({
          toolConfig: {
            loops: {
              enabled: false,
              sourceLocale: "en",
              transactionalIds: [],
              campaignIds: [],
              workflowIds: [],
              existingTranslationPolicy: "seed_empty",
              overwriteWhenRemoteNewer: true,
            },
          },
        }),
      }),
    ).resolves.toBeNull();
  });

  it("returns null when the automation has no project", async () => {
    await expect(
      getLoopsPushEligibility({
        organizationId: "org-1",
        automation: automation({ projectId: null }),
      }),
    ).resolves.toBeNull();
  });
});
