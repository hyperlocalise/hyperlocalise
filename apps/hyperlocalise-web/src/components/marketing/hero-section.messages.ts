import type { MessageDescriptor } from "@formatjs/intl";

export const heroSectionMessages = {
  headline: {
    defaultMessage: "The localization platform to launch globally in days",
    description: "Marketing homepage hero headline",
  },
  body: {
    defaultMessage:
      "Purpose-built for localization in the AI era.<lineBreak></lineBreak>Designed for human-in-the-loop.",
    description: "Marketing homepage hero supporting copy below the headline",
  },
  joinWaitlist: {
    defaultMessage: "Join waitlist",
    description: "Primary call-to-action button on the marketing homepage hero",
  },
} as const satisfies Record<string, MessageDescriptor>;
