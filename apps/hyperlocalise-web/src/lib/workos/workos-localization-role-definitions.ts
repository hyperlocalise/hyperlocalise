import type { WorkosLocalizationRoleSlug } from "./localization-role-slugs";

export type WorkosLocalizationRoleDefinition = {
  slug: WorkosLocalizationRoleSlug;
  name: string;
  description: string;
};

/**
 * Environment roles provisioned in WorkOS via `bun run workos:setup`.
 * Slugs must match `WORKOS_LOCALIZATION_ROLE_SLUGS` and `organization_membership_role`.
 */
export const WORKOS_LOCALIZATION_ROLE_DEFINITIONS: WorkosLocalizationRoleDefinition[] = [
  {
    slug: "admin",
    name: "Admin",
    description: "Full workspace control including billing and organization settings.",
  },
  {
    slug: "localization_manager",
    name: "Localization manager",
    description:
      "Operate projects, integrations, credentials, teams, and knowledge resources; approve reviews and write-back.",
  },
  {
    slug: "developer",
    name: "Developer",
    description:
      "Manage projects and technical jobs (sync, repositories); read integrations. No review approval or org admin.",
  },
  {
    slug: "reviewer",
    name: "Reviewer",
    description:
      "Contribute to jobs and run AI actions; approve reviews and write-back. No organization administration.",
  },
  {
    slug: "translator",
    name: "Translator",
    description:
      "Contribute to assigned jobs, run AI actions, and push draft translations. No approvals or org administration.",
  },
  {
    slug: "contractor",
    name: "Contractor",
    description:
      "External contributor with access limited to explicitly assigned projects and jobs. Cannot browse the full workspace or manage settings.",
  },
  {
    slug: "member",
    name: "Member",
    description: "Read workspace, project, team, glossary, memory, and job surfaces.",
  },
];
