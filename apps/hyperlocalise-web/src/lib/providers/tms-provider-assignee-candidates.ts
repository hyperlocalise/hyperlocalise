import type { ApiAuthContext } from "@/api/auth/workos";
import { getCrowdinUserConnectionSummary } from "@/lib/providers/adapters/crowdin/crowdin-user-connections";
import { getPhraseUserConnectionSummary } from "@/lib/providers/adapters/phrase/phrase-user-connections";

export async function getCurrentUserProviderAssigneeCandidates(auth: ApiAuthContext) {
  const candidates = [auth.user.email];
  const crowdinUserConnection = await getCrowdinUserConnectionSummary({
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
