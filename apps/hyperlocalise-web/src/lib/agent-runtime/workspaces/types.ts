/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
export type WorkspaceLifecyclePolicy =
  | {
      mode: "disposable";
      timeoutMs: number;
      destroyOnFinish: true;
    }
  | {
      mode: "multi_turn";
      idleTimeoutMs: number;
      maxLifetimeMs: number;
      destroyOnExpiry: true;
      snapshotOnPause?: boolean;
    };

export type WorkspaceSecurityPolicy = {
  network: "none" | "allowlisted" | "restricted";
  secrets: "none" | "scoped_ephemeral";
  writeAccess: "none" | "workspace_only" | "external_with_policy";
  allowedCommands?: string[];
  maxCommandRuntimeMs: number;
  maxOutputBytes: number;
};

export type WorkspaceCommandResult = {
  exitCode: number;
  output: string;
};

export type WorkspaceSearchInput = {
  pattern: string;
  path?: string;
  maxResults?: number;
};

export type WorkspaceSearchMatch = {
  path: string;
  lineNum: number;
  line: string;
};

export type WorkspaceSnapshotRef = {
  id: string;
};

export type WorkspaceRuntime = {
  id: string;
  runCommand(
    command: string,
    args: string[],
    options?: { output?: "both" | "stdout" },
  ): Promise<WorkspaceCommandResult>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string | Buffer): Promise<void>;
  search(input: WorkspaceSearchInput): Promise<WorkspaceSearchMatch[]>;
  snapshot(): Promise<WorkspaceSnapshotRef>;
  restore(snapshot: WorkspaceSnapshotRef): Promise<void>;
  stop(): Promise<void>;
};

export type GitWorkspaceSource = {
  type: "git";
  url: string;
  revision: string;
  depth: number;
  username?: string;
  password?: string;
};
