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

/** Bitbucket Cloud's REST API origin. Every Bitbucket call goes here, never to an address someone typed. */
export const BITBUCKET_API_ORIGIN = "https://api.bitbucket.org";

export const BITBUCKET_REPOSITORY_PAGE_SIZE = 100;

export const BITBUCKET_REPOSITORY_MAX_PAGES = 3;

export const BITBUCKET_REQUEST_TIMEOUT_MS = 15_000;

/** A commit of many files takes Bitbucket longer to apply than a read; the answer is waited for. */
export const BITBUCKET_WRITE_REQUEST_TIMEOUT_MS = 60_000;

/** WorkOS Pipes slug for Bitbucket. The workspace shares one organization-owned connection. */
export const BITBUCKET_PIPES_SLUG = "bitbucket" satisfies PipesProviderSlug;

/** Bitbucket Cloud's git host. Clones go here, never to a link Bitbucket or a person gave. */
export const BITBUCKET_GIT_ORIGIN = "https://bitbucket.org";

/** The git username Bitbucket expects with a bearer token in place of a password. */
export const BITBUCKET_GIT_TOKEN_USERNAME = "x-token-auth";
