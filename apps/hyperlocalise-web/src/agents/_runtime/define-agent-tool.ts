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
