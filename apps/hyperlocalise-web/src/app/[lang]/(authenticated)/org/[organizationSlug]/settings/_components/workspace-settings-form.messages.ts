"use client";

import { defineMessages } from "react-intl";

export const workspaceSettingsFormMessages = defineMessages({
  updateFailed: {
    defaultMessage: "Failed to update workspace",
    id: "94S5baAyIV",
    description: "Fallback error when updating workspace name or slug fails",
  },
  updatedToast: {
    defaultMessage: "Workspace updated",
    id: "Jtv0kZNXI2",
    description: "Success toast after workspace settings are saved",
  },
  organizationNameLabel: {
    defaultMessage: "Organization name",
    id: "Zc3aO7AdzZ",
    description: "Label for the organization name field on account settings",
  },
  workspaceSlugLabel: {
    defaultMessage: "Workspace slug",
    id: "78OEnC/JOf",
    description: "Label for the workspace slug field on account settings",
  },
  save: {
    defaultMessage: "Save",
    id: "AyLloycARU",
    description: "Submit button to save workspace settings",
  },
});
