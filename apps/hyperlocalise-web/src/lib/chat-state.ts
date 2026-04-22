import { createMemoryState } from "@chat-adapter/state-memory";

import { env } from "@/lib/env";

type ChatStateAdapter = ReturnType<typeof createMemoryState>;

type PostgresStateFactory = (options: { connectionString: string }) => ChatStateAdapter;

export function createChatStateAdapter(): ChatStateAdapter {
  if (!env.CHAT_STATE_DATABASE_URL) {
    return createMemoryState();
  }

  let createPostgresState: PostgresStateFactory;

  try {
    ({ createPostgresState } = require("@chat-adapter/state-pg") as {
      createPostgresState: PostgresStateFactory;
    });
  } catch (err) {
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === "MODULE_NOT_FOUND") {
      throw new Error(
        "CHAT_STATE_DATABASE_URL is set but @chat-adapter/state-pg is not installed. Add @chat-adapter/state-pg to dependencies.",
      );
    }
    throw err;
  }

  return createPostgresState({ connectionString: env.CHAT_STATE_DATABASE_URL });
}
