/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import type { ApiAuthContext } from "@/api/auth/workos";
import { crowdinAuth } from "@/lib/providers/adapters/crowdin/crowdin-auth";
import { getPhraseUserConnectionSummary } from "@/lib/providers/adapters/phrase/phrase-auth";

export async function getCurrentUserProviderAssigneeCandidates(auth: ApiAuthContext) {
  const candidates = [auth.user.email];
  const crowdinUserConnection = await crowdinAuth.getUserConnectionSummary({
    organizationId: auth.organization.localOrganizationId,
    userId: auth.user.localUserId,
  });
  const phraseUserConnection = await getPhraseUserConnectionSummary({
    organizationId: auth.organization.localOrganizationId,
    userId: auth.user.localUserId,
  });

  if (crowdinUserConnection) {
    candidates.push(
      crowdinUserConnection.username,
      crowdinUserConnection.email ?? "",
      crowdinUserConnection.fullName ?? "",
    );
  }
  if (phraseUserConnection) {
    candidates.push(
      phraseUserConnection.username,
      phraseUserConnection.email ?? "",
      phraseUserConnection.fullName ?? "",
    );
  }

  return Array.from(
    new Set(candidates.map((candidate) => candidate.trim()).filter((candidate) => candidate)),
  );
}
