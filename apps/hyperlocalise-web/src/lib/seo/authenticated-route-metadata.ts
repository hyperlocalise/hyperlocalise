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
import type { IntlShape } from "@formatjs/intl";

export const AUTHENTICATED_PAGE_KEYS = [
  "accessDenied",
  "aiEngine",
  "automationDetail",
  "automationNew",
  "automations",
  "canvaClaim",
  "connectCanva",
  "connectCanvaOauth",
  "dashboard",
  "dictionaries",
  "dictionaryDetail",
  "domainBrand",
  "domainKeywords",
  "domainOverview",
  "domainPrompts",
  "domainRanks",
  "domainSearchConsole",
  "domains",
  "githubAutomation",
  "glossaries",
  "glossaryConcept",
  "glossaryDetail",
  "glossaryHistory",
  "guideline",
  "hyperlab",
  "hyperlabAudienceDetail",
  "hyperlabAudiences",
  "hyperlabExperimentDetail",
  "hyperlabExperiments",
  "hyperlabFlagDetail",
  "hyperlabFlags",
  "hyperlabKeys",
  "inbox",
  "inboxConversation",
  "inboxNew",
  "inboxNotification",
  "integrations",
  "issues",
  "jobs",
  "layout",
  "members",
  "membersPermissions",
  "myJobs",
  "onboarding",
  "projectAutomationDetail",
  "projectAutomationNew",
  "projectAutomations",
  "projectContentEditor",
  "projectFiles",
  "projectGuideline",
  "projectJobDetail",
  "projectJobStrings",
  "projectJobs",
  "projectOverview",
  "projectQa",
  "projectQueries",
  "projectQueryDetail",
  "projectReports",
  "projectSettings",
  "projectStrings",
  "projects",
  "qa",
  "reports",
  "selectOrganization",
  "settings",
  "settingsAccount",
  "settingsActivityLogs",
  "settingsApiKeys",
  "settingsBilling",
  "settingsLinkedDomains",
  "settingsMembers",
  "teamDetail",
  "teams",
  "translationMemories",
  "translationMemoryDetail",
  "translationMemoryImport",
  "visualWorkflowDetail",
  "visualWorkflows",
] as const;

export type AuthenticatedPageKey = (typeof AUTHENTICATED_PAGE_KEYS)[number];

type RouteCopy = {
  title: string;
  description: string;
};

const AUTHENTICATED_ROUTE_COPY = {
  accessDenied: {
    title: {
      defaultMessage: "Access denied",
      id: "aP8mQ2wL9x",
      description: "Document title for the access denied page",
    },
    description: {
      defaultMessage: "You do not have access to this workspace.",
      id: "bR4nT7cK1v",
      description: "Document description for the access denied page",
    },
  },
  aiEngine: {
    title: {
      defaultMessage: "AI Engine",
      id: "cS5oU8dL2w",
      description: "Document title for the workspace AI Engine page",
    },
    description: {
      defaultMessage: "Choose the model provider agents use in this workspace.",
      id: "dT6pV9eM3x",
      description: "Document description for the workspace AI Engine page",
    },
  },
  automationDetail: {
    title: {
      defaultMessage: "Automation",
      id: "eU7qW0fN4y",
      description: "Document title for a workspace automation detail page",
    },
    description: {
      defaultMessage: "Automation details and run history.",
      id: "fV8rX1gO5z",
      description: "Document description for a workspace automation detail page",
    },
  },
  automationNew: {
    title: {
      defaultMessage: "New automation",
      id: "gW9sY2hP6A",
      description: "Document title for the create-automation page",
    },
    description: {
      defaultMessage: "Create a localisation automation.",
      id: "hX0tZ3iQ7B",
      description: "Document description for the create-automation page",
    },
  },
  automations: {
    title: {
      defaultMessage: "Automations",
      id: "iY1uA4jR8C",
      description: "Document title for the workspace automations page",
    },
    description: {
      defaultMessage: "Scheduled and triggered localisation workflows.",
      id: "jZ2vB5kS9D",
      description: "Document description for the workspace automations page",
    },
  },
  canvaClaim: {
    title: {
      defaultMessage: "Canva",
      id: "kA3wC6lT0E",
      description: "Document title for the Canva claim page",
    },
    description: {
      defaultMessage: "Connect this workspace to Canva.",
      id: "lB4xD7mU1F",
      description: "Document description for the Canva claim page",
    },
  },
  connectCanva: {
    title: {
      defaultMessage: "Connect Canva",
      id: "mC5yE8nV2G",
      description: "Document title for the Canva connect page",
    },
    description: {
      defaultMessage: "Connect Canva to Hyperlocalise.",
      id: "nD6zF9oW3H",
      description: "Document description for the Canva connect page",
    },
  },
  connectCanvaOauth: {
    title: {
      defaultMessage: "Canva authorization",
      id: "oE7AG0pX4I",
      description: "Document title for the Canva OAuth callback page",
    },
    description: {
      defaultMessage: "Finish connecting Canva.",
      id: "pF8BH1qY5J",
      description: "Document description for the Canva OAuth callback page",
    },
  },
  dashboard: {
    title: {
      defaultMessage: "Overview",
      id: "qG9CI2rZ6K",
      description: "Document title for the workspace overview page",
    },
    description: {
      defaultMessage: "A top-down view of localisation work in this workspace.",
      id: "rH0DJ3sA7L",
      description: "Document description for the workspace overview page",
    },
  },
  dictionaries: {
    title: {
      defaultMessage: "Dictionaries",
      id: "sI1EK4tB8M",
      description: "Document title for the spellcheck dictionaries page",
    },
    description: {
      defaultMessage: "Spellcheck dictionaries for this workspace.",
      id: "tJ2FL5uC9N",
      description: "Document description for the spellcheck dictionaries page",
    },
  },
  dictionaryDetail: {
    title: {
      defaultMessage: "Dictionary",
      id: "uK3GM6vD0O",
      description: "Document title for a spellcheck dictionary page",
    },
    description: {
      defaultMessage: "Words in this spellcheck dictionary.",
      id: "vL4HN7wE1P",
      description: "Document description for a spellcheck dictionary page",
    },
  },
  domainBrand: {
    title: {
      defaultMessage: "AI visibility",
      id: "wM5IO8xF2Q",
      description: "Document title for the domain AI visibility page",
    },
    description: {
      defaultMessage: "AI visibility research for this domain.",
      id: "xN6JP9yG3R",
      description: "Document description for the domain AI visibility page",
    },
  },
  domainKeywords: {
    title: {
      defaultMessage: "Keyword research",
      id: "yO7KQ0zH4S",
      description: "Document title for the domain keyword research page",
    },
    description: {
      defaultMessage: "Keyword research for this domain.",
      id: "zP8LR1AI5T",
      description: "Document description for the domain keyword research page",
    },
  },
  domainOverview: {
    title: {
      defaultMessage: "Domain",
      id: "AQ9MS2BJ6U",
      description: "Document title for a linked domain overview page",
    },
    description: {
      defaultMessage: "Domain overview and localisation audit.",
      id: "BR0NT3CK7V",
      description: "Document description for a linked domain overview page",
    },
  },
  domainPrompts: {
    title: {
      defaultMessage: "Prompt explorer",
      id: "CS1OU4DL8W",
      description: "Document title for the domain prompt explorer page",
    },
    description: {
      defaultMessage: "Prompt explorer for this domain.",
      id: "DT2PV5EM9X",
      description: "Document description for the domain prompt explorer page",
    },
  },
  domainRanks: {
    title: {
      defaultMessage: "Rank tracking",
      id: "EU3QW6FN0Y",
      description: "Document title for the domain rank tracking page",
    },
    description: {
      defaultMessage: "Search rank tracking for this domain.",
      id: "FV4RX7GO1Z",
      description: "Document description for the domain rank tracking page",
    },
  },
  domainSearchConsole: {
    title: {
      defaultMessage: "Search Console",
      id: "gS1cMetaT1",
      description: "Document title for the domain Search Console page",
    },
    description: {
      defaultMessage: "Google Search Console performance for this domain.",
      id: "gS2cMetaD1",
      description: "Document description for the domain Search Console page",
    },
  },
  domains: {
    title: {
      defaultMessage: "Domains",
      id: "GW5SY8HP2a",
      description: "Document title for the linked domains list page",
    },
    description: {
      defaultMessage: "Claimed sites and localisation audit reports.",
      id: "HX6TZ9IQ3b",
      description: "Document description for the linked domains list page",
    },
  },
  githubAutomation: {
    title: {
      defaultMessage: "GitHub automation",
      id: "IY7UA0JR4c",
      description: "Document title for a GitHub repository automation page",
    },
    description: {
      defaultMessage: "Automation for this GitHub repository.",
      id: "JZ8VB1KS5d",
      description: "Document description for a GitHub repository automation page",
    },
  },
  glossaries: {
    title: {
      defaultMessage: "Glossaries",
      id: "KA9WC2LT6e",
      description: "Document title for the glossaries list page",
    },
    description: {
      defaultMessage: "Approved terms for this workspace.",
      id: "LB0XD3MU7f",
      description: "Document description for the glossaries list page",
    },
  },
  glossaryConcept: {
    title: {
      defaultMessage: "Concept",
      id: "MC1YE4NV8g",
      description: "Document title for a glossary concept page",
    },
    description: {
      defaultMessage: "A glossary concept and its terms.",
      id: "ND2ZF5OW9h",
      description: "Document description for a glossary concept page",
    },
  },
  glossaryDetail: {
    title: {
      defaultMessage: "Glossary",
      id: "OE3AG6PX0i",
      description: "Document title for a glossary detail page",
    },
    description: {
      defaultMessage: "Glossary terms and concepts.",
      id: "PF4BH7QY1j",
      description: "Document description for a glossary detail page",
    },
  },
  glossaryHistory: {
    title: {
      defaultMessage: "Glossary history",
      id: "QG5CI8RZ2k",
      description: "Document title for a glossary history page",
    },
    description: {
      defaultMessage: "Change history for this glossary.",
      id: "RH6DJ9SA3l",
      description: "Document description for a glossary history page",
    },
  },
  guideline: {
    title: {
      defaultMessage: "Guideline",
      id: "SI7EK0TB4m",
      description: "Document title for the workspace guideline page",
    },
    description: {
      defaultMessage: "Shared guidance for agents and teams.",
      id: "TJ8FL1UC5n",
      description: "Document description for the workspace guideline page",
    },
  },
  hyperlab: {
    title: {
      defaultMessage: "Hyperlab",
      id: "UK9GM2VD6o",
      description: "Document title for the Hyperlab home page",
    },
    description: {
      defaultMessage: "Flags and experiments for your apps.",
      id: "VL0HN3WE7p",
      description: "Document description for the Hyperlab home page",
    },
  },
  hyperlabAudienceDetail: {
    title: {
      defaultMessage: "Audience",
      id: "WM1IO4XF8q",
      description: "Document title for a Hyperlab audience page",
    },
    description: {
      defaultMessage: "A Hyperlab audience.",
      id: "XN2JP5YG9r",
      description: "Document description for a Hyperlab audience page",
    },
  },
  hyperlabAudiences: {
    title: {
      defaultMessage: "Audiences",
      id: "YO3KQ6ZH0s",
      description: "Document title for the Hyperlab audiences page",
    },
    description: {
      defaultMessage: "Hyperlab audiences.",
      id: "ZP4LR7AI1t",
      description: "Document description for the Hyperlab audiences page",
    },
  },
  hyperlabExperimentDetail: {
    title: {
      defaultMessage: "Experiment",
      id: "AQ5MS8BJ2u",
      description: "Document title for a Hyperlab experiment page",
    },
    description: {
      defaultMessage: "A Hyperlab experiment.",
      id: "BR6NT9CK3v",
      description: "Document description for a Hyperlab experiment page",
    },
  },
  hyperlabExperiments: {
    title: {
      defaultMessage: "Experiments",
      id: "CS7OU0DL4w",
      description: "Document title for the Hyperlab experiments page",
    },
    description: {
      defaultMessage: "Hyperlab experiments.",
      id: "DT8PV1EM5x",
      description: "Document description for the Hyperlab experiments page",
    },
  },
  hyperlabFlagDetail: {
    title: {
      defaultMessage: "Flag",
      id: "EU9QW2FN6y",
      description: "Document title for a Hyperlab flag page",
    },
    description: {
      defaultMessage: "A Hyperlab feature flag.",
      id: "FV0RX3GO7z",
      description: "Document description for a Hyperlab flag page",
    },
  },
  hyperlabFlags: {
    title: {
      defaultMessage: "Flags",
      id: "GW1SY4HP8A",
      description: "Document title for the Hyperlab flags page",
    },
    description: {
      defaultMessage: "Hyperlab feature flags.",
      id: "HX2TZ5IQ9B",
      description: "Document description for the Hyperlab flags page",
    },
  },
  hyperlabKeys: {
    title: {
      defaultMessage: "API keys",
      id: "IY3UA6JR0C",
      description: "Document title for the Hyperlab API keys page",
    },
    description: {
      defaultMessage: "API keys for Hyperlab.",
      id: "JZ4VB7KS1D",
      description: "Document description for the Hyperlab API keys page",
    },
  },
  inbox: {
    title: {
      defaultMessage: "Inbox",
      id: "KA5WC8LT2E",
      description: "Document title for the workspace inbox page",
    },
    description: {
      defaultMessage: "Agent conversations and workspace notifications.",
      id: "LB6XD9MU3F",
      description: "Document description for the workspace inbox page",
    },
  },
  inboxConversation: {
    title: {
      defaultMessage: "Conversation",
      id: "MC7YE0NV4G",
      description: "Document title for an inbox conversation page",
    },
    description: {
      defaultMessage: "A localisation agent conversation.",
      id: "ND8ZF1OW5H",
      description: "Document description for an inbox conversation page",
    },
  },
  inboxNew: {
    title: {
      defaultMessage: "New request",
      id: "OE9AG2PX6I",
      description: "Document title for the new localisation request page",
    },
    description: {
      defaultMessage: "Ask the localisation agent to prepare work.",
      id: "PF0BH3QY7J",
      description: "Document description for the new localisation request page",
    },
  },
  inboxNotification: {
    title: {
      defaultMessage: "Notification",
      id: "QG1CI4RZ8K",
      description: "Document title for an inbox notification page",
    },
    description: {
      defaultMessage: "A workspace notification.",
      id: "RH2DJ5SA9L",
      description: "Document description for an inbox notification page",
    },
  },
  integrations: {
    title: {
      defaultMessage: "Integrations",
      id: "SI3EK6TB0M",
      description: "Document title for the workspace integrations page",
    },
    description: {
      defaultMessage: "Connected tools and translation providers.",
      id: "TJ4FL7UC1N",
      description: "Document description for the workspace integrations page",
    },
  },
  issues: {
    title: {
      defaultMessage: "Queries",
      id: "UK5GM8VD2O",
      description: "Document title for the workspace Queries page",
    },
    description: {
      defaultMessage: "Questions and issues across this workspace.",
      id: "VL6HN9WE3P",
      description: "Document description for the workspace Queries page",
    },
  },
  jobs: {
    title: {
      defaultMessage: "Jobs",
      id: "WM7IO0XF4Q",
      description: "Document title for the workspace jobs page",
    },
    description: {
      defaultMessage: "All jobs in this workspace.",
      id: "XN8JP1YG5R",
      description: "Document description for the workspace jobs page",
    },
  },
  layout: {
    title: {
      defaultMessage: "Hyperlocalise",
      id: "YO9KQ2ZH6S",
      description: "Default document title for authenticated workspace pages",
    },
    description: {
      defaultMessage: "Workspace for localisation projects, jobs, and reviews.",
      id: "ZP0LR3AI7T",
      description: "Default document description for authenticated workspace pages",
    },
  },
  members: {
    title: {
      defaultMessage: "Members",
      id: "CS3OU6DL0W",
      description: "Document title for the workspace members page",
    },
    description: {
      defaultMessage: "People and roles in this workspace.",
      id: "DT4PV7EM1X",
      description: "Document description for the workspace members page",
    },
  },
  membersPermissions: {
    title: {
      defaultMessage: "Permissions",
      id: "EU5QW8FN2Y",
      description: "Document title for the workspace permissions page",
    },
    description: {
      defaultMessage: "Workspace role permissions.",
      id: "FV6RX9GO3Z",
      description: "Document description for the workspace permissions page",
    },
  },
  myJobs: {
    title: {
      defaultMessage: "My Jobs",
      id: "GW7SY0HP4a",
      description: "Document title for the current user’s jobs page",
    },
    description: {
      defaultMessage: "Jobs assigned to you.",
      id: "HX8TZ1IQ5b",
      description: "Document description for the current user’s jobs page",
    },
  },
  onboarding: {
    title: {
      defaultMessage: "Onboarding",
      id: "IY9UA2JR6c",
      description: "Document title for the workspace onboarding page",
    },
    description: {
      defaultMessage: "Set up your Hyperlocalise workspace.",
      id: "JZ0VB3KS7d",
      description: "Document description for the workspace onboarding page",
    },
  },
  projectAutomationDetail: {
    title: {
      defaultMessage: "Project automation",
      id: "KA1WC4LT8e",
      description: "Document title for a project automation page",
    },
    description: {
      defaultMessage: "A project automation.",
      id: "LB2XD5MU9f",
      description: "Document description for a project automation page",
    },
  },
  projectAutomationNew: {
    title: {
      defaultMessage: "New project automation",
      id: "MC3YE6NV0g",
      description: "Document title for the create project automation page",
    },
    description: {
      defaultMessage: "Create a project automation.",
      id: "ND4ZF7OW1h",
      description: "Document description for the create project automation page",
    },
  },
  projectAutomations: {
    title: {
      defaultMessage: "Project automations",
      id: "OE5AG8PX2i",
      description: "Document title for the project automations page",
    },
    description: {
      defaultMessage: "Automations for this project.",
      id: "PF6BH9QY3j",
      description: "Document description for the project automations page",
    },
  },
  projectContentEditor: {
    title: {
      defaultMessage: "Content Editor",
      id: "QG7CI0RZ4k",
      description: "Document title for the project Content Editor files page",
    },
    description: {
      defaultMessage: "Edit files in the Content Editor.",
      id: "RH8DJ1SA5l",
      description: "Document description for the project Content Editor files page",
    },
  },
  projectFiles: {
    title: {
      defaultMessage: "Files",
      id: "SI9EK2TB6m",
      description: "Document title for the project files page",
    },
    description: {
      defaultMessage: "Source and translated files in this project.",
      id: "TJ0FL3UC7n",
      description: "Document description for the project files page",
    },
  },
  projectGuideline: {
    title: {
      defaultMessage: "Project guideline",
      id: "UK1GM4VD8o",
      description: "Document title for the project guideline page",
    },
    description: {
      defaultMessage: "Project-specific guidance for agents and teams.",
      id: "VL2HN5WE9p",
      description: "Document description for the project guideline page",
    },
  },
  projectJobDetail: {
    title: {
      defaultMessage: "Job",
      id: "WM3IO6XF0q",
      description: "Document title for a project job page",
    },
    description: {
      defaultMessage: "Job details and progress.",
      id: "XN4JP7YG1r",
      description: "Document description for a project job page",
    },
  },
  projectJobStrings: {
    title: {
      defaultMessage: "Job strings",
      id: "YO5KQ8ZH2s",
      description: "Document title for a project job strings page",
    },
    description: {
      defaultMessage: "Strings in this job.",
      id: "ZP6LR9AI3t",
      description: "Document description for a project job strings page",
    },
  },
  projectJobs: {
    title: {
      defaultMessage: "Project jobs",
      id: "AQ7MS0BJ4u",
      description: "Document title for the project jobs page",
    },
    description: {
      defaultMessage: "Jobs in this project.",
      id: "BR8NT1CK5v",
      description: "Document description for the project jobs page",
    },
  },
  projectOverview: {
    title: {
      defaultMessage: "Project",
      id: "CS9OU2DL6w",
      description: "Document title for the project overview page",
    },
    description: {
      defaultMessage: "Project overview.",
      id: "DT0PV3EM7x",
      description: "Document description for the project overview page",
    },
  },
  projectQa: {
    title: {
      defaultMessage: "Project QA",
      id: "EU1QW4FN8y",
      description: "Document title for the project QA page",
    },
    description: {
      defaultMessage: "Translation quality reports for this project.",
      id: "FV2RX5GO9z",
      description: "Document description for the project QA page",
    },
  },
  projectQueries: {
    title: {
      defaultMessage: "Project queries",
      id: "GW3SY6HP0A",
      description: "Document title for the project Queries page",
    },
    description: {
      defaultMessage: "Questions and issues in this project.",
      id: "HX4TZ7IQ1B",
      description: "Document description for the project Queries page",
    },
  },
  projectQueryDetail: {
    title: {
      defaultMessage: "Query",
      id: "IY5UA8JR2C",
      description: "Document title for a project query page",
    },
    description: {
      defaultMessage: "A project query.",
      id: "JZ6VB9KS3D",
      description: "Document description for a project query page",
    },
  },
  projectReports: {
    title: {
      defaultMessage: "Project reports",
      id: "KA7WC0LT4E",
      description: "Document title for the project reports page",
    },
    description: {
      defaultMessage: "Translation reports for this project.",
      id: "LB8XD1MU5F",
      description: "Document description for the project reports page",
    },
  },
  projectSettings: {
    title: {
      defaultMessage: "Project settings",
      id: "MC9YE2NV6G",
      description: "Document title for the project settings page",
    },
    description: {
      defaultMessage: "Project settings.",
      id: "ND0ZF3OW7H",
      description: "Document description for the project settings page",
    },
  },
  projectStrings: {
    title: {
      defaultMessage: "Content Editor",
      id: "OE1AG4PX8I",
      description: "Document title for the project Content Editor strings page",
    },
    description: {
      defaultMessage: "Edit project strings in the Content Editor.",
      id: "PF2BH5QY9J",
      description: "Document description for the project Content Editor strings page",
    },
  },
  projects: {
    title: {
      defaultMessage: "Projects",
      id: "QG3CI6RZ0K",
      description: "Document title for the workspace projects page",
    },
    description: {
      defaultMessage: "Projects in this workspace.",
      id: "RH4DJ7SA1L",
      description: "Document description for the workspace projects page",
    },
  },
  qa: {
    title: {
      defaultMessage: "QA",
      id: "SI5EK8TB2M",
      description: "Document title for the workspace QA page",
    },
    description: {
      defaultMessage: "Translation quality reports for this workspace.",
      id: "TJ6FL9UC3N",
      description: "Document description for the workspace QA page",
    },
  },
  reports: {
    title: {
      defaultMessage: "Reports",
      id: "UK7GM0VD4O",
      description: "Document title for the workspace reports page",
    },
    description: {
      defaultMessage: "Translation reports for this workspace.",
      id: "VL8HN1WE5P",
      description: "Document description for the workspace reports page",
    },
  },
  selectOrganization: {
    title: {
      defaultMessage: "Choose an organization",
      id: "WM9IO2XF6Q",
      description: "Document title for the organization picker page",
    },
    description: {
      defaultMessage: "Select the workspace you want to open.",
      id: "XN0JP3YG7R",
      description: "Document description for the organization picker page",
    },
  },
  settings: {
    title: {
      defaultMessage: "Settings",
      id: "YO1KQ4ZH8S",
      description: "Document title for workspace general settings",
    },
    description: {
      defaultMessage: "Workspace settings.",
      id: "ZP2LR5AI9T",
      description: "Document description for workspace general settings",
    },
  },
  settingsAccount: {
    title: {
      defaultMessage: "Account",
      id: "AQ3MS6BJ0U",
      description: "Document title for account settings",
    },
    description: {
      defaultMessage: "Your account settings.",
      id: "BR4NT7CK1V",
      description: "Document description for account settings",
    },
  },
  settingsActivityLogs: {
    title: {
      defaultMessage: "Activity logs",
      id: "CS5OU8DL2W",
      description: "Document title for workspace activity logs",
    },
    description: {
      defaultMessage: "Workspace activity history.",
      id: "DT6PV9EM3X",
      description: "Document description for workspace activity logs",
    },
  },
  settingsApiKeys: {
    title: {
      defaultMessage: "API keys",
      id: "EU7QW0FN4Y",
      description: "Document title for workspace API keys settings",
    },
    description: {
      defaultMessage: "Workspace API keys.",
      id: "FV8RX1GO5Z",
      description: "Document description for workspace API keys settings",
    },
  },
  settingsBilling: {
    title: {
      defaultMessage: "Billing",
      id: "GW9SY2HP6a",
      description: "Document title for workspace billing settings",
    },
    description: {
      defaultMessage: "Plan and billing for this workspace.",
      id: "HX0TZ3IQ7b",
      description: "Document description for workspace billing settings",
    },
  },
  settingsLinkedDomains: {
    title: {
      defaultMessage: "Linked domains",
      id: "IY1UA4JR8c",
      description: "Document title for linked domains settings",
    },
    description: {
      defaultMessage: "Domains linked to this workspace.",
      id: "JZ2VB5KS9d",
      description: "Document description for linked domains settings",
    },
  },
  settingsMembers: {
    title: {
      defaultMessage: "Members",
      id: "KA3WC6LT0e",
      description: "Document title for members settings",
    },
    description: {
      defaultMessage: "Invite people and manage workspace roles.",
      id: "LB4XD7MU1f",
      description: "Document description for members settings",
    },
  },
  teamDetail: {
    title: {
      defaultMessage: "Team",
      id: "MC5YE8NV2g",
      description: "Document title for a team page",
    },
    description: {
      defaultMessage: "Team members and settings.",
      id: "ND6ZF9OW3h",
      description: "Document description for a team page",
    },
  },
  teams: {
    title: {
      defaultMessage: "Teams",
      id: "OE7AG0PX4i",
      description: "Document title for the teams list page",
    },
    description: {
      defaultMessage: "Teams in this workspace.",
      id: "PF8BH1QY5j",
      description: "Document description for the teams list page",
    },
  },
  translationMemories: {
    title: {
      defaultMessage: "Translation Memories",
      id: "QG9CI2RZ6k",
      description: "Document title for the translation memories list page",
    },
    description: {
      defaultMessage: "Reusable translations for this workspace.",
      id: "RH0DJ3SA7l",
      description: "Document description for the translation memories list page",
    },
  },
  translationMemoryDetail: {
    title: {
      defaultMessage: "Translation memory",
      id: "SI1EK4TB8m",
      description: "Document title for a translation memory page",
    },
    description: {
      defaultMessage: "Entries in this translation memory.",
      id: "TJ2FL5UC9n",
      description: "Document description for a translation memory page",
    },
  },
  translationMemoryImport: {
    title: {
      defaultMessage: "Memory import",
      id: "UK3GM6VD0o",
      description: "Document title for a translation memory import page",
    },
    description: {
      defaultMessage: "A translation memory import.",
      id: "VL4HN7WE1p",
      description: "Document description for a translation memory import page",
    },
  },
  visualWorkflowDetail: {
    title: {
      defaultMessage: "Visual workflow",
      id: "WM5IO8XF2q",
      description: "Document title for a visual workflow page",
    },
    description: {
      defaultMessage: "A visual localisation workflow.",
      id: "XN6JP9YG3r",
      description: "Document description for a visual workflow page",
    },
  },
  visualWorkflows: {
    title: {
      defaultMessage: "Visual workflows",
      id: "YO7KQ0ZH4s",
      description: "Document title for the visual workflows page",
    },
    description: {
      defaultMessage: "Visual localisation workflows.",
      id: "ZP8LR1AI5t",
      description: "Document description for the visual workflows page",
    },
  },
} as const satisfies Record<
  AuthenticatedPageKey,
  {
    title: { defaultMessage: string; id: string; description: string };
    description: { defaultMessage: string; id: string; description: string };
  }
>;

export const AUTHENTICATED_TITLE_TEMPLATE = "%s | Hyperlocalise";

export function getAuthenticatedRouteMetadata(
  intl: IntlShape,
  page: AuthenticatedPageKey,
): RouteCopy {
  const copy = AUTHENTICATED_ROUTE_COPY[page];

  return {
    title: intl.formatMessage(copy.title),
    description: intl.formatMessage(copy.description),
  };
}
