import { slugifyTeamName } from "@/api/routes/team/team-slug";
import type { CreateTeamBody, UpdateTeamBody } from "@/api/routes/team/team.schema";

import type { TeamSummaryRow } from "./teams-api";

export type TeamFormValues = {
  name: string;
  slug: string;
};

export type TeamFormErrors = Partial<Record<keyof TeamFormValues, string>>;

const slugPattern = /^[a-z0-9-]+$/;

export function createEmptyTeamForm(): TeamFormValues {
  return {
    name: "",
    slug: "",
  };
}

export function createTeamFormFromSummary(
  team: Pick<TeamSummaryRow, "name" | "slug">,
): TeamFormValues {
  return {
    name: team.name,
    slug: team.slug,
  };
}

export function validateTeamForm(values: TeamFormValues, mode: "create" | "edit"): TeamFormErrors {
  const errors: TeamFormErrors = {};
  const name = values.name.trim();
  const slug = values.slug.trim();

  if (!name) {
    errors.name = "Team name is required.";
  } else if (name.length > 120) {
    errors.name = "Team name must be 120 characters or fewer.";
  }

  if (mode === "edit" || slug.length > 0) {
    if (!slug) {
      errors.slug = "Team slug is required.";
    } else if (!slugPattern.test(slug)) {
      errors.slug = "Use lowercase letters, numbers, and hyphens only.";
    } else if (slug.length > 120) {
      errors.slug = "Team slug must be 120 characters or fewer.";
    }
  }

  return errors;
}

export function teamFormHasErrors(errors: TeamFormErrors) {
  return Object.keys(errors).length > 0;
}

export function toCreateTeamPayload(values: TeamFormValues): CreateTeamBody {
  const name = values.name.trim();
  const slug = values.slug.trim();

  return {
    name,
    ...(slug ? { slug } : {}),
  };
}

export function toUpdateTeamPayload(values: TeamFormValues): UpdateTeamBody {
  return {
    name: values.name.trim(),
    slug: values.slug.trim(),
  };
}

export function suggestTeamSlug(name: string) {
  return slugifyTeamName(name);
}
