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

/** WorkOS Pipes data-integration slug for Mailchimp. */
export const MAILCHIMP_PIPES_SLUG = "mailchimp" satisfies PipesProviderSlug;

export const MAILCHIMP_RESOURCE_KINDS = ["campaign", "template"] as const;
export type MailchimpResourceKind = (typeof MAILCHIMP_RESOURCE_KINDS)[number];

export const MAILCHIMP_LIST_PAGE_SIZE = 100;
