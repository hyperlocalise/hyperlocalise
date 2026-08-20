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

import { GITHUB_AUTO_REVIEW_ADDITIONAL_PROMPT_MAX_LENGTH } from "@/lib/agents/github/github-auto-review-settings";

export const githubAutoReviewRepositorySchema = z.object({
  id: z.string().uuid(),
  fullName: z.string(),
  enabled: z.boolean(),
  archived: z.boolean(),
});

export const githubAutoReviewSettingsSchema = z.object({
  enabled: z.boolean(),
  additionalPrompt: z.string(),
  githubInstallationRepositoryIds: z.array(z.string().uuid()),
  repositories: z.array(githubAutoReviewRepositorySchema),
});

export const updateGithubAutoReviewSettingsBodySchema = z
  .object({
    enabled: z.boolean(),
    additionalPrompt: z.string().max(GITHUB_AUTO_REVIEW_ADDITIONAL_PROMPT_MAX_LENGTH),
    githubInstallationRepositoryIds: z.array(z.string().uuid()),
  })
  .strict();

export type GithubAutoReviewSettingsDto = z.infer<typeof githubAutoReviewSettingsSchema>;
export type UpdateGithubAutoReviewSettingsBody = z.infer<
  typeof updateGithubAutoReviewSettingsBodySchema
>;
