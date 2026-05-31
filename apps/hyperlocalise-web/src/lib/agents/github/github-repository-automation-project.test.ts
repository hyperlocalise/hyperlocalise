import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vite-plus/test";

import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { db, schema } from "@/lib/database";
import { ensureDefaultWorkspaceTeam } from "@/lib/teams/default-workspace-team";

import { resolveGithubRepositoryAutomationProjectId } from "./github-repository-automation-project";

const fixture = createProjectTestFixture();

async function createProjectInOrganization(organizationId: string, name: string) {
  const team = await ensureDefaultWorkspaceTeam(organizationId);
  const [project] = await db
    .insert(schema.projects)
    .values({
      id: `project_${randomUUID()}`,
      organizationId,
      teamId: team.id,
      createdByUserId: null,
      name,
      description: "",
      translationContext: "",
    })
    .returning();

  return project!;
}

describe("resolveGithubRepositoryAutomationProjectId", () => {
  afterEach(async () => {
    await fixture.cleanup();
  });

  it("prefers an explicit project configured on push source settings", async () => {
    const { organization, project } = await fixture.createStoredProjectFixture();

    const resolved = await resolveGithubRepositoryAutomationProjectId({
      organizationId: organization.id,
      repositoryFullName: "hyperlocalise/hyperlocalise",
      configuredProjectId: project.id,
    });

    expect(resolved).toBe(project.id);
  });

  it("resolves a unique project from connector repository mappings", async () => {
    const { organization, project } = await fixture.createStoredProjectFixture();

    await db
      .insert(schema.connectors)
      .values({
        organizationId: organization.id,
        kind: "slack",
        enabled: true,
        config: {
          repository: {
            github: {
              projectRepositories: {
                [project.id]: "hyperlocalise/hyperlocalise",
              },
            },
          },
        },
      })
      .onConflictDoUpdate({
        target: [schema.connectors.organizationId, schema.connectors.kind],
        set: {
          config: {
            repository: {
              github: {
                projectRepositories: {
                  [project.id]: "hyperlocalise/hyperlocalise",
                },
              },
            },
          },
          updatedAt: new Date(),
        },
      });

    const resolved = await resolveGithubRepositoryAutomationProjectId({
      organizationId: organization.id,
      repositoryFullName: "hyperlocalise/hyperlocalise",
    });

    expect(resolved).toBe(project.id);
  });

  it("returns null when multiple projects map to the same repository", async () => {
    const { organization } = await fixture.createStoredProjectFixture();
    const firstProject = await createProjectInOrganization(organization.id, "First Project");
    const secondProject = await createProjectInOrganization(organization.id, "Second Project");

    await db
      .insert(schema.connectors)
      .values({
        organizationId: organization.id,
        kind: "slack",
        enabled: true,
        config: {
          repository: {
            github: {
              projectRepositories: {
                [firstProject.id]: "hyperlocalise/hyperlocalise",
                [secondProject.id]: "hyperlocalise/hyperlocalise",
              },
            },
          },
        },
      })
      .onConflictDoUpdate({
        target: [schema.connectors.organizationId, schema.connectors.kind],
        set: {
          config: {
            repository: {
              github: {
                projectRepositories: {
                  [firstProject.id]: "hyperlocalise/hyperlocalise",
                  [secondProject.id]: "hyperlocalise/hyperlocalise",
                },
              },
            },
          },
          updatedAt: new Date(),
        },
      });

    const resolved = await resolveGithubRepositoryAutomationProjectId({
      organizationId: organization.id,
      repositoryFullName: "hyperlocalise/hyperlocalise",
    });

    expect(resolved).toBeNull();
  });
});
