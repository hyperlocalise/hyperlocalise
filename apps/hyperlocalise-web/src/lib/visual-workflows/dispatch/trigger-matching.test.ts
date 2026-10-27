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
  getVisualWorkflowTriggerNode,
  resolveVisualWorkflowTriggerFingerprint,
  validateActiveVisualWorkflowTrigger,
  validateVisualWorkflowTriggerConfig,
  visualWorkflowShouldDispatchOnGithubPullRequest,
  visualWorkflowShouldDispatchOnGithubPush,
  visualWorkflowShouldDispatchOnSourceUpload,
} from "./trigger-matching";
import type { VisualWorkflowDefinition } from "../schema/types";
import { parseVisualWorkflowV3Definition } from "../schema/definition-migration";
import type { VisualWorkflowRecord } from "../visual-workflow-types";

function workflowRecord(definition: VisualWorkflowDefinition): VisualWorkflowRecord {
  return {
    id: "wf-1",
    organizationId: "org-1",
    authorUserId: null,
    projectId: null,
    status: "active",
    name: definition.name,
    definition: parseVisualWorkflowV3Definition(definition),
    definitionVersion: 1,
    revision: 1,
    publishedVersion: null,
    publishedDefinition: null,
    triggerFingerprint: null,
    nextRunAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe("visual workflow trigger matching", () => {
  it("computes github trigger fingerprint from repository and events", () => {
    const definition: VisualWorkflowDefinition = {
      schemaVersion: 2,
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
      schemaVersion: 2,
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
      schemaVersion: 2,
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
      schemaVersion: 2,
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

  it("fingerprints a webhook trigger and allows it on an active workflow", () => {
    const definition: VisualWorkflowDefinition = {
      schemaVersion: 2,
      name: "Webhook",
      nodes: [
        {
          id: "t",
          type: "trigger.webhook",
          config: createDefaultConfig("trigger.webhook"),
        },
      ],
      edges: [],
      editor: { positions: {} },
    };

    expect(resolveVisualWorkflowTriggerFingerprint({ id: "wf-webhook", definition })).toBe(
      "webhook:wf-webhook",
    );
    expect(validateActiveVisualWorkflowTrigger(definition)).toEqual({ ok: true });
    expect(
      validateVisualWorkflowTriggerConfig({ kind: "trigger.webhook", tokenVersion: 0 }),
    ).toEqual({ ok: false, message: "Webhook token version is invalid." });
    expect(
      validateVisualWorkflowTriggerConfig({ kind: "trigger.webhook", tokenVersion: 1.5 }),
    ).toEqual({ ok: false, message: "Webhook token version is invalid." });
  });

  it("returns no trigger when a definition has zero or two trigger nodes", () => {
    expect(getVisualWorkflowTriggerNode({ nodes: [] })).toBeNull();
    expect(
      getVisualWorkflowTriggerNode({
        nodes: [
          { id: "a", type: "trigger.webhook", config: createDefaultConfig("trigger.webhook") },
          { id: "b", type: "trigger.manual", config: createDefaultConfig("trigger.manual") },
        ],
      }),
    ).toBeNull();
  });

  it("matches source upload for the chosen project and skips other projects", () => {
    const scoped: VisualWorkflowDefinition = {
      schemaVersion: 2,
      name: "Upload",
      nodes: [
        {
          id: "t",
          type: "trigger.source_upload",
          config: { kind: "trigger.source_upload", projectId: "proj-1" },
        },
      ],
      edges: [],
      editor: { positions: {} },
    };
    const anyProject: VisualWorkflowDefinition = {
      ...scoped,
      nodes: [
        { id: "t", type: "trigger.source_upload", config: { kind: "trigger.source_upload" } },
      ],
    };

    expect(
      visualWorkflowShouldDispatchOnSourceUpload(workflowRecord(scoped), { projectId: "proj-1" }),
    ).toBe(true);
    expect(
      visualWorkflowShouldDispatchOnSourceUpload(workflowRecord(scoped), { projectId: "proj-2" }),
    ).toBe(false);
    expect(
      visualWorkflowShouldDispatchOnSourceUpload(workflowRecord(anyProject), {
        projectId: "proj-2",
      }),
    ).toBe(true);
    expect(
      visualWorkflowShouldDispatchOnSourceUpload(
        { ...workflowRecord(scoped), status: "draft" },
        { projectId: "proj-1" },
      ),
    ).toBe(false);
    expect(resolveVisualWorkflowTriggerFingerprint({ id: "wf-up", definition: scoped })).toBe(
      "source_upload:wf-up:proj-1",
    );
  });

  it("matches github pull requests independently of push", () => {
    const definition: VisualWorkflowDefinition = {
      schemaVersion: 2,
      name: "PR only",
      nodes: [
        {
          id: "t",
          type: "trigger.github",
          config: {
            kind: "trigger.github",
            githubInstallationRepositoryId: "00000000-0000-4000-8000-000000000099",
            branches: ["main"],
            events: ["pull_request"],
          },
        },
      ],
      edges: [],
      editor: { positions: {} },
    };
    const record = workflowRecord(definition);
    const repo = {
      githubInstallationRepositoryId: "00000000-0000-4000-8000-000000000099",
    };

    expect(
      visualWorkflowShouldDispatchOnGithubPullRequest(record, {
        ...repo,
        baseBranch: "main",
      }),
    ).toBe(true);
    expect(
      visualWorkflowShouldDispatchOnGithubPullRequest(record, {
        ...repo,
        baseBranch: "develop",
      }),
    ).toBe(false);
    expect(
      visualWorkflowShouldDispatchOnGithubPush(record, {
        ...repo,
        branch: "main",
      }),
    ).toBe(false);
  });
});
