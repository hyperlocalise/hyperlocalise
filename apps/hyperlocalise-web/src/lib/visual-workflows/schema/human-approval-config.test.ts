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
import { NODE_CONTRACTS } from "../catalog/node-contracts";
import { visualNodeConfigSchema } from "./definition-schema";
import { fromVisualWorkflowV3Definition, toVisualWorkflowV3Definition } from "./serializers";
import type { VisualWorkflowV3Definition } from "./types";

describe("Human Approval node configuration", () => {
  it("provides a draft-safe default configuration", () => {
    expect(createDefaultConfig("flow.human_approval")).toEqual({
      kind: "flow.human_approval",
      reviewerType: "user",
      reviewerId: "",
      prompt: "",
    });
  });

  it("accepts a bounded reviewer, context, and deadline contract", () => {
    expect(
      visualNodeConfigSchema.safeParse({
        kind: "flow.human_approval",
        reviewerType: "team",
        reviewerId: "team_localization_reviewers",
        prompt: "Review the translated release notes.",
        artifactReference: "artifact://release-notes/fr-FR",
        jobReference: "job_123",
        deadline: "2026-11-01T09:00:00.000Z",
      }).success,
    ).toBe(true);
  });

  it("rejects malformed reviewer types, deadlines, and oversized protected content", () => {
    expect(
      visualNodeConfigSchema.safeParse({
        kind: "flow.human_approval",
        reviewerType: "organization",
        reviewerId: "org_123",
        prompt: "Review",
      }).success,
    ).toBe(false);
    expect(
      visualNodeConfigSchema.safeParse({
        kind: "flow.human_approval",
        reviewerType: "user",
        reviewerId: "user_123",
        prompt: "Review",
        deadline: "tomorrow",
      }).success,
    ).toBe(false);
    expect(
      visualNodeConfigSchema.safeParse({
        kind: "flow.human_approval",
        reviewerType: "user",
        reviewerId: "user_123",
        prompt: "x".repeat(4_001),
      }).success,
    ).toBe(false);
  });

  it("declares stable typed data inputs and decision outputs", () => {
    expect(NODE_CONTRACTS["flow.human_approval"]).toMatchObject({
      inputs: [
        { name: "reviewerId", type: "string", required: true },
        { name: "prompt", type: "string", required: true },
        { name: "artifactReference", type: "string", required: false },
        { name: "jobReference", type: "string", required: false },
        { name: "deadline", type: "string", required: true },
      ],
      outputs: [
        { path: "reviewerId", type: "string", optional: false },
        { path: "decision", type: "string", optional: false },
        { path: "commentReference", type: "string", optional: true },
        { path: "decidedAt", type: "string", optional: false },
      ],
    });
  });

  it("round-trips reviewer settings, protected references, deadline, and decision branches", () => {
    const original: VisualWorkflowV3Definition = {
      schemaVersion: 3,
      name: "Human approval round trip",
      nodes: [
        {
          id: "approval",
          type: "flow.human_approval",
          config: {
            kind: "flow.human_approval",
            reviewerType: "team",
            reviewerId: "team_reviewers",
            prompt: "Review this translation",
            artifactReference: "artifact://preview",
            jobReference: "job_758",
            deadline: "2026-11-01T09:00:00.000Z",
          },
        },
        {
          id: "approved",
          type: "logic.set",
          config: { kind: "logic.set", assignments: [] },
        },
      ],
      edges: [
        {
          id: "approval-approved",
          kind: "execution",
          source: "approval",
          target: "approved",
          sourcePortId: "approved",
          targetPortId: "input",
        },
      ],
      editor: {
        positions: {
          approval: { x: 0, y: 0 },
          approved: { x: 320, y: 0 },
        },
      },
    };

    expect(toVisualWorkflowV3Definition(fromVisualWorkflowV3Definition(original))).toEqual(
      original,
    );
  });
});
