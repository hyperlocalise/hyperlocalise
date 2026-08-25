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
import type { RepoToolContext } from "./types";

const UNSAFE_SEARCH_ROOT_EXIT_CODE = 78;

const SEARCH_ROOT_GUARD_SCRIPT = `set -fu
search_root=$1
shift
current=.
remaining=$search_root

if [ "$search_root" != "." ]; then
  while [ -n "$remaining" ]; do
    case "$remaining" in
      */*)
        component=\${remaining%%/*}
        remaining=\${remaining#*/}
        ;;
      *)
        component=$remaining
        remaining=
        ;;
    esac

    [ -n "$component" ] || continue
    if [ "$current" = "." ]; then
      current=$component
    else
      current=$current/$component
    fi

    if [ -L "$current" ]; then
      exit ${UNSAFE_SEARCH_ROOT_EXIT_CODE}
    fi
  done
fi

exec "$@"`;

type BashExecResult = Awaited<ReturnType<RepoToolContext["bash"]["exec"]>>;

export type WorkspaceSearchExecResult =
  | { success: true; result: BashExecResult }
  | { success: false; error: string };

/** Check every search-root component immediately before executing the search. */
export async function execWorkspaceSearch(
  ctx: RepoToolContext,
  input: { command: string; args: string[]; searchRoot: string },
): Promise<WorkspaceSearchExecResult> {
  const result = await ctx.bash.exec("bash", {
    args: [
      "-c",
      SEARCH_ROOT_GUARD_SCRIPT,
      "workspace-search",
      input.searchRoot,
      input.command,
      ...input.args,
    ],
  });

  if (result.exitCode === UNSAFE_SEARCH_ROOT_EXIT_CODE) {
    return {
      success: false,
      error: "Search path must not contain symbolic links.",
    };
  }

  return { success: true, result };
}
