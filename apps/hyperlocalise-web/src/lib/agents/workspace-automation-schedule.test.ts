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

import { resolveNextRunAtForWorkspaceAutomation } from "./workspace-automation-schedule";
import type { WorkspaceAutomationRecord } from "./workspace-automation-types";

function automation(
  overrides: Partial<WorkspaceAutomationRecord> &
    Pick<WorkspaceAutomationRecord, "status" | "triggerConfig" | "toolConfig">,
): WorkspaceAutomationRecord {
  return {
    id: "automation-1",
    organizationId: "org-1",
    authorUserId: null,
    authorName: null,
    name: "Nightly research",
    instructions: "Search the web.",
    model: "openai/gpt-5.6-luna",
    projectId: null,
    repositoryTarget: { kind: "none" },
    configVersion: 1,
    nextRunAt: null,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("resolveNextRunAtForWorkspaceAutomation", () => {
  it("schedules GitHub agent automations from the trigger, not sync workflows", () => {
    const next = resolveNextRunAtForWorkspaceAutomation(
      automation({
        status: "active",
        triggerConfig: {
          mode: "scheduled",
          schedule: {
            cadence: "daily",
            hourUtc: 1,
            timezone: "UTC",
          },
        },
        toolConfig: {
          github: {
            enabled: true,
            mode: "agent",
            pushSource: false,
            pullTranslations: false,
            validation: false,
          },
        },
        repositoryTarget: {
          kind: "github",
          githubInstallationRepositoryId: "repo-1",
        },
      }),
      new Date("2026-06-15T00:30:00.000Z"),
    );

    expect(next?.toISOString()).toBe("2026-06-15T01:00:00.000Z");
  });

  it("schedules Crowdin and web-search automations without a GitHub workflow", () => {
    const next = resolveNextRunAtForWorkspaceAutomation(
      automation({
        status: "active",
        triggerConfig: {
          mode: "scheduled",
          schedule: {
            cadence: "daily",
            hourUtc: 1,
            timezone: "America/New_York",
          },
        },
        toolConfig: {
          webSearch: { enabled: true, provider: "auto" },
        },
      }),
      new Date("2026-01-15T07:00:00.000Z"),
    );

    expect(next?.toISOString()).toBe("2026-01-16T06:00:00.000Z");
  });

  it("does not schedule paused automations", () => {
    expect(
      resolveNextRunAtForWorkspaceAutomation(
        automation({
          status: "paused",
          triggerConfig: {
            mode: "scheduled",
            schedule: { cadence: "daily", hourUtc: 1, timezone: "UTC" },
          },
          toolConfig: { webSearch: { enabled: true, provider: "auto" } },
        }),
        new Date("2026-06-15T00:30:00.000Z"),
      ),
    ).toBeNull();
  });
});
