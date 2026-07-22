"use client";

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
import type { IntlShape } from "@formatjs/intl";

import { slugifyTeamName } from "@/api/routes/team/team-slug";
import type { CreateTeamBody, UpdateTeamBody } from "@/api/routes/team/team.schema";
import { resolveMessage } from "@/lib/app-i18n/resolve-message";

import type { TeamSummaryRow } from "./teams-api";
import { teamFormMessages } from "./team-form.messages";

export type TeamFormValues = {
  name: string;
  slug: string;
};

export type TeamFormErrors = Partial<Record<keyof TeamFormValues, string>>;

export type TeamFormIntl = Pick<IntlShape, "formatMessage">;

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

export function validateTeamForm(
  values: TeamFormValues,
  mode: "create" | "edit",
  options?: { intl?: TeamFormIntl },
): TeamFormErrors {
  const errors: TeamFormErrors = {};
  const name = values.name.trim();
  const slug = values.slug.trim();
  const intl = options?.intl;

  if (!name) {
    errors.name = resolveMessage(intl, teamFormMessages.nameRequired);
  } else if (name.length > 120) {
    errors.name = resolveMessage(intl, teamFormMessages.nameTooLong);
  }

  if (mode === "edit" || slug.length > 0) {
    if (!slug) {
      errors.slug = resolveMessage(intl, teamFormMessages.slugRequired);
    } else if (!slugPattern.test(slug)) {
      errors.slug = resolveMessage(intl, teamFormMessages.slugInvalid);
    } else if (slug.length > 120) {
      errors.slug = resolveMessage(intl, teamFormMessages.slugTooLong);
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
