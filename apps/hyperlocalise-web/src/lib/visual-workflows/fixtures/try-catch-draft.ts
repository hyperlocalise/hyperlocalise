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

export const visualWorkflowTryCatchDraft = fromVisualWorkflowDefinition({
  schemaVersion: VISUAL_WORKFLOW_SCHEMA_VERSION,
  name: "Try / Catch error boundary",
  nodes: [
    { id: "trigger", type: "trigger.manual", config: { kind: "trigger.manual" } },
    {
      id: "boundary",
      type: "logic.try_catch",
      config: { kind: "logic.try_catch" },
      bodyNodeIds: ["request"],
    },
    {
      id: "request",
      type: "action.http",
      config: { kind: "action.http", method: "GET", url: "https://example.com/api" },
    },
    {
      id: "success",
      type: "logic.set",
      config: { kind: "logic.set", assignments: [{ key: "status", value: "succeeded" }] },
    },
    {
      id: "caught",
      type: "logic.set",
      config: { kind: "logic.set", assignments: [{ key: "status", value: "caught" }] },
    },
    {
      id: "finally",
      type: "logic.set",
      config: { kind: "logic.set", assignments: [{ key: "cleanup", value: "complete" }] },
    },
  ],
  edges: [
    { id: "start", source: "trigger", target: "boundary", sourceHandle: null, targetHandle: null },
    { id: "try", source: "boundary", target: "request", sourceHandle: "try", targetHandle: null },
    {
      id: "success",
      source: "boundary",
      target: "success",
      sourceHandle: "success",
      targetHandle: null,
    },
    {
      id: "catch",
      source: "boundary",
      target: "caught",
      sourceHandle: "catch",
      targetHandle: null,
    },
    {
      id: "finally",
      source: "boundary",
      target: "finally",
      sourceHandle: "finally",
      targetHandle: null,
    },
  ],
  editor: {
    positions: {
      trigger: { x: 40, y: 260 },
      boundary: { x: 380, y: 260 },
      request: { x: 760, y: 20 },
      success: { x: 760, y: 220 },
      caught: { x: 760, y: 420 },
      finally: { x: 760, y: 620 },
    },
  },
});
