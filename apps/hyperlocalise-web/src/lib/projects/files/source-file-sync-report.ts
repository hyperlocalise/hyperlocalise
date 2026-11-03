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

/**
 * What a repository sync's ingest could not settle on its own, kept on the source file version
 * so a run summary and, later, a sync panel can show it. Key names only: the texts are on the
 * keys themselves.
 */
export type SourceFileSyncReport = {
  /**
   * Keys whose repository text and platform text both changed since the last import, and
   * differ from each other. The platform's text was kept.
   */
  clashes: string[];
  /** Keys in the project that the imported file no longer has. They were hidden, not deleted. */
  missingKeys: string[];
};
