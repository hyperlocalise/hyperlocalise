import type { IntlShape } from "@formatjs/intl";

import type { CatMessageParityIssue } from "./cat-message-format";

export type CatFormatMessageIntl = Pick<IntlShape, "formatMessage">;

export function localizeCatMessageParityIssue(
  issue: CatMessageParityIssue,
  intl: CatFormatMessageIntl,
): { label: string; message: string } {
  switch (issue.kind) {
    case "parse-error": {
      const label =
        issue.parseTarget === "source"
          ? intl.formatMessage({
              defaultMessage: "Source message syntax",
              id: "yRRevnNvnn",
              description: "CAT format check label for invalid source message syntax",
            })
          : intl.formatMessage({
              defaultMessage: "Target message syntax",
              id: "wmlNXZkocx",
              description: "CAT format check label for invalid target message syntax",
            });

      return {
        label,
        message:
          issue.parseErrorMessage ??
          intl.formatMessage({
            defaultMessage: "Message syntax could not be parsed.",
            id: "H0k47esZhc",
            description: "Fallback error when ICU message syntax parsing fails",
          }),
      };
    }
    case "missing-token": {
      const tokens = issue.tokens?.join(", ") ?? "";
      return {
        label: intl.formatMessage({
          defaultMessage: "Missing placeholders",
          id: "AAnhNKa9eI",
          description: "CAT format check label when target is missing required placeholders",
        }),
        message: intl.formatMessage(
          {
            defaultMessage: "Target is missing {tokens} from the source string.",
            id: "dy2mVzOtSq",
            description: "CAT format check message listing placeholders missing from the target",
          },
          { tokens },
        ),
      };
    }
    case "extra-token": {
      const tokens = issue.tokens?.join(", ") ?? "";
      return {
        label: intl.formatMessage({
          defaultMessage: "Extra placeholders",
          id: "bajKG/XM1h",
          description: "CAT format check label when target has placeholders not in the source",
        }),
        message: intl.formatMessage(
          {
            defaultMessage: "Target includes {tokens} that is not in the source string.",
            id: "RuN49xBd1k",
            description: "CAT format check message listing extra placeholders in the target",
          },
          { tokens },
        ),
      };
    }
    case "icu-mismatch": {
      const tokens = issue.tokens?.join(", ") ?? "";
      return {
        label: intl.formatMessage({
          defaultMessage: "ICU structure",
          id: "BresGxSzFx",
          description: "CAT format check label when target ICU structure does not match source",
        }),
        message: intl.formatMessage(
          {
            defaultMessage: "Target ICU structure must match {tokens} from the source string.",
            id: "tsN6wGlUZC",
            description: "CAT format check message listing ICU blocks missing from the target",
          },
          { tokens },
        ),
      };
    }
    default:
      return {
        label: issue.kind,
        message: issue.kind,
      };
  }
}
