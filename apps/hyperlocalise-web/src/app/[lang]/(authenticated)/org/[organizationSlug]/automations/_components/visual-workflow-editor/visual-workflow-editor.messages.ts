"use client";

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
import { defineMessages } from "react-intl";

export const visualWorkflowEditorMessages = defineMessages({
  untitledName: {
    defaultMessage: "Untitled workflow",
    id: "dfVzkj5hWL",
    description: "Default name for a new visual workflow mock",
  },
  previewBadge: {
    defaultMessage: "Preview",
    id: "4LzDIQaYVP",
    description: "Badge indicating the visual editor is a prototype",
  },
  editorTab: {
    defaultMessage: "Editor",
    id: "sHEScxEFix",
    description: "Top chrome tab for the visual workflow canvas",
  },
  executionsTab: {
    defaultMessage: "Executions",
    id: "hVILFAmMot",
    description: "Top chrome tab for workflow run history",
  },
  comingSoon: {
    defaultMessage: "Coming soon",
    id: "Pbjej2iS6R",
    description: "Tooltip when a visual editor control is not yet implemented",
  },
  previewOnly: {
    defaultMessage: "Preview only",
    id: "1e+6Te6bCx",
    description: "Tooltip for disabled save, share, and inactive controls",
  },
  inactiveLabel: {
    defaultMessage: "Inactive",
    id: "tZkO4BrIat",
    description: "Disabled workflow active-state toggle label",
  },
  activeLabel: {
    defaultMessage: "Active",
    id: "EOnZA0Blf8",
    description: "Label when a visual workflow is active and receiving production triggers",
  },
  pausedLabel: {
    defaultMessage: "Paused",
    id: "wO5LCBiwAW",
    description: "Badge label when a visual workflow is paused",
  },
  executionsLoading: {
    defaultMessage: "Loading runs…",
    id: "2UzN/e58h6",
    description: "Loading state for the visual workflow executions tab",
  },
  executionsEmpty: {
    defaultMessage: "No runs yet. Test the workflow or activate a production trigger.",
    id: "xCzhnb7LDc",
    description: "Empty state for the visual workflow executions list",
  },
  executionsSelectRun: {
    defaultMessage: "Select a run to inspect node-level status.",
    id: "3CTikplBoF",
    description: "Prompt when no run is selected in the executions tab",
  },
  executionsNoNodeRuns: {
    defaultMessage: "No node runs recorded for this execution yet.",
    id: "XDw6P/hnSY",
    description: "Empty node run table in executions detail",
  },
  executionNodeColumn: {
    defaultMessage: "Node",
    id: "U2UH4sKilD",
    description: "Column header for node id in execution detail",
  },
  executionStatusColumn: {
    defaultMessage: "Status",
    id: "86k8CEUaJ5",
    description: "Column header for node status in execution detail",
  },
  share: {
    defaultMessage: "Share",
    id: "LwRsugxcAC",
    description: "Disabled share button in visual workflow chrome",
  },
  save: {
    defaultMessage: "Save",
    id: "U87kn4cxmh",
    description: "Save button in visual workflow chrome",
  },
  saving: {
    defaultMessage: "Saving…",
    id: "4JSF3BIeDZ",
    description: "Save button label while a visual workflow is being saved",
  },
  exportJson: {
    defaultMessage: "Export JSON",
    id: "NgrKv0XV5y",
    description: "Button that downloads the canonical workflow JSON",
  },
  copyJson: {
    defaultMessage: "Copy JSON",
    id: "/9ZwuXxQ/T",
    description: "Button that copies canonical workflow JSON to the clipboard",
  },
  copiedJson: {
    defaultMessage: "Copied",
    id: "1bqb1Sak4M",
    description: "Confirmation after copying workflow JSON",
  },
  workflowNameLabel: {
    defaultMessage: "Workflow name",
    id: "rkvIw30td+",
    description: "Accessible label for the editable workflow name field",
  },
  addFirstStep: {
    defaultMessage: "Add first step",
    id: "Rrb6+4lhHy",
    description: "Empty canvas button that opens the node picker",
  },
  loadSample: {
    defaultMessage: "Load sample",
    id: "q+y5ruUFmA",
    description: "Empty canvas button that loads the Lead ping demo graph",
  },
  pickerTitle: {
    defaultMessage: "What happens next?",
    id: "7RSUutTUg9",
    description: "Right panel heading when choosing a node to add",
  },
  pickerSearch: {
    defaultMessage: "Search nodes...",
    id: "aJJlFa1d+w",
    description: "Search field placeholder in the visual node picker",
  },
  pickerEmpty: {
    defaultMessage: "No nodes match that search.",
    id: "gPSkb83cu1",
    description: "Empty state when the node picker search has no results",
  },
  categoryTrigger: {
    defaultMessage: "Trigger",
    id: "kHsmQCneif",
    description: "Node picker category for workflow start nodes",
  },
  categoryAction: {
    defaultMessage: "Action",
    id: "YTpu1j7/Q4",
    description: "Node picker category for action nodes",
  },
  categoryLogic: {
    defaultMessage: "Logic",
    id: "tSRJft1T5O",
    description: "Node picker category for branching nodes",
  },
  categoryAi: {
    defaultMessage: "AI",
    id: "wSu7uJGqXh",
    description: "Node picker category for AI nodes",
  },
  categoryFlow: {
    defaultMessage: "Flow",
    id: "+67AlzLOTA",
    description: "Node picker category for looping and flow nodes",
  },
  nodeManualTrigger: {
    defaultMessage: "Manual trigger",
    id: "P95aBR9JKj",
    description: "Catalog title for the manual trigger node",
  },
  nodeManualTriggerHint: {
    defaultMessage: "Start this workflow on demand.",
    id: "nSJhwk2yNA",
    description: "Catalog description for the manual trigger node",
  },
  nodeHttp: {
    defaultMessage: "HTTP Request",
    id: "0nEeKtfNhE",
    description: "Catalog title for the HTTP request node",
  },
  nodeHttpHint: {
    defaultMessage: "Call an HTTP endpoint.",
    id: "0ZtcHWwaTp",
    description: "Catalog description for the HTTP request node",
  },
  nodeIf: {
    defaultMessage: "If",
    id: "5ECVkGCnpd",
    description: "Catalog title for the if/else node",
  },
  nodeIfHint: {
    defaultMessage: "Branch on a condition.",
    id: "N80yyF08UZ",
    description: "Catalog description for the if/else node",
  },
  nodeAi: {
    defaultMessage: "AI Agent",
    id: "mHug8Cyl7z",
    description: "Catalog title for the AI agent stub node",
  },
  nodeAiHint: {
    defaultMessage: "Placeholder agent step with tools.",
    id: "vQvodKQirM",
    description: "Catalog description for the AI agent stub node",
  },
  nodeLoop: {
    defaultMessage: "Loop",
    id: "0dJl0iGob6",
    description: "Catalog title for the for-each placeholder node",
  },
  nodeLoopHint: {
    defaultMessage: "Iterate over a collection sequentially.",
    id: "UBB7DkzFVO",
    description: "Catalog description for the for-each node",
  },
  nodeScheduledTrigger: {
    defaultMessage: "Schedule",
    id: "Q6fTrZjDFK",
    description: "Catalog title for the scheduled trigger node",
  },
  nodeScheduledTriggerHint: {
    defaultMessage: "Run on a recurring schedule.",
    id: "K8Rm2vBkxl",
    description: "Catalog description for the scheduled trigger node",
  },
  nodeGithubTrigger: {
    defaultMessage: "GitHub",
    id: "X6j8iQtiXf",
    description: "Catalog title for the GitHub trigger node",
  },
  nodeGithubTriggerHint: {
    defaultMessage: "Start when a repository event occurs.",
    id: "oJs8Cbpwe6",
    description: "Catalog description for the GitHub trigger node",
  },
  nodeSourceUploadTrigger: {
    defaultMessage: "Source upload",
    id: "3v87yVdwpX",
    description: "Catalog title for the source upload trigger node",
  },
  nodeSourceUploadTriggerHint: {
    defaultMessage: "Start when a source file is uploaded.",
    id: "96dcZwdhGc",
    description: "Catalog description for the source upload trigger node",
  },
  nodeNotifySlack: {
    defaultMessage: "Notify Slack",
    id: "t2I2Yj3t0M",
    description: "Catalog title for the notify Slack action node",
  },
  nodeNotifySlackHint: {
    defaultMessage: "Send a Slack message to a channel.",
    id: "5/GGmNLCh0",
    description: "Catalog description for the notify Slack action node",
  },
  addNode: {
    defaultMessage: "Add node",
    id: "H541+RZh2a",
    description: "Accessible label for the plus control that opens the node picker",
  },
  backToPicker: {
    defaultMessage: "Back",
    id: "OJJq7qIvtH",
    description: "Button to leave node config and return to the picker",
  },
  configTitle: {
    defaultMessage: "Configure step",
    id: "t4mVRTnKLW",
    description: "Right panel heading when a node is selected",
  },
  httpMethod: {
    defaultMessage: "Method",
    id: "42t+jTqT0q",
    description: "HTTP node method field label",
  },
  httpUrl: {
    defaultMessage: "URL",
    id: "k66v97xuuE",
    description: "HTTP node URL field label",
  },
  ifCondition: {
    defaultMessage: "Condition",
    id: "SiAf9HT3yg",
    description: "If node condition field label",
  },
  aiPrompt: {
    defaultMessage: "Prompt",
    id: "DZ8tm3n3xg",
    description: "AI node prompt field label",
  },
  aiModelSlot: {
    defaultMessage: "Chat model",
    id: "m0gQ9lgLTM",
    description: "Disabled AI node slot label for a chat model",
  },
  aiToolsSlot: {
    defaultMessage: "Tools",
    id: "4nvKEU8P6F",
    description: "Disabled AI node slot label for tools",
  },
  stubSlotHint: {
    defaultMessage: "Not wired in this preview",
    id: "TlTcdCU8vl",
    description: "Hint under disabled AI agent configuration slots",
  },
  noConfig: {
    defaultMessage: "This step has no extra settings in the preview.",
    id: "n02KlXlk6i",
    description: "Config panel empty copy for nodes without fields",
  },
  testWorkflow: {
    defaultMessage: "Test workflow",
    id: "7A2BIhpV5s",
    description: "Bottom-center button that runs the fake workflow animation",
  },
  testRunFailed: {
    defaultMessage: "Workflow test run failed.",
    id: "z5dStQCLpf",
    description: "Toast when a server-backed visual workflow test run fails",
  },
  testingWorkflow: {
    defaultMessage: "Testing…",
    id: "yDT7YBlKvk",
    description: "Label on the test button while the fake run is in progress",
  },
  missingTrigger: {
    defaultMessage: "Add a trigger to start the workflow.",
    id: "R4/gdgFOXs",
    description: "Validation message when the canvas has no trigger node",
  },
  multipleTriggers: {
    defaultMessage: "Use a single trigger in this preview.",
    id: "8lYImh+BEP",
    description: "Validation message when more than one trigger is on the canvas",
  },
  orphanNode: {
    defaultMessage: "Connect every step to the workflow.",
    id: "Mepjj5xstx",
    description: "Validation message when a node has no incoming edge",
  },
  invalidEdge: {
    defaultMessage: "Remove edges that point to missing steps.",
    id: "UvtZVrIkJR",
    description: "Validation message when an edge references a missing node",
  },
  invalidTriggerConfig: {
    defaultMessage: "Fix the trigger configuration before activating this workflow.",
    id: "7j13INCpbH",
    description: "Validation message when trigger config is invalid for activation",
  },
  trueHandle: {
    defaultMessage: "true",
    id: "76uDSBNqg0",
    description: "Label on the if-node true output handle",
  },
  falseHandle: {
    defaultMessage: "false",
    id: "kXUdWEZuUt",
    description: "Label on the if-node false output handle",
  },
  saved: {
    defaultMessage: "Saved",
    id: "C6xexxLShL",
    description: "Confirmation after saving a visual workflow",
  },
  saveFailed: {
    defaultMessage: "Could not save workflow",
    id: "vZgNJeOOdN",
    description: "Toast when saving a visual workflow fails",
  },
  activateFailed: {
    defaultMessage: "Could not update workflow status. Use a production trigger before activating.",
    id: "SyXUY/R958",
    description: "Toast when activating a visual workflow fails",
  },
  activated: {
    defaultMessage: "Workflow activated",
    id: "wv8HUfa79G",
    description: "Toast when a visual workflow is activated",
  },
  paused: {
    defaultMessage: "Workflow paused",
    id: "W3kvUxF+V1",
    description: "Toast when a visual workflow is paused",
  },
  forEachCollection: {
    defaultMessage: "Collection expression",
    id: "TSLfOgCp9k",
    description: "Label for for-each collection expression field",
  },
  slackChannelId: {
    defaultMessage: "Slack channel ID",
    id: "ALH+xiJiG8",
    description: "Label for Slack channel id on notify slack node",
  },
  slackMessage: {
    defaultMessage: "Message",
    id: "NGsHVcOyFb",
    description: "Label for Slack message on notify slack node",
  },
  githubRepositoryId: {
    defaultMessage: "GitHub repository ID",
    id: "a1/Cklodwn",
    description: "Label for GitHub installation repository id on trigger node",
  },
  githubBranches: {
    defaultMessage: "Branch patterns",
    id: "IsFQvqwJAO",
    description: "Label for GitHub branch patterns on trigger node",
  },
  scheduleCadence: {
    defaultMessage: "Cadence",
    id: "+KX/fjdtO4",
    description: "Label for schedule cadence on scheduled trigger node",
  },
  sourceUploadProjectId: {
    defaultMessage: "Project ID (optional)",
    id: "ImtoSoLxJY",
    description: "Optional project filter for source upload trigger",
  },
  triggerBadge: {
    defaultMessage: "Trigger",
    id: "vwVyosrRNf",
    description: "Accessible label for the lightning badge on trigger nodes",
  },
});
