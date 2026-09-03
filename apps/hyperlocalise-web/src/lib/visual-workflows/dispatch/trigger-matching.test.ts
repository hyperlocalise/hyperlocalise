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

import { createDefaultConfig } from "../catalog/node-catalog";
import {
  resolveVisualWorkflowTriggerFingerprint,
  validateActiveVisualWorkflowTrigger,
  visualWorkflowShouldDispatchOnGithubPush,
} from "./trigger-matching";
import type { VisualWorkflowDefinition } from "../schema/types";
import type { VisualWorkflowRecord } from "../visual-workflow-types";

function workflowRecord(definition: VisualWorkflowDefinition): VisualWorkflowRecord {
  return {
    id: "wf-1",
    organizationId: "org-1",
    authorUserId: null,
    projectId: null,
    status: "active",
    name: definition.name,
    definition,
    definitionVersion: 1,
    triggerFingerprint: null,
    nextRunAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe("visual workflow trigger matching", () => {
  it("computes github trigger fingerprint from repository and events", () => {
    const definition: VisualWorkflowDefinition = {
      schemaVersion: 1,
      name: "GitHub",
      nodes: [
        {
          id: "t",
          type: "trigger.github",
          config: {
            kind: "trigger.github",
            githubInstallationRepositoryId: "00000000-0000-4000-8000-000000000099",
            branches: ["main"],
            events: ["push", "pull_request"],
          },
        },
      ],
      edges: [],
      editor: { positions: {} },
    };

    expect(resolveVisualWorkflowTriggerFingerprint({ id: "wf-1", definition })).toBe(
      "github:00000000-0000-4000-8000-000000000099:push,pull_request",
    );
  });

  it("matches github push when branch pattern matches", () => {
    const definition: VisualWorkflowDefinition = {
      schemaVersion: 1,
      name: "GitHub",
      nodes: [
        {
          id: "t",
          type: "trigger.github",
          config: {
            kind: "trigger.github",
            githubInstallationRepositoryId: "00000000-0000-4000-8000-000000000099",
            branches: ["main"],
          },
        },
      ],
      edges: [],
      editor: { positions: {} },
    };

    expect(
      visualWorkflowShouldDispatchOnGithubPush(workflowRecord(definition), {
        githubInstallationRepositoryId: "00000000-0000-4000-8000-000000000099",
        branch: "main",
      }),
    ).toBe(true);
    expect(
      visualWorkflowShouldDispatchOnGithubPush(workflowRecord(definition), {
        githubInstallationRepositoryId: "00000000-0000-4000-8000-000000000099",
        branch: "feature/foo",
      }),
    ).toBe(false);
  });

  it("rejects activating workflows with manual triggers", () => {
    const definition: VisualWorkflowDefinition = {
      schemaVersion: 1,
      name: "Manual",
      nodes: [{ id: "t", type: "trigger.manual", config: createDefaultConfig("trigger.manual") }],
      edges: [],
      editor: { positions: {} },
    };

    const result = validateActiveVisualWorkflowTrigger(definition);
    expect(result.ok).toBe(false);
  });

  it("rejects scheduled triggers with invalid time zones", () => {
    const definition: VisualWorkflowDefinition = {
      schemaVersion: 1,
      name: "Scheduled",
      nodes: [
        {
          id: "t",
          type: "trigger.scheduled",
          config: {
            kind: "trigger.scheduled",
            schedule: { cadence: "daily", timezone: "Not a zone" },
          },
        },
      ],
      edges: [],
      editor: { positions: {} },
    };

    const result = validateActiveVisualWorkflowTrigger(definition);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("timezone");
    }
  });
});
