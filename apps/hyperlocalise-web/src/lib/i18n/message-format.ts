/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { z } from "zod";

/**
 * Placeholder syntax for a source file. Matches go `segmentvalidate.MessageFormat`.
 * - `auto`: ICU arguments and mustache/i18next `{{name}}` interpolations.
 * - `icu`: ICU only; `{{name}}` and `$t(key)` are literal text.
 * - `i18next`: i18next only; single braces are literal text and ICU is not parsed.
 */
export const messageFormats = ["auto", "icu", "i18next"] as const;

export type MessageFormat = (typeof messageFormats)[number];

export const DEFAULT_MESSAGE_FORMAT: MessageFormat = "auto";

export const messageFormatSchema = z.enum(messageFormats);

export function normalizeMessageFormat(value: string | null | undefined): MessageFormat {
  const parsed = messageFormatSchema.safeParse(value?.trim().toLowerCase());
  return parsed.success ? parsed.data : DEFAULT_MESSAGE_FORMAT;
}

export function messageFormatParsesIcu(format: MessageFormat) {
  return format !== "i18next";
}

export function messageFormatParsesInterpolations(format: MessageFormat) {
  return format !== "icu";
}
