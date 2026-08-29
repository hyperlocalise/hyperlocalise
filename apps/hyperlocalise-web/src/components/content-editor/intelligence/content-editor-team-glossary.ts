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
import type { IntlShape } from "react-intl";

import { contentEditorIntelligencePanelMessages } from "@/components/content-editor/shared/content-editor.messages";
import { DEFAULT_WORKSPACE_TEAM_SLUG } from "@/lib/teams/default-workspace-team-constants";

export type ContentEditorContributorTeam = {
  id: string;
  name: string;
  slug?: string;
};

export type ContentEditorTeamGlossaryOption = {
  id: string;
  name: string;
  teamId: string;
};

export function isHiddenDefaultContributorTeam(team: { slug?: string }) {
  return team.slug === DEFAULT_WORKSPACE_TEAM_SLUG;
}

export function formatCatSharedWithTeamGlossaryName(intl: IntlShape, teamName: string) {
  if (!teamName.trim()) {
    return intl.formatMessage(contentEditorIntelligencePanelMessages.addToGlossaryNoteFallback);
  }

  return intl.formatMessage(contentEditorIntelligencePanelMessages.addToGlossarySharedWithTeam, {
    teamName,
  });
}

export function resolveCatContributorTeams({
  contributorTeams,
  projectTeamId,
  projectTeamName,
  projectTeamSlug,
}: {
  contributorTeams: ContentEditorContributorTeam[];
  projectTeamId?: string;
  projectTeamName?: string;
  projectTeamSlug?: string;
}): ContentEditorContributorTeam[] {
  const visibleTeams = contributorTeams.filter((team) => !isHiddenDefaultContributorTeam(team));

  if (visibleTeams.length === 0) {
    if (
      projectTeamId &&
      projectTeamName &&
      !isHiddenDefaultContributorTeam({ slug: projectTeamSlug })
    ) {
      return [{ id: projectTeamId, name: projectTeamName, slug: projectTeamSlug }];
    }

    return [];
  }

  return visibleTeams;
}

export function groupCatGlossaryConceptsByTeam<T extends { id: string; glossaryId: string }>({
  concepts,
  teamGlossaryIds,
  glossaryTeamById,
  contributorTeamIds,
  ungroupedTeamIds = new Set<string>(),
}: {
  concepts: T[];
  teamGlossaryIds: Set<string>;
  glossaryTeamById: Map<string, string>;
  contributorTeamIds: Set<string>;
  ungroupedTeamIds?: Set<string>;
}) {
  const orgConceptIds = new Set<string>();
  const conceptsByTeamId = new Map<string, T[]>();

  for (const teamId of contributorTeamIds) {
    conceptsByTeamId.set(teamId, []);
  }

  for (const concept of concepts) {
    if (!teamGlossaryIds.has(concept.glossaryId)) {
      orgConceptIds.add(concept.id);
      continue;
    }

    const teamId = glossaryTeamById.get(concept.glossaryId);
    if (!teamId) {
      continue;
    }

    if (ungroupedTeamIds.has(teamId)) {
      orgConceptIds.add(concept.id);
      continue;
    }

    if (!conceptsByTeamId.has(teamId)) {
      continue;
    }

    conceptsByTeamId.get(teamId)?.push(concept);
  }

  return { orgConceptIds, conceptsByTeamId };
}

export function collectVisibleCatGlossaryConcepts<T extends { id: string }>(
  orgConcepts: T[],
  conceptsByTeamId: Map<string, T[]>,
): T[] {
  const teamConcepts = [...conceptsByTeamId.values()].flat();
  return [...orgConcepts, ...teamConcepts];
}

export function filterCatTeamGlossariesForTeam(
  teamGlossaries: ContentEditorTeamGlossaryOption[],
  teamId: string,
) {
  return teamGlossaries.filter((glossary) => glossary.teamId === teamId);
}
