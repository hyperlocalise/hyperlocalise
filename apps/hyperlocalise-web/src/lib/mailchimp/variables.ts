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

const MAILCHIMP_MERGE_PATTERN = /(\*\|[^|]+\|\*)/g;
const MAILCHIMP_MERGE_PLACEHOLDER = /<!--HL_MC_VAR_(\d+)-->/g;

export function protectMailchimpMergeTags(value: string): { text: string; tokens: string[] } {
  const tokens: string[] = [];
  const text = value.replace(MAILCHIMP_MERGE_PATTERN, (match) => {
    const index = tokens.length;
    tokens.push(match);
    return `<!--HL_MC_VAR_${index}-->`;
  });
  return { text, tokens };
}

export function restoreMailchimpMergeTags(text: string, tokens: string[]): string {
  return text.replace(MAILCHIMP_MERGE_PLACEHOLDER, (_match, index) => {
    const token = tokens[Number(index)];
    return token ?? "";
  });
}
