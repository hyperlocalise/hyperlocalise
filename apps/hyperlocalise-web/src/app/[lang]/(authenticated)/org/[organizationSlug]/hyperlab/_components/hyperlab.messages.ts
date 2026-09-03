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

export const hyperlabMessages = defineMessages({
  workspaceLabel: {
    defaultMessage: "Workspace",
    id: "vttVPlqAsl",
    description: "Page label above Hyperlab titles",
  },
  overviewTitle: {
    defaultMessage: "Hyperlab",
    id: "F9TKZ7VAEV",
    description: "Hyperlab overview page title",
  },
  overviewDescription: {
    defaultMessage:
      "Create flags and experiments, then evaluate them from your apps with OpenFeature and OFREP.",
    id: "yuvs9rAyBb",
    description: "Hyperlab overview page description",
  },
  navOverview: {
    defaultMessage: "Overview",
    id: "H4VFBPQjwj",
    description: "Hyperlab sub-navigation item for the overview page",
  },
  navFlags: {
    defaultMessage: "Flags",
    id: "IpQ4vzh2L9",
    description: "Hyperlab sub-navigation item for flags",
  },
  navExperiments: {
    defaultMessage: "Experiments",
    id: "A6hxrVxwgZ",
    description: "Hyperlab sub-navigation item for experiments",
  },
  navAudiences: {
    defaultMessage: "Audiences",
    id: "ZJI5SD947D",
    description: "Hyperlab sub-navigation item for audiences",
  },
  navKeys: {
    defaultMessage: "Keys",
    id: "EPbUzSqHwK",
    description: "Hyperlab sub-navigation item for client keys",
  },
  ofrepTitle: {
    defaultMessage: "Evaluate URL",
    id: "Pr+aEKKQXD",
    description: "Heading for the OFREP base URL on the Hyperlab overview",
  },
  ofrepHint: {
    defaultMessage:
      "Point the OpenFeature OFREP provider at this base URL and send a publishable key as X-API-Key or Authorization: Bearer.",
    id: "bmeCBL87Ap",
    description: "Hint for how to use the OFREP evaluate URL",
  },
  snippetTitle: {
    defaultMessage: "Server SDK",
    id: "7A1KxA0XTY",
    description: "Heading for the OpenFeature snippet on the Hyperlab overview",
  },
  flagsTitle: {
    defaultMessage: "Flags",
    id: "mnIDIyLJHl",
    description: "Flags list page title",
  },
  flagsDescription: {
    defaultMessage:
      "Keys your apps evaluate. Experiment flags follow a rollout. Config flags return JSON.",
    id: "iR+P4SsTyW",
    description: "Flags list page description",
  },
  flagsEmpty: {
    defaultMessage: "No flags yet. Create a key to start evaluating.",
    id: "rW10SWs9p6",
    description: "Empty state for the flags list",
  },
  createFlag: {
    defaultMessage: "Create flag",
    id: "37bjYyK5rC",
    description: "Primary action to create a flag",
  },
  flagKeyLabel: {
    defaultMessage: "Key",
    id: "155ppkZ0rK",
    description: "Label for a flag key field",
  },
  flagKindLabel: {
    defaultMessage: "Kind",
    id: "8b+fesnjeu",
    description: "Label for a flag kind field",
  },
  flagDescriptionLabel: {
    defaultMessage: "Description",
    id: "alRfgSMfDX",
    description: "Label for a flag description field",
  },
  flagKindExperiment: {
    defaultMessage: "Experiment",
    id: "B/sHkRyWmP",
    description: "Flag kind option for experiment flags",
  },
  flagKindConfig: {
    defaultMessage: "Config",
    id: "mDmXJ1fRMC",
    description: "Flag kind option for config flags",
  },
  save: {
    defaultMessage: "Save",
    id: "cAVXvKrNnE",
    description: "Generic save button",
  },
  delete: {
    defaultMessage: "Delete",
    id: "UaufkeyA3n",
    description: "Generic delete button",
  },
  loadError: {
    defaultMessage: "Could not load Hyperlab data.",
    id: "x52Ot5HeeY",
    description: "Generic load error for Hyperlab pages",
  },
  loading: {
    defaultMessage: "Loading…",
    id: "awOa5dMYx4",
    description: "Loading state for Hyperlab pages",
  },
  experimentsTitle: {
    defaultMessage: "Experiments",
    id: "eJvMGD1rKZ",
    description: "Experiments list page title",
  },
  experimentsDescription: {
    defaultMessage: "Named rollouts that assign visitors to variants.",
    id: "WKAZTebnqx",
    description: "Experiments list page description",
  },
  experimentsEmpty: {
    defaultMessage: "No experiments yet. Create a draft, add variants, then activate it.",
    id: "dj1pMGEgJO",
    description: "Empty state for the experiments list",
  },
  createExperiment: {
    defaultMessage: "Create experiment",
    id: "9TRMu2bme5",
    description: "Primary action to create an experiment",
  },
  experimentNameLabel: {
    defaultMessage: "Name",
    id: "it78JkINXy",
    description: "Label for an experiment name field",
  },
  experimentKindLabel: {
    defaultMessage: "Type",
    id: "1MvosGjawR",
    description: "Label for an experiment type field",
  },
  experimentKindToggle: {
    defaultMessage: "Toggle",
    id: "8MJ9Nmrj5j",
    description: "Experiment type option for a single-variant toggle",
  },
  experimentKindAb: {
    defaultMessage: "A/B",
    id: "2DRgBlSYXe",
    description: "Experiment type option for an A/B test",
  },
  experimentStatusLabel: {
    defaultMessage: "Status",
    id: "wk3PSCT0hz",
    description: "Label for experiment status",
  },
  activate: {
    defaultMessage: "Activate",
    id: "hAuB9ZbM0P",
    description: "Button to activate an experiment",
  },
  archive: {
    defaultMessage: "Archive",
    id: "fYLfw9YZEc",
    description: "Button to archive an experiment",
  },
  rolloutLabel: {
    defaultMessage: "Rollout (0–10000)",
    id: "sjhkArXuO0",
    description: "Label for rollout percentage on a 0-10000 scale",
  },
  variantsTitle: {
    defaultMessage: "Variants",
    id: "vuxjH9/YC/",
    description: "Heading for the variants list on an experiment",
  },
  addVariant: {
    defaultMessage: "Add variant",
    id: "zdR5Xed7Lx",
    description: "Button to add a variant to an experiment",
  },
  variantRolloutHint: {
    defaultMessage:
      "Earlier variants take buckets first. For a 50/50 A/B test, set both variants to 5000.",
    id: "k3nR8wQp2L",
    description: "Hint explaining how variant rollout percentages allocate buckets",
  },
  saveVariant: {
    defaultMessage: "Save rollout",
    id: "p9Lm2xQe4T",
    description: "Button to save a variant rollout percentage",
  },
  control: {
    defaultMessage: "Control",
    id: "qsnZ8CxWKP",
    description: "Badge for the control variant",
  },
  allocation: {
    defaultMessage: "Buckets {start}–{end}",
    id: "+4yNEdOOhN",
    description: "Allocation range label for a variant",
  },
  audiencesTitle: {
    defaultMessage: "Audiences",
    id: "HqRsGE2RWy",
    description: "Audiences list page title",
  },
  audiencesDescription: {
    defaultMessage: "Attribute rules evaluated live against the OFREP context.",
    id: "xGwWv/bRzY",
    description: "Audiences list page description",
  },
  audiencesEmpty: {
    defaultMessage: "No audiences yet. Add a rule to target a subset of visitors.",
    id: "sOlwtMgDur",
    description: "Empty state for the audiences list",
  },
  createAudience: {
    defaultMessage: "Create audience",
    id: "OUVC3TaOp2",
    description: "Primary action to create an audience",
  },
  audienceNameLabel: {
    defaultMessage: "Name",
    id: "nhCef6BJRC",
    description: "Label for an audience name field",
  },
  criterionLabel: {
    defaultMessage: "Criterion JSON",
    id: "tQdAsAussm",
    description: "Label for the audience criterion JSON field",
  },
  criterionHint: {
    defaultMessage: "Example: type attribute, name plan, match exact, value pro",
    id: "H8CFHs+koj",
    description: "Hint showing a sample attribute criterion",
  },
  keysTitle: {
    defaultMessage: "Keys",
    id: "UI25y7egTC",
    description: "Client keys page title",
  },
  keysDescription: {
    defaultMessage: "Publishable keys for OFREP. The secret is shown once.",
    id: "nUNGAFHT6y",
    description: "Client keys page description",
  },
  keysEmpty: {
    defaultMessage: "No keys yet. Create one to evaluate flags from your apps.",
    id: "uueIlqvfTZ",
    description: "Empty state for the client keys list",
  },
  createKey: {
    defaultMessage: "Create key",
    id: "lSWmCYvw9u",
    description: "Primary action to create a client key",
  },
  keyNameLabel: {
    defaultMessage: "Name",
    id: "lItQnsuCw5",
    description: "Label for a client key name field",
  },
  revoke: {
    defaultMessage: "Revoke",
    id: "mUdENNqEWz",
    description: "Button to revoke a client key",
  },
  revoked: {
    defaultMessage: "Revoked",
    id: "PQSsu6Ru/k",
    description: "Badge for a revoked client key",
  },
  copySecret: {
    defaultMessage: "Copy secret now. It will not be shown again.",
    id: "f1ef6c8mdF",
    description: "Warning shown after creating a client key",
  },
  configJsonLabel: {
    defaultMessage: "Config JSON",
    id: "sKtMhwDjRp",
    description: "Label for a config flag JSON value",
  },
  assignmentsTitle: {
    defaultMessage: "Assignments",
    id: "ZJhr0RbkzD",
    description: "Heading for flag-to-variant assignments",
  },
  attachVariant: {
    defaultMessage: "Attach variant",
    id: "cOUufId3s0",
    description: "Button to attach a flag to a variant",
  },
  variantIdLabel: {
    defaultMessage: "Variant ID",
    id: "fkMZfbcJqG",
    description: "Label for the variant ID field when assigning a flag",
  },
  enabledLabel: {
    defaultMessage: "Enabled",
    id: "Jc0apf/9iM",
    description: "Label for the assignment enabled checkbox",
  },
  audienceOptional: {
    defaultMessage: "Audience (optional)",
    id: "2/y5N+tCKQ",
    description: "Label for an optional audience selector",
  },
  none: {
    defaultMessage: "None",
    id: "0MYRurYa5M",
    description: "Empty option for optional selectors",
  },
});
