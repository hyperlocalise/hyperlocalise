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

export type EditorStep = {
  id: string;
  label: string;
};

export const EDITOR_STEPS: EditorStep[] = [
  { id: "name", label: "Name" },
  { id: "trigger", label: "Trigger" },
  { id: "instructions", label: "Instructions" },
  { id: "tools", label: "Tools" },
  { id: "done", label: "Done" },
];

export const MOCK_AUTOMATION = {
  name: "Validate localisation on push",
  trigger: "GitHub push",
  branch: "main",
  instructions: [
    "You are a localisation quality automation.",
    "",
    "Goal: validate source string and translation changes before they reach production.",
    "",
    "Review strategy:",
    "- Check changed source strings for missing context, unstable copy, and accidental key churn.",
    "- Flag missing translations, broken ICU syntax, mismatched placeholders, and unsafe HTML.",
    "- Treat locale coverage regressions and release-blocking translation issues as blocking findings.",
    "- Ignore style-only code changes that do not affect localisation files or user-facing strings.",
  ].join("\n"),
  tools: [
    {
      id: "github",
      name: "GitHub sync workflows",
      description: "Push source, pull translations, and validation checks.",
      toggles: [
        { label: "Push source", enabled: false },
        { label: "Pull translations", enabled: false },
        { label: "Validation", enabled: true },
      ],
    },
    {
      id: "slack",
      name: "Send to Slack",
      description: "Connect Slack in Integrations to use this tool.",
      connectFirst: true,
      toggles: [],
    },
  ],
};
