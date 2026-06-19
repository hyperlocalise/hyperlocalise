import { sql, type SQL } from "drizzle-orm";

import { schema } from "@/lib/database";

export function normalizeProviderAssigneeCandidates(candidates: string[]): string[] {
  return Array.from(
    new Set(candidates.map((candidate) => candidate.trim().toLowerCase()).filter(Boolean)),
  );
}

export function matchesProviderAssignee(assignedUser: string, candidates: string[]): boolean {
  const normalizedAssignedUser = assignedUser.trim().toLowerCase();
  if (!normalizedAssignedUser) {
    return false;
  }

  return normalizeProviderAssigneeCandidates(candidates).includes(normalizedAssignedUser);
}

export function providerAssignedUsersMatch(candidates: string[]): SQL {
  const normalizedCandidates = normalizeProviderAssigneeCandidates(candidates);

  if (normalizedCandidates.length === 0) {
    return sql`false`;
  }

  const candidatePredicates = normalizedCandidates.map(
    (candidate) => sql`lower(assigned_user.value) = ${candidate}`,
  );

  return sql`exists (
    select 1
    from jsonb_array_elements_text(${schema.externalJobDetails.assignedUsers}) as assigned_user(value)
    where ${sql.join(candidatePredicates, sql` or `)}
  )`;
}
