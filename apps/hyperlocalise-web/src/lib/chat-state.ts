import type { StateAdapter } from "chat";
import { createMemoryState } from "@chat-adapter/state-memory";
import { createPostgresState } from "@chat-adapter/state-pg";

import { env } from "@/lib/env";

export function createChatStateAdapter(): StateAdapter {
  if (!env.CHAT_STATE_DATABASE_URL) {
    return createMemoryState();
  }

  return createPostgresState({ url: env.CHAT_STATE_DATABASE_URL });
}
