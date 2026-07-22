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
import { Sandbox } from "@vercel/sandbox";

export async function runSandboxCommand(
  sandboxId: string,
  command: string,
  args: string[],
  options?: { env?: Record<string, string> },
): Promise<{ exitCode: number; output: string }> {
  const sandbox = await Sandbox.get({ name: sandboxId });
  const result = await sandbox.runCommand({
    cmd: command,
    args,
    env: options?.env,
  });
  return {
    exitCode: result.exitCode,
    output: await result.output("both"),
  };
}
