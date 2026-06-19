import type { IntlShape } from "@formatjs/intl";

export function getBlogRouteMetadata(intl: IntlShape) {
  return {
    title: intl.formatMessage({
      defaultMessage: "Blog | Hyperlocalise",
      id: "SGrQFByJdA",
      description: "Meta title for the marketing blog index page",
    }),
    description: intl.formatMessage({
      defaultMessage:
        "Updates, product thinking, and lessons from building agent-native localisation workflows.",
      id: "7OEl2Ch1Rv",
      description: "Meta description for the marketing blog index page",
    }),
  };
}
