import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const { provisionWorkspaceInWorkosMock, deleteProvisionedWorkosOrganizationMock } = vi.hoisted(
  () => ({
    provisionWorkspaceInWorkosMock: vi.fn(),
    deleteProvisionedWorkosOrganizationMock: vi.fn(),
  }),
);

vi.mock("@/lib/workos/provision-workspace-in-workos", () => ({
  provisionWorkspaceInWorkos: provisionWorkspaceInWorkosMock,
  deleteProvisionedWorkosOrganization: deleteProvisionedWorkosOrganizationMock,
}));

import { db, schema } from "@/lib/database";
import { DEFAULT_WORKSPACE_TEAM_SLUG } from "@/lib/teams/default-workspace-team";

import { createWorkspaceForSessionUser } from "./workspace";

describe("createWorkspaceForSessionUser", () => {
  const createdOrganizationIds: string[] = [];
  const createdUserWorkosIds: string[] = [];

  afterEach(async () => {
    vi.clearAllMocks();

    for (const organizationId of createdOrganizationIds.splice(0)) {
      await db.delete(schema.organizations).where(eq(schema.organizations.id, organizationId));
    }

    for (const workosUserId of createdUserWorkosIds.splice(0)) {
      await db.delete(schema.users).where(eq(schema.users.workosUserId, workosUserId));
    }
  });

  it("creates the default team and adds the workspace owner as manager", async () => {
    const workosUserId = `user_${crypto.randomUUID()}`;
    const workosOrganizationId = `org_${crypto.randomUUID()}`;
    const workosMembershipId = `membership_${crypto.randomUUID()}`;
    createdUserWorkosIds.push(workosUserId);

    provisionWorkspaceInWorkosMock.mockResolvedValue({
      workosOrganizationId,
      members: [{ workosUserId, workosMembershipId, role: "admin" }],
    });

    const result = await createWorkspaceForSessionUser({
      sessionUser: {
        id: workosUserId,
        email: `owner-${crypto.randomUUID()}@example.com`,
        firstName: "Owner",
        lastName: "User",
      },
      organizationName: "Onboarding Team Workspace",
    });

    createdOrganizationIds.push(result.organization.id);

    const [team] = await db
      .select({ id: schema.teams.id, slug: schema.teams.slug })
      .from(schema.teams)
      .where(
        and(
          eq(schema.teams.organizationId, result.organization.id),
          eq(schema.teams.slug, DEFAULT_WORKSPACE_TEAM_SLUG),
        ),
      )
      .limit(1);

    expect(team?.slug).toBe(DEFAULT_WORKSPACE_TEAM_SLUG);

    const [membership] = await db
      .select({ role: schema.teamMemberships.role })
      .from(schema.teamMemberships)
      .where(
        and(
          eq(schema.teamMemberships.teamId, team!.id),
          eq(schema.teamMemberships.userId, result.user.id),
        ),
      )
      .limit(1);

    expect(membership?.role).toBe("manager");
  });
});
