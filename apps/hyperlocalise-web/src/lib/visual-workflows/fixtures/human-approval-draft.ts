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
import { fromVisualWorkflowDefinition } from "../schema/serializers";
import { VISUAL_WORKFLOW_SCHEMA_VERSION } from "../schema/types";

export const visualWorkflowHumanApprovalDraft = fromVisualWorkflowDefinition({
  schemaVersion: VISUAL_WORKFLOW_SCHEMA_VERSION,
  name: "Human approval decisions",
  nodes: [
    {
      id: "trigger",
      type: "trigger.manual",
      config: { kind: "trigger.manual" },
    },
    {
      id: "approval",
      type: "flow.human_approval",
      config: {
        kind: "flow.human_approval",
        reviewerType: "team",
        reviewerId: "localization-reviewers",
        prompt: "Review and approve the translated content before publishing.",
        artifactReference: "translation-preview",
        jobReference: "job-758",
        deadline: "2026-10-30T10:00:00.000Z",
      },
    },
    ...(["approved", "rejected", "changes-requested", "timed-out"] as const).map((id) => ({
      id,
      type: "logic.set" as const,
      config: {
        kind: "logic.set" as const,
        assignments: [{ key: "approvalResult", value: id }],
      },
    })),
  ],
  edges: [
    {
      id: "trigger-approval",
      source: "trigger",
      target: "approval",
      sourceHandle: null,
      targetHandle: null,
    },
    {
      id: "approval-approved",
      source: "approval",
      target: "approved",
      sourceHandle: "approved",
      targetHandle: null,
    },
    {
      id: "approval-rejected",
      source: "approval",
      target: "rejected",
      sourceHandle: "rejected",
      targetHandle: null,
    },
    {
      id: "approval-changes-requested",
      source: "approval",
      target: "changes-requested",
      sourceHandle: "changes_requested",
      targetHandle: null,
    },
    {
      id: "approval-timed-out",
      source: "approval",
      target: "timed-out",
      sourceHandle: "timed_out",
      targetHandle: null,
    },
  ],
  editor: {
    positions: {
      trigger: { x: 40, y: 250 },
      approval: { x: 340, y: 250 },
      approved: { x: 720, y: 40 },
      rejected: { x: 720, y: 190 },
      "changes-requested": { x: 720, y: 340 },
      "timed-out": { x: 720, y: 490 },
    },
  },
});
