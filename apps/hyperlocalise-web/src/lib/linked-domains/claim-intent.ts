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
import { cookies } from "next/headers";
import { z } from "zod";

import { isValidDomainSlug } from "@/lib/localisation-audit/domain-slug";
import { sanitizeReturnTo } from "@/lib/workos/return-to";

export const claimDomainIntentCookieName = "hl_claim_domain_intent";

const claimDomainIntentSchema = z.object({
  domainSlug: z.string().min(1),
});

export type ClaimDomainIntent = z.infer<typeof claimDomainIntentSchema>;

export async function getClaimDomainIntent(): Promise<ClaimDomainIntent | null> {
  const rawValue = (await cookies()).get(claimDomainIntentCookieName)?.value;
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = claimDomainIntentSchema.parse(JSON.parse(rawValue));
    if (!isValidDomainSlug(parsed.domainSlug)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function setClaimDomainIntent(domainSlug: string) {
  if (!isValidDomainSlug(domainSlug)) {
    return;
  }

  (await cookies()).set(claimDomainIntentCookieName, JSON.stringify({ domainSlug }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60,
  });
}

export async function clearClaimDomainIntent() {
  (await cookies()).delete(claimDomainIntentCookieName);
}

/** Resolve post-auth destination for a claim intent, or null. */
export function claimDomainPathForOrg(organizationSlug: string, domainSlug: string) {
  return sanitizeReturnTo(`/org/${organizationSlug}/link-domain/${domainSlug}`, "/dashboard");
}
