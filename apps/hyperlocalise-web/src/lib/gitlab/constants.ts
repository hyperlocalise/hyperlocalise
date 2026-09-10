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
import type { PipesProviderSlug } from "@/lib/pipes/providers";

/** WorkOS Pipes slug for the GitLab OAuth provider. */
export const GITLAB_PIPES_SLUG = "gitlab" satisfies PipesProviderSlug;

/** GitLab.com REST API origin used for project listing and clone metadata. */
export const GITLAB_API_ORIGIN = "https://gitlab.com";

/** HTTP basic-auth username GitLab expects for OAuth access tokens. */
export const GITLAB_GIT_OAUTH_USERNAME = "oauth2";

/** Reporter and above can clone project source. */
export const GITLAB_CLONE_MIN_ACCESS_LEVEL = 20;

export const GITLAB_PROJECT_PAGE_SIZE = 100;

export const GITLAB_PROJECT_MAX_PAGES = 3;
