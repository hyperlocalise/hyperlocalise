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
 * Resolved Bitbucket Cloud repository context for a repository sandbox clone. The clone URL is
 * built from the fixed Bitbucket host and `repositoryFullName`, never from a link Bitbucket gave.
 */
export const repositoryAgentBitbucketContextSchema = z.object({
  resolved: z.literal(true),
  provider: z.literal("bitbucket"),
  /** Bitbucket's own id, with its braces. */
  repositoryUuid: z.string(),
  /** `workspace/repo-slug`. */
  repositoryFullName: z.string(),
  pullRequestId: z.number().optional(),
  branch: z.string().optional(),
});

export type RepositoryAgentBitbucketContext = z.infer<typeof repositoryAgentBitbucketContextSchema>;
