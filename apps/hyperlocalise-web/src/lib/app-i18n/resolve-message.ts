import type { IntlShape } from "@formatjs/intl";
import type { MessageDescriptor } from "react-intl";

export type ResolveMessageIntl = Pick<IntlShape, "formatMessage">;

/** Formats with intl when available; otherwise returns string `defaultMessage`. */
export function resolveMessage(
  intl: ResolveMessageIntl | undefined,
  descriptor: MessageDescriptor,
  values?: Record<string, string>,
): string {
  if (intl) {
    return intl.formatMessage(descriptor, values);
  }

  return typeof descriptor.defaultMessage === "string" ? descriptor.defaultMessage : "";
}
