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
import { tool, type Tool } from "ai";
import type { z } from "zod";

type DefineAgentToolInput<INPUT, OUTPUT> = {
  description: string;
  inputSchema: z.ZodType<INPUT>;
  outputSchema?: z.ZodType<OUTPUT>;
  execute: (input: INPUT) => Promise<OUTPUT>;
};

export function defineAgentTool<INPUT, OUTPUT = unknown>(
  config: DefineAgentToolInput<INPUT, OUTPUT>,
): Tool<INPUT, OUTPUT> {
  const toolConfig = {
    description: config.description,
    inputSchema: config.inputSchema,
    ...(config.outputSchema ? { outputSchema: config.outputSchema } : {}),
    execute: config.execute,
  };

  return tool(toolConfig as never) as Tool<INPUT, OUTPUT>;
}

export function toolNameFromFilename(filename: string): string {
  return filename.replace(/\.ts$/, "");
}
