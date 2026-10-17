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
  executionChildRuns: {
    defaultMessage: "Child workflow executions",
    id: "TIDKg7QM0N",
    description: "Heading for child workflow runs launched by the selected parent run",
  },
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
  playgroundBadge: {
    defaultMessage: "Playground",
    id: "TzH92UpIsI",
    description: "Badge indicating the visual editor is an interactive playground",
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
  exportMenu: {
    defaultMessage: "Export",
    id: "besNXCgM6P",
    description: "Button that opens the menu for copying or downloading the workflow JSON",
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
  nodeContentSync: {
    defaultMessage: "Content sync",
    id: "TosoMhOGUj",
    description: "Catalog title for the content sync action node",
  },
  nodeContentSyncHint: {
    defaultMessage: "Pull source files into a project and push ready translations back.",
    id: "CBccpuuEIS",
    description: "Catalog description for the content sync action node",
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
  nodeSwitch: {
    defaultMessage: "Switch",
    id: "Qb8e9HBTwT",
    description: "Catalog title for the switch node",
  },
  nodeSwitchHint: {
    defaultMessage: "Route to one of several branches.",
    id: "eGggF69cbr",
    description: "Catalog description for the switch node",
  },
  nodeSet: {
    defaultMessage: "Set fields",
    id: "DQLb5tVkm8",
    description: "Catalog title for the set fields node",
  },
  nodeSetHint: {
    defaultMessage: "Assign values into the workflow context.",
    id: "ZXPdUvtPkF",
    description: "Catalog description for the set fields node",
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
  nodeNotifyEmail: {
    defaultMessage: "Send email",
    id: "EfYrVZH3dW",
    description: "Catalog title for the notify email action node",
  },
  nodeNotifyEmailHint: {
    defaultMessage: "Send a transactional email through Resend or SendGrid.",
    id: "Crp/piiRbB",
    description: "Catalog description for the notify email action node",
  },
  addNode: {
    defaultMessage: "Add node",
    id: "H541+RZh2a",
    description: "Accessible label for the plus control that opens the node picker",
  },
  addNodeFromHandle: {
    defaultMessage: "Add node from {handle}",
    id: "8UCB2eKoiL",
    description: "Accessible label for a per-output quick-add control on a node handle",
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
  stepSettingsTabs: {
    defaultMessage: "Step settings",
    id: "kzH21n29Rp",
    description:
      "Accessible name of the tabs that switch between the parts of a workflow step's settings",
  },
  ifStepFails: {
    defaultMessage: "If this step fails",
    id: "wBBk0AbwLo",
    description:
      "Heading of the collapsed part of a workflow step's settings that holds its error behaviour",
  },
  insertField: {
    defaultMessage: "Insert a field into {label}",
    id: "7zsudhIRfP",
    description:
      "Accessible name of the button that puts a field of an earlier workflow step into a setting's text; {label} is the setting",
  },
  insertFieldTitle: {
    defaultMessage: "Insert a field from an earlier step",
    id: "it+CxLEVkH",
    description:
      "Tooltip of the button that puts a field of an earlier workflow step into a setting's text",
  },
  insertFieldSearch: {
    defaultMessage: "Find a field",
    id: "V2whWmooom",
    description: "Search box of the menu that lists the fields of earlier workflow steps",
  },
  insertFieldEmpty: {
    defaultMessage: "No fields from earlier steps.",
    id: "u9Qg5J09WM",
    description: "Shown when the menu of fields from earlier workflow steps has nothing to list",
  },
  fieldReferenceUnavailable: {
    defaultMessage: "{reference} cannot be read here: that step does not run before this one.",
    id: "WYSFWtMM/n",
    description:
      "Tooltip of a field pill in a workflow step's setting whose step is gone or runs later; reference is the step and field, such as 'HTTP request › status'",
  },
  connectOnCanvas: {
    defaultMessage: "Connect this on the canvas.",
    id: "hLqs+EeEG8",
    description:
      "Shown in place of the editor of a workflow step setting that only a data wire can feed",
  },
  disconnectInput: {
    defaultMessage: "Disconnect",
    id: "kEhYEqOX8G",
    description: "Button that removes the data wire feeding a workflow step's setting",
  },
  removeBinding: {
    defaultMessage: "Remove",
    id: "cRhF5oMlHA",
    description: "Button that removes the stored binding feeding a workflow step's setting",
  },
  fixedValueSource: {
    defaultMessage: "Fixed value",
    id: "Dhw0m5NXT1",
    description:
      "Name of a stored literal binding shown as the source of a workflow step's setting",
  },
  templateSource: {
    defaultMessage: "Template",
    id: "2+el5hYSzQ",
    description:
      "Name of a stored template binding shown as the source of a workflow step's setting",
  },
  credentialSource: {
    defaultMessage: "Saved credential",
    id: "FWjftu2kiI",
    description:
      "Name of a stored credential binding shown as the source of a workflow step's setting",
  },
  configurationTab: {
    defaultMessage: "Configuration",
    id: "GxutMPC4gp",
    description: "Tab of a workflow step's settings that holds the step's own form",
  },
  outputsTab: {
    defaultMessage: "Outputs",
    id: "mqq6dTwRZM",
    description: "Visual workflow editor control",
  },
  testTab: {
    defaultMessage: "Test",
    id: "VjG0Zt9Hr8",
    description:
      "Tab of a workflow step's settings that holds the values the step uses in a test run",
  },
  testDataTriggerDescription: {
    defaultMessage:
      "The event this trigger passes on when you test the workflow. Real runs use the real event.",
    id: "kC1soSUZq7",
    description: "Explains the Test tab of a workflow trigger",
  },
  testDataActionDescription: {
    defaultMessage:
      "What this step returns in a test run while it uses its test data, in place of doing its work. Nothing is made up: a value left empty stops the test.",
    id: "kHvyGVv5TJ",
    description: "Explains the Test tab of a workflow step that calls out to another service",
  },
  testDataFillExamples: {
    defaultMessage: "Fill with examples",
    id: "kN6qwzFh/5",
    description:
      "Button on a workflow step's Test tab that writes example values into its empty fields",
  },
  testDataUseLastRun: {
    defaultMessage: "Use last run",
    id: "JVogogkuBP",
    description:
      "Button on a workflow step's Test tab that copies the step's output from the last run",
  },
  testDataClear: {
    defaultMessage: "Clear",
    id: "1U9PZ5VcN2",
    description: "Button on a workflow step's Test tab that removes all its test values",
  },
  testDataOptional: {
    defaultMessage: "optional",
    id: "Bb2iyK74xB",
    description: "Marks a test value a workflow step can do without",
  },
  testDataNeeded: {
    defaultMessage: "Needed for a test run.",
    id: "zRCtWtCl4W",
    description: "Under an empty required test value of a workflow step",
  },
  testDataReadByStep: {
    defaultMessage: "Another step reads this, so a test run needs it.",
    id: "NbAZVkN3TH",
    description: "Under an empty optional test value that another workflow step uses",
  },
  testDataNotSet: {
    defaultMessage: "Not set",
    id: "wQGnFQYS2q",
    description: "Placeholder of a true or false test value that has no value yet",
  },
  testDataChooseProject: {
    defaultMessage: "Choose a project",
    id: "zDoKlB01Q1",
    description: "Placeholder of the project picker on a workflow trigger's Test tab",
  },
  testDataJson: {
    defaultMessage: "All test data (JSON)",
    id: "T17lvAfQL0",
    description: "Label of the box that shows all of a workflow step's test values as JSON",
  },
  testDataInvalidJson: {
    defaultMessage: "Enter valid JSON.",
    id: "JQuMZXhBtU",
    description: "Under a test value of a workflow step whose JSON cannot be read",
  },
  testRunMissingData: {
    defaultMessage:
      "{count, plural, one {A test value is missing} other {# test values are missing}}",
    id: "c43lsobCtO",
    description: "Toast when a workflow test run is not started because test values are not set",
  },
  testRunMissingDataFirst: {
    defaultMessage: "Set {path} on the Test tab of {step}.",
    id: "ch9gwSSThi",
    description:
      "Under the missing test values toast: the first one to set. {path} is a field name, {step} a step's name",
  },
  testRunMissingDataShow: {
    defaultMessage: "Show",
    id: "mqYq/LYRBZ",
    description: "Action of the missing test values toast that opens the step's Test tab",
  },
  testRunCouldNotStart: {
    defaultMessage: "The test run could not start.",
    id: "94INRlGgGA",
    description: "Toast when the request that starts a workflow test run fails",
  },
  testSettingsHint: {
    defaultMessage:
      "Each trigger and each step that calls out has a Test tab in its settings for the values a test run uses.",
    id: "0pyGkDDDgZ",
    description: "In the test settings popover of the workflow editor, where test values are set",
  },
  useRunAsTestData: {
    defaultMessage: "Use as test data",
    id: "CQU1/0C8er",
    description: "Button on a past workflow run that copies its values into the steps' test data",
  },
  usedRunAsTestData: {
    defaultMessage:
      "Test data taken from this run for {count, plural, one {# step} other {# steps}}.",
    id: "1Dpcm8IxPm",
    description: "Toast after a past workflow run's values were copied into the steps' test data",
  },
  triggerType: {
    defaultMessage: "Trigger",
    id: "cSkIY27SIk",
    description: "Label for changing the selected visual workflow trigger type",
  },
  deleteStep: {
    defaultMessage: "Delete step",
    id: "d/T+F7hGuw",
    description: "Button that removes the selected node from the visual workflow canvas",
  },
  deleteWorkflow: {
    defaultMessage: "Delete",
    id: "nqnh5BEInQ",
    description: "Button that deletes the current visual workflow",
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
  httpQueryParams: {
    defaultMessage: "Query parameters",
    id: "ZlYq8eSzg2",
    description: "HTTP node query parameters label",
  },
  httpHeaders: {
    defaultMessage: "Headers",
    id: "UPSrigC8qi",
    description: "HTTP node headers label",
  },
  httpBodyType: {
    defaultMessage: "Body type",
    id: "gXUXFoSBuO",
    description: "HTTP node body type label",
  },
  httpBodyNone: {
    defaultMessage: "None",
    id: "jtMuzhGEyo",
    description: "HTTP node body type none option",
  },
  httpBodyJson: {
    defaultMessage: "JSON",
    id: "n5goMj2vzm",
    description: "HTTP node body type json option",
  },
  httpBodyText: {
    defaultMessage: "Text",
    id: "8Xv6VRwnt8",
    description: "HTTP node body type text option",
  },
  httpBody: {
    defaultMessage: "Body",
    id: "Ajr/yjqPyf",
    description: "HTTP node body field label",
  },
  httpAuthType: {
    defaultMessage: "Authentication",
    id: "YHVrBzelKI",
    description: "HTTP node auth type label",
  },
  httpAuthNone: {
    defaultMessage: "None",
    id: "LfRnarhSYl",
    description: "HTTP node auth none option",
  },
  httpAuthBearer: {
    defaultMessage: "Bearer token",
    id: "VaBWbObFr8",
    description: "HTTP node bearer auth option",
  },
  httpAuthApiKey: {
    defaultMessage: "API key",
    id: "JxY8wqGfw1",
    description: "HTTP node api key auth option",
  },
  httpAuthToken: {
    defaultMessage: "Credential ID",
    id: "LDHGi8vihl",
    description: "HTTP node auth token label",
  },
  httpAuthHeaderName: {
    defaultMessage: "Header name",
    id: "GYOEi48Bxv",
    description: "HTTP node api key header name label",
  },
  httpParseJson: {
    defaultMessage: "Parse JSON response",
    id: "2tQhE9LloD",
    description: "HTTP node parse json checkbox label",
  },
  httpFailOnError: {
    defaultMessage: "Fail on HTTP error status",
    id: "HCpKchokfS",
    description: "HTTP node fail on error checkbox label",
  },
  onErrorLabel: {
    defaultMessage: "On error",
    id: "NFSiCA4x/F",
    description: "Label for node error behavior select",
  },
  onErrorStop: {
    defaultMessage: "Stop workflow",
    id: "lPNvi3t9/d",
    description: "Stop workflow on node error",
  },
  onErrorContinue: {
    defaultMessage: "Continue workflow",
    id: "1GLSyoUT4Z",
    description: "Continue workflow on node error",
  },
  onErrorBranch: {
    defaultMessage: "Error branch",
    id: "UJFX+3Y3fz",
    description: "Route to error branch on node error",
  },
  errorHandle: {
    defaultMessage: "error",
    id: "nYOxYYV5jF",
    description: "Label on error output handle",
  },
  eachHandle: {
    defaultMessage: "Each item",
    id: "7eZfUxSh+m",
    description: "Workflow loop body connection",
  },
  doneHandle: {
    defaultMessage: "Done",
    id: "zZIbqHg71N",
    description: "Workflow loop completion connection",
  },
  nodeRetry: {
    defaultMessage: "Retry",
    id: "2RORR1xT6r",
    description: "Retry policy node title",
  },
  nodeWait: {
    defaultMessage: "Wait",
    id: "nncYBDQUwE",
    description: "Wait node title",
  },
  nodeWaitHint: {
    defaultMessage: "Pause until a duration, timestamp, or condition",
    id: "5ZZS0Al3rv",
    description: "Wait node picker hint",
  },
  nodeStop: {
    defaultMessage: "Stop workflow",
    id: "3zOQAJ9ZJz",
    description: "Catalog title for the terminal workflow stop node",
  },
  nodeStopHint: {
    defaultMessage: "Complete or intentionally cancel this workflow.",
    id: "iBvzNp8B3k",
    description: "Catalog description for the terminal workflow stop node",
  },
  nodeReturn: {
    defaultMessage: "Return outputs",
    id: "BRru1MZaa7",
    description: "Catalog title for the terminal workflow return node",
  },
  nodeReturnHint: {
    defaultMessage: "Complete this workflow with declared typed outputs.",
    id: "mrbQRCFXKI",
    description: "Catalog description for the terminal workflow return node",
  },
  nodeFail: {
    defaultMessage: "Fail workflow",
    id: "UYOEsTHp00",
    description: "Catalog title for the terminal workflow failure node",
  },
  nodeFailHint: {
    defaultMessage: "Stop with a controlled error code and safe message.",
    id: "jDzOaWf1E5",
    description: "Catalog description for the terminal workflow failure node",
  },
  stopOutcome: {
    defaultMessage: "Outcome",
    id: "pesQwlzvp0",
    description: "Stop workflow outcome field",
  },
  stopCompleted: {
    defaultMessage: "Complete successfully",
    id: "pjmwxFyZ2z",
    description: "Successful Stop outcome",
  },
  stopCancelled: {
    defaultMessage: "Cancel intentionally",
    id: "3hgvf7DCgl",
    description: "Cancelled Stop outcome",
  },
  stopReason: {
    defaultMessage: "Reason (optional)",
    id: "1X3/JFUGHK",
    description: "Stop workflow reason field",
  },
  returnOutputs: {
    defaultMessage: "Returned outputs",
    id: "nAUAvUF3jq",
    description: "Return workflow output list",
  },
  returnOutputsEmpty: {
    defaultMessage: "No outputs declared. The workflow will return successfully without data.",
    id: "PcwPy1ufB6",
    description: "Empty Return output list help",
  },
  returnOutputName: {
    defaultMessage: "Returned output {index}",
    id: "dKnZgBqrxq",
    description: "Return output name field",
  },
  returnOutputType: {
    defaultMessage: "Returned output {index} type",
    id: "L1do6DT9ul",
    description: "Return output type field",
  },
  addReturnOutput: {
    defaultMessage: "Add returned output",
    id: "Shn4LOznrH",
    description: "Add Return output button",
  },
  removeReturnOutput: {
    defaultMessage: "Remove returned output {index}",
    id: "EHt7HrHrIe",
    description: "Remove Return output button",
  },
  failErrorCode: {
    defaultMessage: "Error code",
    id: "eXkQXUV5Ys",
    description: "Controlled failure error code field",
  },
  failMessage: {
    defaultMessage: "Safe error message",
    id: "EgYdnRGDaG",
    description: "Controlled failure safe message field",
  },
  nodeMerge: {
    defaultMessage: "Merge",
    id: "c0/sujExf3",
    description: "Merge node title",
  },
  nodeMergeHint: {
    defaultMessage: "Coordinate multiple incoming execution paths.",
    id: "xwmJvqOv1C",
    description: "Merge node picker hint",
  },
  nodeSequence: {
    defaultMessage: "Sequence",
    id: "vp7tRvtQmV",
    description: "Sequence node title",
  },
  nodeSequenceHint: {
    defaultMessage: "Dispatch execution paths in a configured order.",
    id: "4cYBnVImbP",
    description: "Sequence node picker hint",
  },
  nodeTryCatch: {
    defaultMessage: "Try / Catch",
    id: "F5g64/zxdN",
    description: "Visual workflow Try / Catch node title",
  },
  nodeTryCatchHint: {
    defaultMessage: "Handle failures from a bounded execution region",
    id: "X5HXzEgA4e",
    description: "Visual workflow Try / Catch node picker hint",
  },
  nodeCallWorkflow: {
    defaultMessage: "Call workflow",
    id: "AX4bE25lbf",
    description: "Visual workflow Call Workflow node title",
  },
  nodeCallWorkflowHint: {
    defaultMessage: "Run a pinned version of a reusable workflow.",
    id: "EIF7eE+7GJ",
    description: "Visual workflow Call Workflow node picker hint",
  },
  sequenceOutputs: {
    defaultMessage: "Execution outputs",
    id: "y+ijUpauzH",
    description: "Sequence execution output list",
  },
  sequenceOutputsEmpty: {
    defaultMessage: "No outputs configured.",
    id: "9DlFb+wOTr",
    description: "Message shown when a Sequence has no outputs",
  },
  sequenceOutputLabel: {
    defaultMessage: "Output {index}",
    id: "zljXhBmvix",
    description: "Sequence execution output label",
  },
  addSequenceOutput: {
    defaultMessage: "Add output",
    id: "NVCqz7i9kK",
    description: "Add a Sequence execution output",
  },
  removeSequenceOutput: {
    defaultMessage: "Remove output {index}",
    id: "NJNmXs5MqR",
    description: "Remove a Sequence execution output",
  },
  moveSequenceOutputUp: {
    defaultMessage: "Move output {index} up",
    id: "OKuhgUJXOJ",
    description: "Move a Sequence output upward",
  },
  moveSequenceOutputDown: {
    defaultMessage: "Move output {index} down",
    id: "exjYr2VS99",
    description: "Move a Sequence output downward",
  },
  mergeMode: {
    defaultMessage: "Merge mode",
    id: "GafA21RnmS",
    description: "Merge node mode field",
  },
  mergeModeAll: {
    defaultMessage: "All selected paths",
    id: "JmHjqkDgSi",
    description: "Wait for all selected Merge inputs",
  },
  mergeModeAny: {
    defaultMessage: "Any selected path",
    id: "CVYpUuUKdZ",
    description: "Continue after any selected Merge input",
  },
  mergeModeFirstSuccess: {
    defaultMessage: "First successful path",
    id: "r9FOHZyK+0",
    description: "Continue after the first successful Merge input",
  },
  mergeInputs: {
    defaultMessage: "Execution inputs",
    id: "KZhZYT6je6",
    description: "Merge execution input list",
  },
  mergeInputName: {
    defaultMessage: "Input {index}",
    id: "bL+wwPFNwO",
    description: "Merge execution input name placeholder",
  },
  addMergeInput: {
    defaultMessage: "Add input",
    id: "rKDq5xVpUS",
    description: "Add a Merge execution input",
  },
  removeMergeInput: {
    defaultMessage: "Remove input {index}",
    id: "FdmB8M+qZc",
    description: "Remove a Merge execution input",
  },
  moveMergeInputUp: {
    defaultMessage: "Move input {index} up",
    id: "V99Pmv6BsN",
    description: "Move a Merge input upward",
  },
  moveMergeInputDown: {
    defaultMessage: "Move input {index} down",
    id: "QugOsjCCw4",
    description: "Move a Merge input downward",
  },
  mergeTimeoutMs: {
    defaultMessage: "Timeout (ms, optional)",
    id: "M1ITBSXE+Q",
    description: "Optional Merge timeout",
  },
  completedHandle: {
    defaultMessage: "Completed",
    id: "w2tot+OYiM",
    description: "Wait completion output",
  },
  timedOutHandle: {
    defaultMessage: "Timed out",
    id: "1XJEkWqFT6",
    description: "Wait timeout output",
  },
  waitMode: {
    defaultMessage: "Wait mode",
    id: "bUh5gPU+mn",
    description: "Wait node mode field",
  },
  waitModeDuration: {
    defaultMessage: "Duration",
    id: "CPWLg67zI3",
    description: "Wait for a duration mode",
  },
  waitModeTimestamp: {
    defaultMessage: "Until timestamp",
    id: "EgoeBfG+CV",
    description: "Wait until a timestamp mode",
  },
  waitModeCondition: {
    defaultMessage: "Until condition",
    id: "4B/yIypHTz",
    description: "Wait until a condition mode",
  },
  waitDurationMs: {
    defaultMessage: "Duration (ms)",
    id: "m4Ahgxr1sR",
    description: "Wait duration in milliseconds",
  },
  waitTimestamp: {
    defaultMessage: "Timestamp",
    id: "bxWXLOi+RW",
    description: "Absolute timestamp to resume a workflow",
  },
  waitCondition: {
    defaultMessage: "Condition",
    id: "v1chSgy0BK",
    description: "Condition polled by a Wait node",
  },
  waitPollingIntervalMs: {
    defaultMessage: "Polling interval (ms)",
    id: "r3XB1uKkxA",
    description: "Wait condition polling interval",
  },
  waitTimeoutMs: {
    defaultMessage: "Timeout (ms)",
    id: "ivmGcv+k23",
    description: "Maximum condition wait duration",
  },
  nodeRetryHint: {
    defaultMessage: "Re-run a body region with backoff",
    id: "L+aQftO9Id",
    description: "Retry policy node picker hint",
  },
  attemptHandle: {
    defaultMessage: "Attempt",
    id: "akMqVdhYbU",
    description: "Retry body connection",
  },
  succeededHandle: {
    defaultMessage: "Succeeded",
    id: "r9cem/tyVw",
    description: "Retry success exit",
  },
  exhaustedHandle: {
    defaultMessage: "Exhausted",
    id: "gJ4nnkkpNU",
    description: "Retry exhaustion exit",
  },
  tryHandle: {
    defaultMessage: "Try",
    id: "rpDF9CZYBO",
    description: "Try / Catch protected region connection",
  },
  successHandle: {
    defaultMessage: "Success",
    id: "J3yZ0R6Av/",
    description: "Try / Catch success exit",
  },
  catchHandle: {
    defaultMessage: "Catch",
    id: "RwXMampnc5",
    description: "Try / Catch handled failure exit",
  },
  finallyHandle: {
    defaultMessage: "Finally",
    id: "0T2mAMiIVh",
    description: "Try / Catch final exit",
  },
  invalidTryCatchRegion: {
    defaultMessage: "Connect a valid, bounded Try region.",
    id: "HafJerv4wF",
    description: "Validation issue for an invalid Try / Catch region",
  },
  overlappingTryCatchRegion: {
    defaultMessage: "Try / Catch regions cannot overlap ambiguously.",
    id: "aB/GAdDVH3",
    description: "Validation issue for overlapping Try / Catch regions",
  },
  retryMaxAttempts: {
    defaultMessage: "Max attempts",
    id: "+fsq3dqMqp",
    description: "Retry policy max attempts field",
  },
  retryInitialDelay: {
    defaultMessage: "Initial delay (ms)",
    id: "oE/d+yPnQC",
    description: "Retry initial delay field",
  },
  retryBackoffMultiplier: {
    defaultMessage: "Backoff multiplier",
    id: "HoA+8TKVfD",
    description: "Retry exponential backoff multiplier",
  },
  retryAcknowledgeDuplicateRisk: {
    defaultMessage: "Allow duplicate side effects on retry",
    id: "buLiPCDEq1",
    description: "Retry non-idempotent acknowledgement checkbox",
  },
  nestedRetry: {
    defaultMessage: "Nested retry regions are not supported.",
    id: "E+E8CAWOEz",
    description: "Validation issue for nested retry",
  },
  invalidRetry: {
    defaultMessage: "Fix the retry region wiring and body membership.",
    id: "9OQEks5YGx",
    description: "Validation issue for invalid retry graph",
  },
  retryForEachNesting: {
    defaultMessage: "Retry and For each cannot wrap each other.",
    id: "7pn2UnpCsA",
    description: "Validation issue for retry/for each nesting",
  },
  nonIdempotentRetry: {
    defaultMessage: "Acknowledge duplicate risk or add idempotency for actions in the retry body.",
    id: "/8/pZ5ze7R",
    description: "Validation issue for non-idempotent retry body",
  },
  invalidRetryPolicy: {
    defaultMessage: "Retry policy values are out of range.",
    id: "bHCCUqEOmY",
    description: "Validation issue for retry policy config",
  },
  switchExpression: {
    defaultMessage: "Expression",
    id: "vKVR+7LwqC",
    description: "Switch node expression field label",
  },
  switchCases: {
    defaultMessage: "Cases",
    id: "0vaHgLAQkS",
    description: "Switch node cases section label",
  },
  switchCaseValue: {
    defaultMessage: "Case {index}",
    id: "bE+/1fvD7l",
    description: "Placeholder for switch case value input",
  },
  addSwitchCase: {
    defaultMessage: "Add case",
    id: "n4hpRZLl37",
    description: "Button to add a switch case",
  },
  removeSwitchCase: {
    defaultMessage: "Remove case {index}",
    id: "FcPrCbZm2T",
    description: "Accessible label for removing a numbered switch case",
  },
  switchCaseHandle: {
    defaultMessage: "Case {index}",
    id: "04QgRuZsOk",
    description: "Label for numbered switch output handle",
  },
  switchDefaultHandle: {
    defaultMessage: "default",
    id: "F9TbntyBsV",
    description: "Label for switch default output handle",
  },
  setAssignments: {
    defaultMessage: "Field assignments",
    id: "VMyrNr9Y/C",
    description: "Set node assignments section label",
  },
  setFieldName: {
    defaultMessage: "Field name",
    id: "UWp9ixlYUw",
    description: "Set node field name placeholder",
  },
  setFieldValue: {
    defaultMessage: "Value",
    id: "B6FNmz1hFv",
    description: "Set node field value placeholder",
  },
  keyValueKey: {
    defaultMessage: "Key",
    id: "Is9VBW0Pl3",
    description: "Key placeholder for key-value editor",
  },
  keyValueValue: {
    defaultMessage: "Value",
    id: "umK6yIapNV",
    description: "Value placeholder for key-value editor",
  },
  addKeyValuePair: {
    defaultMessage: "Add row",
    id: "fYm7crAvvb",
    description: "Button to add key-value row",
  },
  nodeOutputTitle: {
    defaultMessage: "Last output",
    id: "I4MDdItT7N",
    description: "Heading for inline node output inspector",
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
    defaultMessage: "Uses the workspace AI Engine.",
    id: "GOCzWjzueG",
    description: "Hint under disabled AI agent configuration slots",
  },
  noConfig: {
    defaultMessage:
      "This step has nothing to set up. Its outputs are on the Outputs tab, and its sample event on the Test tab.",
    id: "iUENcP8UXx",
    description: "Config panel empty copy for a manual trigger, which has no fields",
  },
  noSettings: {
    defaultMessage: "This step has nothing to set up. Its outputs are on the Outputs tab.",
    id: "KbaeWqdfEa",
    description: "Config panel empty copy for a step without fields",
  },
  editBindingAsText: {
    defaultMessage: "Edit as text",
    id: "X+6eLCg8p5",
    description:
      "Button that turns a stored fixed value or template of a workflow step's setting into the setting's own text",
  },
  testSettings: {
    defaultMessage: "Test settings",
    id: "mhtqPj5f5v",
    description:
      "Name of the button and popover beside Test workflow that holds the live test switch",
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
    defaultMessage: "Use a single trigger in each workflow.",
    id: "QYO84wfpXR",
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
  nestedForEach: {
    defaultMessage: "Nested For Each loops are not supported yet.",
    id: "pyS8Vyq98T",
    description: "Validation message when a for-each loop contains another for-each loop",
  },
  invalidNodeConfig: {
    defaultMessage: "Fix the step configuration before saving this workflow.",
    id: "2963Vncu1b",
    description: "Validation message when a non-trigger node config is invalid",
  },
  issueFieldRequired: {
    defaultMessage: "{field} is required.",
    id: "5PqiPGaWW/",
    description:
      "Validation message when a setting or input of a step is empty. {field} is the setting's key, such as channelId",
  },
  issueFieldInvalid: {
    defaultMessage: "{field} is not valid.",
    id: "q6TvmN/FEl",
    description:
      "Validation message when a setting or input of a step has a value that cannot be used. {field} is the setting's key, such as timezone",
  },
  issuePosition: {
    defaultMessage: "Issue {current} of {total}",
    id: "2fPK5TW6va",
    description:
      "Which of the workflow's validation issues is shown, above the issue. {current} and {total} are numbers",
  },
  previousIssue: {
    defaultMessage: "Previous issue",
    id: "GSFsE42qE6",
    description: "Button that shows the previous validation issue of a visual workflow",
  },
  nextIssue: {
    defaultMessage: "Next issue",
    id: "We3SJU9IT4",
    description: "Button that shows the next validation issue of a visual workflow",
  },
  stepHasIssue: {
    defaultMessage: "This step has a problem",
    id: "22szuz+pVL",
    description: "Label of the warning mark on a canvas step that a validation issue is about",
  },
  showStepOnCanvas: {
    defaultMessage: "Show on canvas",
    id: "1oDvFz2774",
    description:
      "Button beside a validation issue that selects its step and moves the canvas to it",
  },
  issueLiteralCredential: {
    defaultMessage:
      "Use a saved credential for secret values instead of typing them into the step.",
    id: "mCqI44HE9m",
    description:
      "Validation message when an HTTP step holds a token or secret header as plain text",
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
  emailProvider: {
    defaultMessage: "Provider",
    id: "wOs50wH/pI",
    description: "Label for email provider on notify email node",
  },
  emailProviderResend: {
    defaultMessage: "Resend",
    id: "thK9pQi9Ut",
    description: "Resend option on notify email node",
  },
  emailProviderSendgrid: {
    defaultMessage: "SendGrid",
    id: "ycIxrY94pB",
    description: "SendGrid option on notify email node",
  },
  emailFrom: {
    defaultMessage: "From address",
    id: "I+GDyUI23h",
    description: "Label for sender address on notify email node",
  },
  emailRecipients: {
    defaultMessage: "Recipients",
    id: "IVA7S1Pi6e",
    description: "Label for recipients on notify email node",
  },
  emailSubject: {
    defaultMessage: "Subject",
    id: "oLwNToY1hg",
    description: "Label for subject on notify email node",
  },
  emailMessage: {
    defaultMessage: "Message",
    id: "jApfF7IUNd",
    description: "Label for message body on notify email node",
  },
  githubRepository: {
    defaultMessage: "GitHub repository",
    id: "fi4BYzKe5I",
    description: "Label for the GitHub repository picker on the trigger node",
  },
  selectRepository: {
    defaultMessage: "Select a repository",
    id: "U6xvadCYhH",
    description: "Placeholder when no GitHub repository is selected",
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
  githubEvents: {
    defaultMessage: "Events",
    id: "BFGbjLDQqh",
    description: "Label for GitHub events on trigger node",
  },
  githubEventPush: {
    defaultMessage: "Push",
    id: "h+QA+7BAPb",
    description: "GitHub push event checkbox label",
  },
  githubEventPullRequest: {
    defaultMessage: "Pull request",
    id: "qxdCTJo5wL",
    description: "GitHub pull request event checkbox label",
  },
  scheduleCadence: {
    defaultMessage: "Cadence",
    id: "+KX/fjdtO4",
    description: "Label for schedule cadence on scheduled trigger node",
  },
  scheduleHourly: {
    defaultMessage: "Hourly",
    id: "fB8k9m+qMa",
    description: "Hourly schedule cadence option",
  },
  scheduleDaily: {
    defaultMessage: "Daily",
    id: "yoc2jz/v8a",
    description: "Daily schedule cadence option",
  },
  scheduleWeekly: {
    defaultMessage: "Weekly",
    id: "xM1UVGq/9v",
    description: "Weekly schedule cadence option",
  },
  scheduleHour: {
    defaultMessage: "Hour (UTC)",
    id: "f30lOJsKLX",
    description: "Label for schedule hour field",
  },
  scheduleDayOfWeek: {
    defaultMessage: "Day of week",
    id: "2HD/xUOuDn",
    description: "Label for weekly schedule day field",
  },
  scheduleTimezone: {
    defaultMessage: "Timezone",
    id: "TQPbZg8LsO",
    description: "Label for schedule timezone field",
  },
  scheduleSunday: {
    defaultMessage: "Sunday",
    id: "IDmuYPzcIE",
    description: "Sunday option for weekly schedule",
  },
  scheduleMonday: {
    defaultMessage: "Monday",
    id: "vy+5ISEhNS",
    description: "Monday option for weekly schedule",
  },
  scheduleTuesday: {
    defaultMessage: "Tuesday",
    id: "aewkbG6Jn7",
    description: "Tuesday option for weekly schedule",
  },
  scheduleWednesday: {
    defaultMessage: "Wednesday",
    id: "QVQzu9FFdo",
    description: "Wednesday option for weekly schedule",
  },
  scheduleThursday: {
    defaultMessage: "Thursday",
    id: "oF3U8SKzm3",
    description: "Thursday option for weekly schedule",
  },
  scheduleFriday: {
    defaultMessage: "Friday",
    id: "JLv9f0uEE2",
    description: "Friday option for weekly schedule",
  },
  scheduleSaturday: {
    defaultMessage: "Saturday",
    id: "yN3IaRAmIM",
    description: "Saturday option for weekly schedule",
  },
  sourceUploadProject: {
    defaultMessage: "Project",
    id: "K+mXcYVMPy",
    description: "Project picker label for the source upload trigger",
  },
  anyProject: {
    defaultMessage: "Any project",
    id: "SgSG4ibcXn",
    description: "Option that matches source uploads from every project",
  },
  sourceUploadProjectId: {
    defaultMessage: "Project ID (optional)",
    id: "ImtoSoLxJY",
    description: "Optional project filter for source upload trigger",
  },
  contentSyncProject: {
    defaultMessage: "Project",
    id: "nefEZhjUv2",
    description: "Project picker label on the content sync action",
  },
  contentSyncProvider: {
    defaultMessage: "Source",
    id: "Lti2GaN1c6",
    description: "Provider picker label on the content sync action",
  },
  contentSyncResource: {
    defaultMessage: "Resource",
    id: "ZmIJvp0JMb",
    description: "Repository or CMS space picker on the content sync action",
  },
  contentSyncProviderFolder: {
    defaultMessage: "Provider folder",
    id: "SxwdCDaQLJ",
    description: "Folder on the connected source for content sync",
  },
  contentSyncProjectFolder: {
    defaultMessage: "Project folder",
    id: "8R777UILAL",
    description: "Folder inside the Hyperlocalise project for content sync",
  },
  selectProject: {
    defaultMessage: "Select a project",
    id: "vFjxVFIzmT",
    description: "Placeholder when no project is selected for content sync",
  },
  selectProvider: {
    defaultMessage: "Select a source",
    id: "NkvC0geGcc",
    description: "Placeholder when no content sync provider is selected",
  },
  selectResource: {
    defaultMessage: "Select a resource",
    id: "rXuCG4x28U",
    description: "Placeholder when no repository or CMS space is selected",
  },
  providerGithub: {
    defaultMessage: "GitHub",
    id: "IC/L6/ETfl",
    description: "GitHub provider label on the content sync action",
  },
  providerGitlab: {
    defaultMessage: "GitLab",
    id: "V0L6vHYKYa",
    description: "GitLab provider label on the content sync action",
  },
  providerContentful: {
    defaultMessage: "Contentful",
    id: "bWR03+Qpir",
    description: "Contentful provider label on the content sync action",
  },
  providerIntercom: {
    defaultMessage: "Intercom",
    id: "X0ufvWkg5R",
    description: "Intercom provider label on the content sync action",
  },
  triggerBadge: {
    defaultMessage: "Trigger",
    id: "vwVyosrRNf",
    description: "Accessible label for the lightning badge on trigger nodes",
  },
  undoTooltip: {
    defaultMessage: "Undo {action}",
    id: "h9hqEywbg6",
    description:
      "Tooltip of the visual editor's undo button; {action} is what the step did, such as 'adding a step'",
  },
  redoTooltip: {
    defaultMessage: "Redo {action}",
    id: "zfWAg4fbJG",
    description:
      "Tooltip of the visual editor's redo button; {action} is what the step did, such as 'adding a step'",
  },
  undoNothing: {
    defaultMessage: "Nothing to undo",
    id: "bwvCqV1CkU",
    description: "Tooltip of the visual editor's undo button when there is no step to take back",
  },
  redoNothing: {
    defaultMessage: "Nothing to redo",
    id: "2Gc1+aVeLn",
    description: "Tooltip of the visual editor's redo button when there is no step to put back",
  },
  undoActionAdd: {
    defaultMessage: "{count, plural, one {adding a step} other {adding # steps}}",
    id: "+HijiNTvvx",
    description: "What an undo step did, after 'Undo' or 'Redo': nodes were added to the workflow",
  },
  undoActionRemove: {
    defaultMessage: "{count, plural, one {removing a step} other {removing # steps}}",
    id: "mcpumDgw0v",
    description:
      "What an undo step did, after 'Undo' or 'Redo': nodes were removed from the workflow",
  },
  undoActionConnect: {
    defaultMessage: "connecting steps",
    id: "Fm7MxbuOiN",
    description: "What an undo step did, after 'Undo' or 'Redo': an edge was added",
  },
  undoActionDisconnect: {
    defaultMessage: "disconnecting steps",
    id: "t5xBIlTLwl",
    description: "What an undo step did, after 'Undo' or 'Redo': an edge was removed",
  },
  undoActionMove: {
    defaultMessage: "{count, plural, one {moving a step} other {moving # steps}}",
    id: "ZZerbQkD+z",
    description: "What an undo step did, after 'Undo' or 'Redo': nodes were moved on the canvas",
  },
  undoActionConfigure: {
    defaultMessage: "changing a step's settings",
    id: "gl6BIyGKNo",
    description: "What an undo step did, after 'Undo' or 'Redo': a node's settings were changed",
  },
  undoActionRetype: {
    defaultMessage: "changing a step's type",
    id: "enQcoq4887",
    description: "What an undo step did, after 'Undo' or 'Redo': a node was given another type",
  },
  undoActionRename: {
    defaultMessage: "renaming the workflow",
    id: "WdGY58H2dj",
    description: "What an undo step did, after 'Undo' or 'Redo': the workflow's name was changed",
  },
  undoActionEdit: {
    defaultMessage: "the last change",
    id: "8MkwvIyeaM",
    description:
      "What an undo step did, after 'Undo' or 'Redo', when it changed several things at once",
  },
  undoActionAssistant: {
    defaultMessage: "the assistant's changes",
    id: "5dSB/hCLGx",
    description:
      "What an undo step did, after 'Undo' or 'Redo': the assistant changed the workflow",
  },
  stepRunsForReal: {
    defaultMessage: "Runs for real in test runs",
    id: "YkGSzDTzNH",
    description:
      "Label of the mark on a canvas step that a test run runs for real, not on its test data",
  },
  testRunModeLabel: {
    defaultMessage: "In a test run",
    id: "u0c5HG4JX/",
    description:
      "Label of the choice on a workflow step's Test tab between its test data and running it for real",
  },
  testRunModeMocked: {
    defaultMessage: "Use test data",
    id: "CkFkjy7fQ+",
    description: "Choice on a workflow step's Test tab: a test run uses the step's test data",
  },
  testRunModeReal: {
    defaultMessage: "Run for real",
    id: "xsPz0jjx3+",
    description:
      "Choice on a workflow step's Test tab: a test run calls out for real for this step",
  },
  testRunModeRealDescription: {
    defaultMessage:
      "Test runs call out for real for this step: requests are sent, content is generated and messages are delivered. Its test data is kept for when it uses test data again.",
    id: "iUhV4+Yq09",
    description: "On a workflow step's Test tab, when a test run runs the step for real",
  },
  testOutcomeLabel: {
    defaultMessage: "Outcome",
    id: "ElvzqUrelV",
    description:
      "Label of the choice on a workflow step's Test tab of whether the step succeeds or fails in a test run",
  },
  testOutcomeSucceeds: {
    defaultMessage: "Succeeds",
    id: "JuzH9vR7ay",
    description: "Outcome on a workflow step's Test tab: the step returns its test data",
  },
  testOutcomeFails: {
    defaultMessage: "Fails",
    id: "qo0d24Hw+8",
    description:
      "Outcome on a workflow step's Test tab: the step fails with an error in a test run",
  },
  testFailureCode: {
    defaultMessage: "Error code",
    id: "Q7NvaWMPza",
    description: "Box on a workflow step's Test tab for the code of the error the step fails with",
  },
  testFailureMessage: {
    defaultMessage: "Error message",
    id: "MK78Fh8i76",
    description:
      "Box on a workflow step's Test tab for the message of the error the step fails with",
  },
  testFailureStops: {
    defaultMessage: "On error is set to Stop, so the test run stops at this step.",
    id: "M9MtJAsUOq",
    description:
      "On a workflow step's Test tab, what a failure does when the step's On error setting is Stop",
  },
  testFailureContinues: {
    defaultMessage: "On error is set to Continue, so the test run goes on past this step.",
    id: "HtVUcSTMS/",
    description:
      "On a workflow step's Test tab, what a failure does when the step's On error setting is Continue",
  },
  testFailureBranches: {
    defaultMessage: "On error is set to Branch, so the test run takes this step's error path.",
    id: "OiJHVksWWK",
    description:
      "On a workflow step's Test tab, what a failure does when the step's On error setting is Branch",
  },
  testSettingsRealCount: {
    defaultMessage:
      "{count, plural, =0 {Every step uses its test data.} one {# step runs for real.} other {# steps run for real.}}",
    id: "FhxuAfxzUP",
    description:
      "In the test settings popover, how many steps a test run runs for real instead of using test data",
  },
  testSettingsUseTestDataEverywhere: {
    defaultMessage: "Use test data everywhere",
    id: "we+P5cHH+C",
    description:
      "Button in the test settings popover that sets every step to use its test data in test runs",
  },
  testSettingsRunEverythingForReal: {
    defaultMessage: "Run every step for real",
    id: "0dFZxKMyvL",
    description:
      "Button in the test settings popover that sets every step that calls out to run for real in test runs",
  },
  testSettingsAllRealNote: {
    defaultMessage:
      "When every step runs for real, a test run is a live run: Wait steps really wait. It never publishes.",
    id: "m3elLgug6H",
    description: "In the test settings popover, what a test run does when every step runs for real",
  },
  confirmRealTestTitle: {
    defaultMessage: "Run {count, plural, one {# step} other {# steps}} for real?",
    id: "VElAUDjdAE",
    description: "Title of the dialog before a test run in which some steps call out for real",
  },
  confirmRealTestDescription: {
    defaultMessage:
      "These steps call out for real in this test run. What they do happens and cannot be undone.",
    id: "HmXZYnVvj0",
    description: "In the dialog before a test run with steps that run for real",
  },
  confirmRealTestFedBy: {
    defaultMessage: "Uses test data from {steps}",
    id: "XZ5ZBfMizx",
    description:
      "In the dialog before a test run, under a step that runs for real: the mocked steps whose test data it reads",
  },
  confirmRealTestRun: {
    defaultMessage: "Run test",
    id: "GcIOfZ18Z9",
    description: "Button that starts a test run in which some steps call out for real",
  },
  confirmRealTestCancel: {
    defaultMessage: "Cancel",
    id: "4fBLqa8Qde",
    description:
      "Button that closes the dialog before a test run with steps that run for real, without running",
  },
  executionRealStepCount: {
    defaultMessage: "{count, plural, one {# step ran for real} other {# steps ran for real}}",
    id: "HVa66T0BGY",
    description: "In a workflow's run history, how many steps of a test run called out for real",
  },
  executionRanForReal: {
    defaultMessage: "Ran for real",
    id: "r/zdhHnzwh",
    description: "Mark beside a step in a test run's step list: the step called out for real",
  },
});
