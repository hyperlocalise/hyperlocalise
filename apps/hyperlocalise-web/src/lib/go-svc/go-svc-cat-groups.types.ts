/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License 1.1,
 * use of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
export interface CatGroupOccurrence {
  id: string;
  key: string;
  sourcePath: string;
  isLocked: boolean;
  /** Present when the key has a character limit; omitted or non-positive means none. */
  maxLength?: number | null;
}

/** One distinct translation shared by some occurrences of an identical source string. */
export interface CatGroupVariant {
  text: string;
  isApproved: boolean;
  occurrences: CatGroupOccurrence[];
}

export interface CatGroupVariantsQuery {
  targetLocale: string;
  /** File path of the grouped row's representative segment, or `"*"`. */
  sourcePath: string;
  /** Queue scope of the grouped row: a file path or `"*"`. */
  groupSourcePath: string;
  groupSourcePaths?: string;
}
