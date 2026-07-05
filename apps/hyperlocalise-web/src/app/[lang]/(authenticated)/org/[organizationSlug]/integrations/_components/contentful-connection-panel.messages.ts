"use client";

import { defineMessages } from "react-intl";

export const contentfulConnectionPanelMessages = defineMessages({
  fetchConnectionsFailed: {
    defaultMessage: "Failed to fetch Contentful connections",
    id: "6ilKS2sOmJ",
    description: "Error when the Contentful connections list fails to load",
  },
  loadMetadataFailed: {
    defaultMessage: "Unable to load Contentful metadata",
    id: "DeRSeFizML",
    description: "Fallback error when Contentful space discovery fails",
  },
  saveConnectionFailed: {
    defaultMessage: "Unable to save Contentful connection",
    id: "EQuzSP+RiS",
    description: "Fallback error when saving a Contentful connection fails",
  },
  connectionSavedToast: {
    defaultMessage: "Contentful connection saved",
    id: "V8Rg1mvKHG",
    description: "Toast after successfully saving a Contentful connection",
  },
  webhookRegisteredToastTitle: {
    defaultMessage: "Contentful webhook registered",
    id: "IypYQDIY3f",
    description: "Toast title when a Contentful webhook is created",
  },
  webhookRegisteredToastDescription: {
    defaultMessage:
      "Hyperlocalise created the Contentful webhook automatically. Save the secret below if you need to re-register manually.",
    id: "ZNrsvoazsU",
    description: "Toast description when a Contentful webhook is created",
  },
  webhookSyncedToastTitle: {
    defaultMessage: "Contentful webhook synced",
    id: "W3/qvnQA3o",
    description: "Toast title when an existing Contentful webhook is updated",
  },
  webhookSyncedToastDescription: {
    defaultMessage: "Hyperlocalise updated the Contentful webhook configuration.",
    id: "Oiey9nLAFp",
    description: "Toast description when an existing Contentful webhook is updated",
  },
  webhookNeedsAttentionToastTitle: {
    defaultMessage: "Contentful webhook needs attention",
    id: "dJURPyuGPM",
    description: "Toast title when Contentful webhook registration failed",
  },
  tokenGuidance: {
    defaultMessage:
      "Use a Content Management API personal access token from Contentful Settings → Content management tokens. Do not use Content Delivery or Preview API keys — those are read-only and cannot write draft translations or register webhooks.",
    id: "YnIu9s0qeQ",
    description: "Guidance for choosing a Contentful Management API token",
  },
  enterCredentialsForContentTypes: {
    defaultMessage:
      "Enter your Space ID and Content Management API token to load content types from Contentful.",
    id: "Iy7BBXsi+j",
    description: "Hint before credentials are entered for content type discovery",
  },
  loadingContentTypes: {
    defaultMessage: "Loading content types…",
    id: "lT0LhQ0lGx",
    description: "Loading state while fetching Contentful content types",
  },
  noContentTypesFound: {
    defaultMessage: "No content types found in this space.",
    id: "u5hy7XQ9he",
    description: "Empty state when Contentful returns no content types",
  },
  tokenBadge: {
    defaultMessage: "Token …{suffix}",
    id: "7+phzkP936",
    description: "Badge showing the masked suffix of a stored Contentful token",
  },
  displayNameLabel: {
    defaultMessage: "Display name",
    id: "i9ZZoI20Cm",
    description: "Label for the Contentful connection display name field",
  },
  displayNamePlaceholder: {
    defaultMessage: "Contentful Help Center",
    id: "A+IsVf0TGL",
    description: "Placeholder for the Contentful connection display name field",
  },
  spaceIdLabel: {
    defaultMessage: "Space ID",
    id: "wtxoYMaNGy",
    description: "Label for the Contentful space ID field",
  },
  environmentIdLabel: {
    defaultMessage: "Environment ID",
    id: "kw9ywOaVL3",
    description: "Label for the Contentful environment ID field",
  },
  environmentIdPlaceholder: {
    defaultMessage: "master",
    id: "F+43ZMkvwH",
    description: "Placeholder for the Contentful environment ID field",
  },
  cmaTokenLabel: {
    defaultMessage: "Content Management API token",
    id: "7QQUiWq0U1",
    description: "Label for the Contentful Management API token field",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "wSu0+cW+hv",
    description: "Button to cancel replacing a stored Contentful token",
  },
  replaceToken: {
    defaultMessage: "Replace token",
    id: "zjfCQW7GjW",
    description: "Button to start replacing a stored Contentful token",
  },
  contentTypesLabel: {
    defaultMessage: "Content types",
    id: "akKSazt0o+",
    description: "Label for the Contentful content type picker field",
  },
  webhookHeading: {
    defaultMessage: "Webhook",
    id: "6DqYm4cuZL",
    description: "Heading for Contentful webhook status section",
  },
  webhookDescription: {
    defaultMessage:
      "Hyperlocalise registers a Contentful webhook for entry publish events when you save or validate this connection. Automations with a Contentful trigger use it to start translation runs.",
    id: "bCzZNsSN41",
    description: "Explains how Contentful webhooks are used",
  },
  registrationLabel: {
    defaultMessage: "Registration:",
    id: "8vYRLImWYG",
    description: "Label prefix for webhook registration status",
  },
  registrationRegistered: {
    defaultMessage: "Registered in Contentful",
    id: "GRJxQXl5PH",
    description: "Webhook registration status when registered",
  },
  registrationNotRegistered: {
    defaultMessage: "Not registered",
    id: "z48kpV5sye",
    description: "Webhook registration status when registration failed",
  },
  registrationPending: {
    defaultMessage: "Pending registration",
    id: "304a0qYa4S",
    description: "Webhook registration status before registration completes",
  },
  webhookUrl: {
    defaultMessage: "URL: {url}",
    id: "y+0ftMWpAa",
    description: "Contentful webhook callback URL display",
  },
  webhookUrlUnset: {
    defaultMessage: "Set HYPERLOCALISE_PUBLIC_APP_URL",
    id: "OS+T5iqT3s",
    description: "Placeholder when webhook URL env var is not configured",
  },
  contentfulWebhookId: {
    defaultMessage: "Contentful webhook ID: {webhookId}",
    id: "cOeHLAqsSE",
    description: "Displays the provider-assigned Contentful webhook ID",
  },
  webhookSecret: {
    defaultMessage: "Secret: {secret}",
    id: "hj7GTNbnw4",
    description: "Displays the Contentful webhook signing secret",
  },
  lastDeliveryAt: {
    defaultMessage: "Last delivery: {timestamp}",
    id: "5KdZWVlAAs",
    description: "Shows when the Contentful webhook last delivered an event",
  },
  lastDeliveryNone: {
    defaultMessage: "Last delivery: No deliveries yet",
    id: "T7ocGbiped",
    description: "Shown when the Contentful webhook has not delivered events",
  },
  saving: {
    defaultMessage: "Saving…",
    id: "uF3cBjB2oQ",
    description: "Save button label while a Contentful connection is saving",
  },
  updateConnection: {
    defaultMessage: "Update connection",
    id: "CQCxmYWm3f",
    description: "Save button label when editing an existing Contentful connection",
  },
  saveConnection: {
    defaultMessage: "Save connection",
    id: "DxmswO0BaI",
    description: "Save button label when creating a new Contentful connection",
  },
});
