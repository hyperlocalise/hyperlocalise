"use client";

import { defineMessages } from "react-intl";

export const glossariesPageContentMessages = defineMessages({
  loadProjectsFailed: {
    defaultMessage: "Failed to load projects",
    id: "NZgVd5LQvT",
    description: "Fallback error when projects fail to load on the glossaries page",
  },
  loadCredentialsFailed: {
    defaultMessage: "Failed to load provider credentials ({status})",
    id: "3BQQgDQPHy",
    description: "Error when TMS provider credentials fail to load",
  },
  loadProviderGlossariesFailed: {
    defaultMessage: "Failed to load provider glossaries ({status})",
    id: "hiq+uFZtbL",
    description: "Error when live provider glossaries fail to load",
  },
  loadGlossariesFailed: {
    defaultMessage: "Failed to load glossaries ({status})",
    id: "n1G2BUwEdJ",
    description: "Error when workspace glossaries fail to load",
  },
  createGlossaryFailed: {
    defaultMessage: "Unable to create glossary",
    id: "gUXo9+5beH",
    description: "Fallback error when creating a glossary fails",
  },
  glossaryCreated: {
    defaultMessage: "Glossary created",
    id: "8pfmpD7Pez",
    description: "Toast after a glossary is created successfully",
  },
  nameRequired: {
    defaultMessage: "Glossary name is required.",
    id: "WO7W6p2kV8",
    description: "Validation error when the create glossary name field is empty",
  },
  targetLocaleRequired: {
    defaultMessage: "Select one target locale.",
    id: "e6smNOOIBO",
    description: "Validation error when no target locale is selected for a new glossary",
  },
});
