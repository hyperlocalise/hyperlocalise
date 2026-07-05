"use client";

import { defineMessages } from "react-intl";

export const githubRepositoryAutomationViewModelMessages = defineMessages({
  pushSourceProjectRequired: {
    defaultMessage: "Choose a Hyperlocalise project for push source.",
    id: "g2W3opbod8",
    description: "Validation error when push source workflow has no project selected",
  },
  pullTranslationsProjectRequired: {
    defaultMessage: "Choose a Hyperlocalise project for pull translations.",
    id: "NxMkWJ+eS3",
    description: "Validation error when pull translations workflow has no project selected",
  },
  triggerRequired: {
    defaultMessage: "Choose push or scheduled triggers when workflows are enabled.",
    id: "dmWGvUNewd",
    description: "Validation error when workflows are enabled but no trigger mode is selected",
  },
  automationTriggerRequired: {
    defaultMessage: "Enable at least one workflow and choose when automation should run.",
    id: "/TZx8A/JWk",
    description: "API error when automation has workflows but no trigger configuration",
  },
  pushTriggerRequiresBranches: {
    defaultMessage: "Add at least one branch pattern for push triggers.",
    id: "l5r0xPEJDX",
    description: "API error when push trigger has no branch patterns",
  },
  weeklyScheduleRequiresDayOfWeek: {
    defaultMessage: "Choose a day of the week for weekly schedules.",
    id: "pCwlsos9AL",
    description: "API error when weekly schedule has an invalid day of week",
  },
  invalidAutomationTimezone: {
    defaultMessage: "Enter a valid IANA timezone such as UTC or America/New_York.",
    id: "muwnlAh1Hy",
    description: "API error when scheduled automation timezone is invalid",
  },
  githubRepositoryNotEnabled: {
    defaultMessage: "Enable this repository before configuring automation.",
    id: "nwEXrsmZmr",
    description: "API error when configuring automation on a disabled repository",
  },
  githubRepositoryArchived: {
    defaultMessage: "Archived repositories cannot use translation automation.",
    id: "ULAiYLTSMp",
    description: "API error when configuring automation on an archived repository",
  },
  invalidBranchPattern: {
    defaultMessage: "Branch patterns may only use letters, numbers, ., _, -, /, *, and ?.",
    id: "FSI9rZSdBy",
    description: "Validation error when a branch pattern contains invalid characters",
  },
  saveFailed: {
    defaultMessage: "Could not save automation settings.",
    id: "0xs+BR2vTX",
    description: "Fallback error when automation settings save fails without a specific message",
  },
  enterBranchPattern: {
    defaultMessage: "Enter a branch pattern.",
    id: "8RC2xeVGMi",
    description: "Validation error when adding an empty branch pattern",
  },
  branchPatternAlreadyListed: {
    defaultMessage: "That branch pattern is already listed.",
    id: "8Gb40LZzb8",
    description: "Validation error when adding a duplicate branch pattern",
  },
  maxBranchPatterns: {
    defaultMessage: "You can add up to {max} branch patterns.",
    id: "88mR250rV4",
    description: "Validation error when the branch pattern limit is reached",
  },
});
