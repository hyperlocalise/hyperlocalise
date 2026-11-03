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

/** Mailchimp campaigns and templates have no locale. Use the native project source. */
export function resolveMailchimpSourceLocale(projectSourceLocale?: string | null): string {
  return projectSourceLocale?.trim() || "en";
}

export function mailchimpCopyName(sourceName: string, locale: string): string {
  const base = sourceName.trim() || "Content";
  return `${base} [${locale.trim() || "locale"}]`;
}

export function isMailchimpLocaleCopyName(name: string): boolean {
  return /\[[^\]]+\]\s*$/.test(name.trim());
}
