"use client";

import { defineMessages } from "react-intl";

export const emailIntegrationRowMessages = defineMessages({
  name: {
    defaultMessage: "Email",
    id: "b+pVg94kFI",
    description: "Email agent integration name on the integrations page",
  },
  descriptionReady: {
    defaultMessage:
      "Inbound address ready. Send files or images with a target language to translate by email.",
    id: "lWsEWOz8r0",
    description: "Email integration description when an inbound address exists",
  },
  descriptionNotReady: {
    defaultMessage:
      "Enable the email agent to receive a unique workspace address for translation requests.",
    id: "vd4gOsmpWc",
    description: "Email integration description before an inbound address is generated",
  },
  panelInstructions: {
    defaultMessage:
      "Send documents, spreadsheets, JSON, text files, or images with a target language. Source language is optional, and style notes apply to file translations.",
    id: "a917ExUu0o",
    description: "Instructions in the email agent settings panel",
  },
  enableEmailAgentAriaLabel: {
    defaultMessage: "Enable email agent",
    id: "Ubm7I3eMos",
    description: "Aria label for the email agent enable switch",
  },
  loadError: {
    defaultMessage: "Unable to load email agent settings right now.",
    id: "WnNeQt1daO",
    description: "Error message when email agent settings fail to load",
  },
  intakeAddressAriaLabel: {
    defaultMessage: "Email agent intake address",
    id: "EyTy76luBD",
    description: "Aria label for the read-only inbound email address field",
  },
  placeholderUnavailable: {
    defaultMessage: "Email agent settings unavailable",
    id: "GM92+KcSLv",
    description: "Placeholder when email agent settings failed to load",
  },
  placeholderEnable: {
    defaultMessage: "Enable email agent to generate inbox address",
    id: "I7LI9gWPKv",
    description: "Placeholder before the email agent is enabled",
  },
  copiedAriaLabel: {
    defaultMessage: "Copied!",
    id: "H7MZFgXFSw",
    description: "Aria label after copying the inbound email address",
  },
  copyAriaLabel: {
    defaultMessage: "Copy email address",
    id: "2jyWXfstrf",
    description: "Aria label for the copy inbound email address button",
  },
  copiedTooltip: {
    defaultMessage: "Copied!",
    id: "uPLvPG1gYg",
    description: "Tooltip after copying the inbound email address",
  },
  copyTooltip: {
    defaultMessage: "Copy email address",
    id: "Y+UFarvRd2",
    description: "Tooltip for the copy inbound email address button",
  },
  inboundEmailCopiedToast: {
    defaultMessage: "Inbound email copied",
    id: "kod/dgRhlc",
    description: "Toast after copying the email agent inbound address",
  },
  enabledToast: {
    defaultMessage: "Email agent enabled",
    id: "Z3S7OrVNyY",
    description: "Toast after enabling the email agent",
  },
  disabledToast: {
    defaultMessage: "Email agent disabled",
    id: "bW5VkndWCk",
    description: "Toast after disabling the email agent",
  },
  updateFailedToast: {
    defaultMessage: "Unable to update email agent right now",
    id: "dCPFe2ny4S",
    description: "Toast when enabling or disabling the email agent fails",
  },
});
