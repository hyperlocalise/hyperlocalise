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

/**
 * Resolved GitLab project context for repository sandbox clone.
 */
export const repositoryAgentGitLabContextSchema = z.object({
  resolved: z.literal(true),
  provider: z.literal("gitlab"),
  projectId: z.number(),
  repositoryFullName: z.string(),
  httpUrlToRepo: z.string(),
  instanceOrigin: z.string().optional(),
  connectionId: z.string().uuid().optional(),
  mergeRequestIid: z.number().optional(),
  branch: z.string().optional(),
  commitSha: z.string().optional(),
});

export type RepositoryAgentGitLabContext = z.infer<typeof repositoryAgentGitLabContextSchema>;
