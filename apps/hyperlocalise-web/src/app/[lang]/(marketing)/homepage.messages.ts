import type { MessageDescriptor } from "@formatjs/intl";

export const marketingHomeMessages = {
  metadataTitle: {
    defaultMessage: "Hyperlocalise | Localisation Platform for the Agentic Era",
    description: "Page title for the marketing homepage",
  },
  metadataDescription: {
    defaultMessage:
      "Assign AI agents to translate, review, and sync content while keeping human review first-class. Stay flexible across LLM providers and TMS platforms.",
    description: "Meta description for the marketing homepage",
  },
  metadataDescriptionOpenGraph: {
    defaultMessage:
      "Assign AI agents to translate, review, and sync content while keeping human review first-class.",
    description:
      "Open Graph meta description for the marketing homepage (shorter than the main description)",
  },
  logoAlt: {
    defaultMessage: "Hyperlocalise",
    description: "Alt text for the Hyperlocalise logo in Open Graph metadata",
  },
  offerCategoryFree: {
    defaultMessage: "Free",
    description: "Schema.org offer category indicating a free tier on the marketing homepage",
  },
} as const satisfies Record<string, MessageDescriptor>;
