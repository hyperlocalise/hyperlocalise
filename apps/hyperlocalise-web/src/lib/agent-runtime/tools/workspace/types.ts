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
import type { Bash } from "just-bash";

/** Sandbox-scoped bash adapter for workspace primitive tools. */
export type RepoToolContext = {
  bash: Pick<Bash, "exec" | "readFile"> & {
    writeWorkspaceFile?: (path: string, content: string | Buffer) => Promise<void>;
  };
};
