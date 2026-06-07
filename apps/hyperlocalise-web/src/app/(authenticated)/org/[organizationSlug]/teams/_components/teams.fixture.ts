import type {
  OrganizationMemberDirectoryEntry,
  TeamDetail,
  TeamMemberRow,
  TeamSummaryRow,
} from "./teams-api";

const fixedNow = "2026-06-07T12:00:00.000Z";

export function createTeamSummary(overrides: Partial<TeamSummaryRow> = {}): TeamSummaryRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    slug: "localization",
    name: "Localization",
    createdAt: fixedNow,
    updatedAt: fixedNow,
    memberCount: 4,
    currentUserRole: "manager",
    ...overrides,
  };
}

export function createTeamMember(overrides: Partial<TeamMemberRow> = {}): TeamMemberRow {
  return {
    workosUserId: "user_001",
    email: "mina@example.com",
    role: "manager",
    ...overrides,
  };
}

export function createTeamDetail(overrides: Partial<TeamDetail> = {}): TeamDetail {
  const summary = createTeamSummary();
  return {
    id: summary.id,
    organizationId: "org_001",
    slug: summary.slug,
    name: summary.name,
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt,
    members: [
      createTeamMember(),
      createTeamMember({
        workosUserId: "user_002",
        email: "otto@example.com",
        role: "member",
      }),
      createTeamMember({
        workosUserId: "user_003",
        email: "aiko@example.com",
        role: "member",
      }),
    ],
    ...overrides,
  };
}

export function createMemberDirectoryEntry(
  overrides: Partial<OrganizationMemberDirectoryEntry> = {},
): OrganizationMemberDirectoryEntry {
  return {
    workosUserId: "user_004",
    email: "sam@example.com",
    ...overrides,
  };
}

export const teamsFixture: TeamSummaryRow[] = [
  createTeamSummary(),
  createTeamSummary({
    id: "22222222-2222-4222-8222-222222222222",
    slug: "marketing",
    name: "Marketing",
    memberCount: 2,
    currentUserRole: "member",
  }),
  createTeamSummary({
    id: "33333333-3333-4333-8333-333333333333",
    slug: "default",
    name: "Default",
    memberCount: 8,
    currentUserRole: null,
  }),
];

export const memberDirectoryFixture: OrganizationMemberDirectoryEntry[] = [
  createMemberDirectoryEntry(),
  createMemberDirectoryEntry({
    workosUserId: "user_005",
    email: "lee@example.com",
  }),
];
