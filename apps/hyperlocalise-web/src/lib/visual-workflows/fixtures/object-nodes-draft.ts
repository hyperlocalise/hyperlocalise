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
import type { VisualWorkflowEditorState } from "../schema/types";

export const visualWorkflowObjectNodesDraft = {
  name: "Build localization context",
  nodes: [
    {
      id: "trigger",
      type: "trigger.manual",
      position: { x: 40, y: 180 },
      data: {
        catalogType: "trigger.manual",
        config: { kind: "trigger.manual" },
        runStatus: "idle",
      },
    },
    {
      id: "create-base",
      type: "logic.create_object",
      position: { x: 360, y: 100 },
      data: {
        catalogType: "logic.create_object",
        config: {
          kind: "logic.create_object",
          fields: [
            { id: "created-at", name: "createdAt", type: "string" },
            { id: "locale", name: "locale", type: "string", defaultValue: "en-AU" },
          ],
        },
        runStatus: "idle",
      },
    },
    {
      id: "create-overrides",
      type: "logic.create_object",
      position: { x: 360, y: 340 },
      data: {
        catalogType: "logic.create_object",
        config: {
          kind: "logic.create_object",
          fields: [
            { id: "tone", name: "tone", type: "string", defaultValue: "friendly" },
            { id: "review", name: "requiresReview", type: "boolean", defaultValue: true },
          ],
        },
        runStatus: "idle",
      },
    },
    {
      id: "merge",
      type: "logic.merge_objects",
      position: { x: 720, y: 220 },
      data: {
        catalogType: "logic.merge_objects",
        config: {
          kind: "logic.merge_objects",
          inputs: [
            { id: "base", name: "Base context" },
            { id: "overrides", name: "Overrides" },
          ],
          conflictPolicy: "last_wins",
        },
        runStatus: "succeeded",
        lastOutput: {
          value: {
            createdAt: "2026-10-15T09:00:00.000Z",
            locale: "en-AU",
            tone: "friendly",
            requiresReview: true,
          },
        },
      },
    },
  ],
  edges: [
    {
      id: "trigger-base",
      source: "trigger",
      target: "create-base",
      sourceHandle: "success",
      targetHandle: "input",
      data: { kind: "execution" },
    },
    {
      id: "base-overrides",
      source: "create-base",
      target: "create-overrides",
      sourceHandle: "success",
      targetHandle: "input",
      data: { kind: "execution" },
    },
    {
      id: "overrides-merge",
      source: "create-overrides",
      target: "merge",
      sourceHandle: "success",
      targetHandle: "input",
      data: { kind: "execution" },
    },
    {
      id: "created-at",
      source: "trigger",
      target: "create-base",
      sourceHandle: "triggeredAt",
      targetHandle: "value.created-at",
      data: { kind: "data" },
    },
    {
      id: "base-data",
      source: "create-base",
      target: "merge",
      sourceHandle: "value",
      targetHandle: "value.base",
      data: { kind: "data" },
    },
    {
      id: "override-data",
      source: "create-overrides",
      target: "merge",
      sourceHandle: "value",
      targetHandle: "value.overrides",
      data: { kind: "data" },
    },
  ],
} satisfies VisualWorkflowEditorState;
