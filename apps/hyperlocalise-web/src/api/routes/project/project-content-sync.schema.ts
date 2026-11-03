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
import { z } from "zod";

import { contentSyncConfigSchema } from "@/lib/agents/content-sync/content-sync-types";
import { projectIdSchema } from "@/lib/projects/identity/project-id";

export const projectContentSyncScheduleSchema = z.enum(["manual", "hourly", "daily"]);

export const projectContentSyncParamsSchema = z.object({
  projectId: projectIdSchema,
});

export const saveProjectContentSyncBodySchema = z.object({
  syncConfig: contentSyncConfigSchema,
  schedule: projectContentSyncScheduleSchema,
});
export type SaveProjectContentSyncBody = z.infer<typeof saveProjectContentSyncBodySchema>;
