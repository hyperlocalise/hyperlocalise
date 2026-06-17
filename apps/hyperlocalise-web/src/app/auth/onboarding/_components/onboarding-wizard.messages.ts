"use client";

import { defineMessages } from "react-intl";

export const onboardingWizardMessages = defineMessages({
  logoAlt: {
    defaultMessage: "Hyperlocalise logo", id: 'QhgL5ysg0T',
    description: "Accessible alt text for the Hyperlocalise logo on the onboarding page",
  },
  title: {
    defaultMessage: "Create your workspace", id: '4AlCRwOS/3',
    description: "Onboarding page heading for creating a new workspace",
  },
  description: {
    defaultMessage:
      "Your workspace holds projects, team access, and settings. Choose a name to get started.", id: 'hWOWX4SSYH',
    description: "Onboarding page summary explaining what a workspace is for",
  },
  workspaceNameLabel: {
    defaultMessage: "Workspace name", id: 'Nuj0umLVvu',
    description: "Label for the workspace name input on onboarding",
  },
  workspaceNamePlaceholder: {
    defaultMessage: "Acme localisation", id: 'TmvQ63+NJ8',
    description: "Placeholder example for the workspace name input on onboarding",
  },
  workspaceUrlPreview: {
    defaultMessage: "<label>Workspace URL </label><path>/org/{slug}</path>", id: '9ByCGUY81m',
    description: "Preview of the workspace URL path derived from the workspace name",
  },
  createWorkspace: {
    defaultMessage: "Create workspace", id: 'wRrp5VzBUC',
    description: "Submit button to create a new workspace during onboarding",
  },
});
