import type { IntlShape } from "@formatjs/intl";

export function getProductRouteMetadata(slug: string, intl: IntlShape) {
  switch (slug) {
    case "agents-automation":
      return {
        title: intl.formatMessage({
          defaultMessage: "Stop Chasing Localisation Work Across Tools | Hyperlocalise",
          id: "AWZymO5ooC",
          description: "Page title for the agents automation product page",
        }),
        description: intl.formatMessage({
          defaultMessage:
            "Catch source changes, route localisation work, gather context, and keep human review in control across your existing tools.",
          id: "63np7ewMDD",
          description: "Meta description for the agents automation product page",
        }),
      };
    case "next-gen-cat-tool":
      return {
        title: intl.formatMessage({
          defaultMessage: "Review Translations With the Context Next to the String | Hyperlocalise",
          id: "zwRYJHfFfL",
          description: "Page title for the next-gen CAT tool product page",
        }),
        description: intl.formatMessage({
          defaultMessage:
            "Give reviewers the source, target, product context, glossary guidance, AI notes, comments, and quality checks in one translation workspace.",
          id: "fdVXMcsjuq",
          description: "Meta description for the next-gen CAT tool product page",
        }),
      };
    case "self-evolving-knowledge":
      return {
        title: intl.formatMessage({
          defaultMessage: "Stop Repeating the Same Localisation Feedback | Hyperlocalise",
          id: "Ov7k7O9mR3",
          description: "Page title for the self-evolving knowledge product page",
        }),
        description: intl.formatMessage({
          defaultMessage:
            "Capture reviewer corrections, glossary decisions, product context, and market preferences so every localisation workflow starts smarter.",
          id: "G1is+5n2E6",
          description: "Meta description for the self-evolving knowledge product page",
        }),
      };
    default:
      return null;
  }
}
