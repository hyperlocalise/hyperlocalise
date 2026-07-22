/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
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
