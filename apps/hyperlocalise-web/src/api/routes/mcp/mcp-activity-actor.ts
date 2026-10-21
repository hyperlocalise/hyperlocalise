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
import type { ActivityActor } from "@/lib/activity-log/file-segment-events";

/**
 * The activity actor for an MCP tool call: an AI assistant acting for the signed-in person. It is
 * logged as `agent` with that person's id, as the in-app agent tools log their actions, and Reports
 * records agent events as automated work.
 */
export function mcpActivityActor(userId: string): ActivityActor {
  return { actorCredentialId: null, actorKind: "agent", actorUserId: userId };
}
