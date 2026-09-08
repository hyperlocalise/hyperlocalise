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
import { createDefaultConfig } from "../catalog/node-catalog";
import { fromVisualWorkflowDefinition } from "../schema/serializers";
import type { VisualNodeConfig, VisualWorkflowRfNode } from "../schema/types";
import { VISUAL_WORKFLOW_SCHEMA_VERSION } from "../schema/types";

function httpPostConfig(url: string): VisualNodeConfig {
  const config = createDefaultConfig("action.http");
  if (config.kind !== "action.http") {
    return config;
  }

  return { ...config, method: "POST", url };
}

const SUBTITLES: Readonly<Record<string, string>> = {
  brief: "Campaign brief uploaded",
  draft: "Draft the landing page",
  localise: "Localise for FR, DE, JA",
  check: "Check passed?",
  cms: "Publish to Contentful",
  slack: "Send to #gtm for review",
};

function withPreviewSubtitles(nodes: VisualWorkflowRfNode[]): VisualWorkflowRfNode[] {
  return nodes.map((node) => ({
    ...node,
    data: {
      ...node.data,
      previewSubtitle: SUBTITLES[node.id] ?? node.data.previewSubtitle,
    },
  }));
}

const campaignPagesState = fromVisualWorkflowDefinition({
  schemaVersion: VISUAL_WORKFLOW_SCHEMA_VERSION,
  name: "Publish campaign pages",
  nodes: [
    {
      id: "brief",
      type: "trigger.source_upload",
      config: { kind: "trigger.source_upload" },
    },
    {
      id: "draft",
      type: "ai.agent",
      config: {
        kind: "ai.agent",
        prompt: "Draft a landing page from the uploaded campaign brief.",
        onError: "stop",
      },
    },
    {
      id: "localise",
      type: "ai.agent",
      config: {
        kind: "ai.agent",
        prompt: "Localise the landing page for French, German, and Japanese.",
        onError: "stop",
      },
    },
    {
      id: "check",
      type: "logic.if",
      config: { kind: "logic.if", condition: "true" },
    },
    {
      id: "cms",
      type: "action.http",
      config: httpPostConfig("https://api.contentful.com/spaces/demo/entries"),
    },
    {
      id: "slack",
      type: "action.notify_slack",
      config: {
        kind: "action.notify_slack",
        channelId: "#gtm",
        message: "Campaign page needs review before it goes live.",
        onError: "stop",
      },
    },
  ],
  edges: [
    {
      id: "e-brief-draft",
      source: "brief",
      target: "draft",
      sourceHandle: null,
      targetHandle: null,
    },
    {
      id: "e-draft-localise",
      source: "draft",
      target: "localise",
      sourceHandle: null,
      targetHandle: null,
    },
    {
      id: "e-localise-check",
      source: "localise",
      target: "check",
      sourceHandle: null,
      targetHandle: null,
    },
    { id: "e-check-cms", source: "check", target: "cms", sourceHandle: "true", targetHandle: null },
    {
      id: "e-check-slack",
      source: "check",
      target: "slack",
      sourceHandle: "false",
      targetHandle: null,
    },
  ],
  editor: {
    positions: {
      brief: { x: 40, y: 160 },
      draft: { x: 300, y: 160 },
      localise: { x: 560, y: 160 },
      check: { x: 820, y: 160 },
      cms: { x: 1100, y: 40 },
      slack: { x: 1100, y: 280 },
    },
  },
});

export const visualWorkflowCampaignPagesDraft = {
  ...campaignPagesState,
  nodes: withPreviewSubtitles(campaignPagesState.nodes),
};
