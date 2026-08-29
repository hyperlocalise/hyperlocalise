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
import { describe, expect, it } from "vite-plus/test";

import {
  DEFAULT_WORKSPACE_TEAM_NAME,
  DEFAULT_WORKSPACE_TEAM_SLUG,
} from "@/lib/teams/default-workspace-team-constants";

import {
  collectVisibleCatGlossaryConcepts,
  filterCatTeamGlossariesForTeam,
  groupCatGlossaryConceptsByTeam,
  resolveCatContributorTeams,
} from "./content-editor-team-glossary";

describe("resolveCatContributorTeams", () => {
  it("returns membership teams when present", () => {
    expect(
      resolveCatContributorTeams({
        contributorTeams: [{ id: "team-a", name: "Alpha", slug: "alpha" }],
        projectTeamId: "team-b",
        projectTeamName: "Beta",
      }),
    ).toEqual([{ id: "team-a", name: "Alpha", slug: "alpha" }]);
  });

  it("falls back to the project team when memberships are empty", () => {
    expect(
      resolveCatContributorTeams({
        contributorTeams: [],
        projectTeamId: "team-b",
        projectTeamName: "Beta",
        projectTeamSlug: "beta",
      }),
    ).toEqual([{ id: "team-b", name: "Beta", slug: "beta" }]);
  });

  it("omits the default workspace team from contributor sections", () => {
    expect(
      resolveCatContributorTeams({
        contributorTeams: [
          {
            id: "team-default",
            name: DEFAULT_WORKSPACE_TEAM_NAME,
            slug: DEFAULT_WORKSPACE_TEAM_SLUG,
          },
          { id: "team-a", name: "Alpha", slug: "alpha" },
        ],
        projectTeamId: "team-default",
        projectTeamName: DEFAULT_WORKSPACE_TEAM_NAME,
        projectTeamSlug: DEFAULT_WORKSPACE_TEAM_SLUG,
      }),
    ).toEqual([{ id: "team-a", name: "Alpha", slug: "alpha" }]);
  });

  it("does not append a default project team when the viewer belongs to other teams", () => {
    expect(
      resolveCatContributorTeams({
        contributorTeams: [{ id: "team-a", name: "Alpha", slug: "alpha" }],
        projectTeamId: "team-default",
        projectTeamName: DEFAULT_WORKSPACE_TEAM_NAME,
        projectTeamSlug: DEFAULT_WORKSPACE_TEAM_SLUG,
      }),
    ).toEqual([{ id: "team-a", name: "Alpha", slug: "alpha" }]);
  });

  it("does not hide a team that only shares the default team name", () => {
    expect(
      resolveCatContributorTeams({
        contributorTeams: [
          { id: "team-marketing", name: DEFAULT_WORKSPACE_TEAM_NAME, slug: "marketing" },
        ],
        projectTeamId: "team-product",
        projectTeamName: "Product",
        projectTeamSlug: "product",
      }),
    ).toEqual([{ id: "team-marketing", name: DEFAULT_WORKSPACE_TEAM_NAME, slug: "marketing" }]);
  });

  it("returns no contributor sections when only the default team remains", () => {
    expect(
      resolveCatContributorTeams({
        contributorTeams: [],
        projectTeamId: "team-default",
        projectTeamName: DEFAULT_WORKSPACE_TEAM_NAME,
        projectTeamSlug: DEFAULT_WORKSPACE_TEAM_SLUG,
      }),
    ).toEqual([]);
  });
});

describe("groupCatGlossaryConceptsByTeam", () => {
  const concepts = [
    { id: "org-concept", glossaryId: "glossary-org" },
    { id: "team-concept", glossaryId: "glossary-team" },
    { id: "other-team-concept", glossaryId: "glossary-other" },
  ];

  it("keeps org concepts separate and groups team concepts by team", () => {
    const { orgConceptIds, conceptsByTeamId } = groupCatGlossaryConceptsByTeam({
      concepts,
      teamGlossaryIds: new Set(["glossary-team", "glossary-other"]),
      glossaryTeamById: new Map([
        ["glossary-team", "team-a"],
        ["glossary-other", "team-b"],
      ]),
      contributorTeamIds: new Set(["team-a", "team-b"]),
    });

    expect(orgConceptIds).toEqual(new Set(["org-concept"]));
    expect(conceptsByTeamId.get("team-a")).toEqual([concepts[1]]);
    expect(conceptsByTeamId.get("team-b")).toEqual([concepts[2]]);
  });

  it("omits team glossary concepts when the viewer is not a member of the owning team", () => {
    const { orgConceptIds, conceptsByTeamId } = groupCatGlossaryConceptsByTeam({
      concepts,
      teamGlossaryIds: new Set(["glossary-team", "glossary-other"]),
      glossaryTeamById: new Map([
        ["glossary-team", "team-a"],
        ["glossary-other", "team-b"],
      ]),
      contributorTeamIds: new Set(["team-a"]),
    });

    expect(orgConceptIds).toEqual(new Set(["org-concept"]));
    expect(conceptsByTeamId.get("team-a")).toEqual([concepts[1]]);
    expect(conceptsByTeamId.has("team-b")).toBe(false);
  });

  it("surfaces default-team glossary concepts as org concepts when ungrouped", () => {
    const { orgConceptIds, conceptsByTeamId } = groupCatGlossaryConceptsByTeam({
      concepts: [
        { id: "default-team-concept", glossaryId: "glossary-default" },
        { id: "alpha-team-concept", glossaryId: "glossary-alpha" },
      ],
      teamGlossaryIds: new Set(["glossary-default", "glossary-alpha"]),
      glossaryTeamById: new Map([
        ["glossary-default", "team-default"],
        ["glossary-alpha", "team-a"],
      ]),
      contributorTeamIds: new Set(["team-a"]),
      ungroupedTeamIds: new Set(["team-default"]),
    });

    expect(orgConceptIds).toEqual(new Set(["default-team-concept"]));
    expect(conceptsByTeamId.get("team-a")).toEqual([
      { id: "alpha-team-concept", glossaryId: "glossary-alpha" },
    ]);
    expect(conceptsByTeamId.has("team-default")).toBe(false);
  });
});

describe("collectVisibleCatGlossaryConcepts", () => {
  const concepts = [
    { id: "org-concept", glossaryId: "glossary-org" },
    { id: "team-concept", glossaryId: "glossary-team" },
    { id: "other-team-concept", glossaryId: "glossary-other" },
  ];

  it("counts only org concepts and team concepts retained for the viewer", () => {
    const { orgConceptIds, conceptsByTeamId } = groupCatGlossaryConceptsByTeam({
      concepts,
      teamGlossaryIds: new Set(["glossary-team", "glossary-other"]),
      glossaryTeamById: new Map([
        ["glossary-team", "team-a"],
        ["glossary-other", "team-b"],
      ]),
      contributorTeamIds: new Set(["team-a"]),
    });

    const orgConcepts = concepts.filter((concept) => orgConceptIds.has(concept.id));
    const visibleConcepts = collectVisibleCatGlossaryConcepts(orgConcepts, conceptsByTeamId);

    expect(visibleConcepts.map((concept) => concept.id)).toEqual(["org-concept", "team-concept"]);
  });
});

describe("filterCatTeamGlossariesForTeam", () => {
  it("returns glossaries owned by the requested team", () => {
    const glossaries = [
      { id: "g1", name: "Product", teamId: "team-a" },
      { id: "g2", name: "Marketing", teamId: "team-b" },
    ];

    expect(filterCatTeamGlossariesForTeam(glossaries, "team-a")).toEqual([glossaries[0]]);
  });
});
