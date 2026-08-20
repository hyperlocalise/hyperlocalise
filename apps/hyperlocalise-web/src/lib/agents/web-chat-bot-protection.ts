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
import { checkBotId } from "botid/server";
import type { Context } from "hono";

import { forbiddenResponse } from "@/api/response.schema";

export async function rejectWebChatBot(c: Context) {
  const verification = await checkBotId();
  if (verification.isBot) {
    return forbiddenResponse(
      c,
      "bot_detected",
      "Automated traffic is not allowed for this endpoint",
    );
  }
  return null;
}
