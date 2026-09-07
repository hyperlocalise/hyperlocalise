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

export const EMAIL_PROVIDER_SLUGS = ["resend", "sendgrid"] as const;

export type EmailProviderSlug = (typeof EMAIL_PROVIDER_SLUGS)[number];

export function isEmailProviderSlug(value: string): value is EmailProviderSlug {
  return (EMAIL_PROVIDER_SLUGS as readonly string[]).includes(value);
}

export function toEmailPipesProviderSlug(provider: EmailProviderSlug): PipesProviderSlug {
  return provider;
}
