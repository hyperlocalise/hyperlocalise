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
