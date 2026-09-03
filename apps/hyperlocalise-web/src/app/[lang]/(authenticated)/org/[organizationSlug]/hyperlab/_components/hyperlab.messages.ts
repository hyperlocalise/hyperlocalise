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
    id: "hyperlab.workspaceLabel",
    description: "Page label above Hyperlab titles",
  },
  overviewTitle: {
    defaultMessage: "Hyperlab",
    id: "hyperlab.overviewTitle",
    description: "Hyperlab overview page title",
  },
  overviewDescription: {
    defaultMessage:
      "Create flags and experiments, then evaluate them from your apps with OpenFeature and OFREP.",
    id: "hyperlab.overviewDescription",
    description: "Hyperlab overview page description",
  },
  navOverview: {
    defaultMessage: "Overview",
    id: "hyperlab.navOverview",
    description: "Hyperlab sub-navigation item for the overview page",
  },
  navFlags: {
    defaultMessage: "Flags",
    id: "hyperlab.navFlags",
    description: "Hyperlab sub-navigation item for flags",
  },
  navExperiments: {
    defaultMessage: "Experiments",
    id: "hyperlab.navExperiments",
    description: "Hyperlab sub-navigation item for experiments",
  },
  navAudiences: {
    defaultMessage: "Audiences",
    id: "hyperlab.navAudiences",
    description: "Hyperlab sub-navigation item for audiences",
  },
  navKeys: {
    defaultMessage: "Keys",
    id: "hyperlab.navKeys",
    description: "Hyperlab sub-navigation item for client keys",
  },
  ofrepTitle: {
    defaultMessage: "Evaluate URL",
    id: "hyperlab.ofrepTitle",
    description: "Heading for the OFREP base URL on the Hyperlab overview",
  },
  ofrepHint: {
    defaultMessage:
      "Point the OpenFeature OFREP provider at this base URL and send a publishable key as X-API-Key or Authorization: Bearer.",
    id: "hyperlab.ofrepHint",
    description: "Hint for how to use the OFREP evaluate URL",
  },
  snippetTitle: {
    defaultMessage: "Server SDK",
    id: "hyperlab.snippetTitle",
    description: "Heading for the OpenFeature snippet on the Hyperlab overview",
  },
  flagsTitle: {
    defaultMessage: "Flags",
    id: "hyperlab.flagsTitle",
    description: "Flags list page title",
  },
  flagsDescription: {
    defaultMessage: "Keys your apps evaluate. Experiment flags follow a rollout. Config flags return JSON.",
    id: "hyperlab.flagsDescription",
    description: "Flags list page description",
  },
  flagsEmpty: {
    defaultMessage: "No flags yet. Create a key to start evaluating.",
    id: "hyperlab.flagsEmpty",
    description: "Empty state for the flags list",
  },
  createFlag: {
    defaultMessage: "Create flag",
    id: "hyperlab.createFlag",
    description: "Primary action to create a flag",
  },
  flagKeyLabel: {
    defaultMessage: "Key",
    id: "hyperlab.flagKeyLabel",
    description: "Label for a flag key field",
  },
  flagKindLabel: {
    defaultMessage: "Kind",
    id: "hyperlab.flagKindLabel",
    description: "Label for a flag kind field",
  },
  flagDescriptionLabel: {
    defaultMessage: "Description",
    id: "hyperlab.flagDescriptionLabel",
    description: "Label for a flag description field",
  },
  flagKindExperiment: {
    defaultMessage: "Experiment",
    id: "hyperlab.flagKindExperiment",
    description: "Flag kind option for experiment flags",
  },
  flagKindConfig: {
    defaultMessage: "Config",
    id: "hyperlab.flagKindConfig",
    description: "Flag kind option for config flags",
  },
  save: {
    defaultMessage: "Save",
    id: "hyperlab.save",
    description: "Generic save button",
  },
  delete: {
    defaultMessage: "Delete",
    id: "hyperlab.delete",
    description: "Generic delete button",
  },
  loadError: {
    defaultMessage: "Could not load Hyperlab data.",
    id: "hyperlab.loadError",
    description: "Generic load error for Hyperlab pages",
  },
  loading: {
    defaultMessage: "Loading…",
    id: "hyperlab.loading",
    description: "Loading state for Hyperlab pages",
  },
  experimentsTitle: {
    defaultMessage: "Experiments",
    id: "hyperlab.experimentsTitle",
    description: "Experiments list page title",
  },
  experimentsDescription: {
    defaultMessage: "Named rollouts that assign visitors to variants.",
    id: "hyperlab.experimentsDescription",
    description: "Experiments list page description",
  },
  experimentsEmpty: {
    defaultMessage: "No experiments yet. Create a draft, add variants, then activate it.",
    id: "hyperlab.experimentsEmpty",
    description: "Empty state for the experiments list",
  },
  createExperiment: {
    defaultMessage: "Create experiment",
    id: "hyperlab.createExperiment",
    description: "Primary action to create an experiment",
  },
  experimentNameLabel: {
    defaultMessage: "Name",
    id: "hyperlab.experimentNameLabel",
    description: "Label for an experiment name field",
  },
  experimentKindLabel: {
    defaultMessage: "Type",
    id: "hyperlab.experimentKindLabel",
    description: "Label for an experiment type field",
  },
  experimentKindToggle: {
    defaultMessage: "Toggle",
    id: "hyperlab.experimentKindToggle",
    description: "Experiment type option for a single-variant toggle",
  },
  experimentKindAb: {
    defaultMessage: "A/B",
    id: "hyperlab.experimentKindAb",
    description: "Experiment type option for an A/B test",
  },
  experimentStatusLabel: {
    defaultMessage: "Status",
    id: "hyperlab.experimentStatusLabel",
    description: "Label for experiment status",
  },
  activate: {
    defaultMessage: "Activate",
    id: "hyperlab.activate",
    description: "Button to activate an experiment",
  },
  archive: {
    defaultMessage: "Archive",
    id: "hyperlab.archive",
    description: "Button to archive an experiment",
  },
  rolloutLabel: {
    defaultMessage: "Rollout (0–10000)",
    id: "hyperlab.rolloutLabel",
    description: "Label for rollout percentage on a 0-10000 scale",
  },
  variantsTitle: {
    defaultMessage: "Variants",
    id: "hyperlab.variantsTitle",
    description: "Heading for the variants list on an experiment",
  },
  addVariant: {
    defaultMessage: "Add variant",
    id: "hyperlab.addVariant",
    description: "Button to add a variant to an experiment",
  },
  control: {
    defaultMessage: "Control",
    id: "hyperlab.control",
    description: "Badge for the control variant",
  },
  allocation: {
    defaultMessage: "Buckets {start}–{end}",
    id: "hyperlab.allocation",
    description: "Allocation range label for a variant",
  },
  audiencesTitle: {
    defaultMessage: "Audiences",
    id: "hyperlab.audiencesTitle",
    description: "Audiences list page title",
  },
  audiencesDescription: {
    defaultMessage: "Attribute rules evaluated live against the OFREP context.",
    id: "hyperlab.audiencesDescription",
    description: "Audiences list page description",
  },
  audiencesEmpty: {
    defaultMessage: "No audiences yet. Add a rule to target a subset of visitors.",
    id: "hyperlab.audiencesEmpty",
    description: "Empty state for the audiences list",
  },
  createAudience: {
    defaultMessage: "Create audience",
    id: "hyperlab.createAudience",
    description: "Primary action to create an audience",
  },
  audienceNameLabel: {
    defaultMessage: "Name",
    id: "hyperlab.audienceNameLabel",
    description: "Label for an audience name field",
  },
  criterionLabel: {
    defaultMessage: "Criterion JSON",
    id: "hyperlab.criterionLabel",
    description: "Label for the audience criterion JSON field",
  },
  criterionHint: {
    defaultMessage:
      'Example: {"type":"attribute","name":"plan","match":"exact","value":"pro"}',
    id: "hyperlab.criterionHint",
    description: "Hint showing a sample attribute criterion",
  },
  keysTitle: {
    defaultMessage: "Keys",
    id: "hyperlab.keysTitle",
    description: "Client keys page title",
  },
  keysDescription: {
    defaultMessage: "Publishable keys for OFREP. The secret is shown once.",
    id: "hyperlab.keysDescription",
    description: "Client keys page description",
  },
  keysEmpty: {
    defaultMessage: "No keys yet. Create one to evaluate flags from your apps.",
    id: "hyperlab.keysEmpty",
    description: "Empty state for the client keys list",
  },
  createKey: {
    defaultMessage: "Create key",
    id: "hyperlab.createKey",
    description: "Primary action to create a client key",
  },
  keyNameLabel: {
    defaultMessage: "Name",
    id: "hyperlab.keyNameLabel",
    description: "Label for a client key name field",
  },
  revoke: {
    defaultMessage: "Revoke",
    id: "hyperlab.revoke",
    description: "Button to revoke a client key",
  },
  revoked: {
    defaultMessage: "Revoked",
    id: "hyperlab.revoked",
    description: "Badge for a revoked client key",
  },
  copySecret: {
    defaultMessage: "Copy secret now. It will not be shown again.",
    id: "hyperlab.copySecret",
    description: "Warning shown after creating a client key",
  },
  configJsonLabel: {
    defaultMessage: "Config JSON",
    id: "hyperlab.configJsonLabel",
    description: "Label for a config flag JSON value",
  },
  assignmentsTitle: {
    defaultMessage: "Assignments",
    id: "hyperlab.assignmentsTitle",
    description: "Heading for flag-to-variant assignments",
  },
  attachVariant: {
    defaultMessage: "Attach variant",
    id: "hyperlab.attachVariant",
    description: "Button to attach a flag to a variant",
  },
  variantIdLabel: {
    defaultMessage: "Variant ID",
    id: "hyperlab.variantIdLabel",
    description: "Label for the variant ID field when assigning a flag",
  },
  enabledLabel: {
    defaultMessage: "Enabled",
    id: "hyperlab.enabledLabel",
    description: "Label for the assignment enabled checkbox",
  },
  audienceOptional: {
    defaultMessage: "Audience (optional)",
    id: "hyperlab.audienceOptional",
    description: "Label for an optional audience selector",
  },
  none: {
    defaultMessage: "None",
    id: "hyperlab.none",
    description: "Empty option for optional selectors",
  },
});
