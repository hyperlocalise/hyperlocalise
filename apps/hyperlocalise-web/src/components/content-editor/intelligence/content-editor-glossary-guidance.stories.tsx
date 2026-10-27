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
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import {
  contentEditorSegmentsFixture,
  contentEditorIntelligenceFixture,
} from "@/components/content-editor/shared/content-editor.fixture";
import type { ContentEditorSegmentIntelligence } from "@/components/content-editor/shared/types";
import { DEFAULT_WORKSPACE_TEAM_SLUG } from "@/lib/teams/default-workspace-team-constants";

import { ContentEditorGlossaryGuidance } from "./content-editor-glossary-guidance";
import { requestCatGlossaryGuidance } from "./content-editor-glossary-guidance-event";
import {
  matchedGlossaryConceptFixture,
  primaryTermFallbackGlossaryConceptFixture,
  sourceOnlyGlossaryConceptFixture,
  untranslatableGlossaryConceptFixture,
  amountSourceOnlyFixture,
  amountWithViTargetFixture,
} from "./content-editor-glossary-concept-card.fixture";

const teamProductId = "team-product";
const teamMarketingId = "team-marketing";
const teamLinguistsId = "team-linguists";
const teamDefaultId = "team-default";

const defaultTargetText = contentEditorSegmentsFixture[1]?.targetText ?? "";
const emptyGlossarySource =
  contentEditorSegmentsFixture[1]?.sourceText ??
  "Dashboard card showing how many reviews still need approval.";
const glossaryEmptyTitle = `No glossary matches for "${emptyGlossarySource}"`;
const glossaryEmptyDescription = `No project glossary concepts match "${emptyGlossarySource}".`;

const conceptIntelligence: ContentEditorSegmentIntelligence = {
  ...contentEditorIntelligenceFixture,
  glossaryConcepts: [
    matchedGlossaryConceptFixture,
    {
      id: "concept-review",
      glossaryId: "glossary-product",
      glossaryName: "Product UI",
      glossaryUrl: "/org/acme/glossaries/glossary-product",
      conceptUrl: "/org/acme/glossaries/glossary-product/concepts/concept-review",
      primaryTerm: "Review",
      translatable: true,
      sourceTerms: [{ id: "review-en", locale: "en", text: "Review", preferred: true }],
      targetTerms: [{ id: "review-vi", locale: "vi", text: "Đánh giá", preferred: true }],
    },
  ],
};

const meta = {
  title: "CAT/Glossary Guidance",
  component: ContentEditorGlossaryGuidance,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <div className="h-[48rem] bg-background text-foreground [--app-shell-plan-footer-height:2.5rem]">
        <Story />
      </div>
    ),
  ],
  args: {
    intelligence: conceptIntelligence,
    sourceText: emptyGlossarySource,
    targetText: defaultTargetText,
    isLoading: false,
    canEditTranslations: true,
    teamName: "Product",
  },
} satisfies Meta<typeof ContentEditorGlossaryGuidance>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Results: Story = {
  play: async ({ canvas }) => {
    await waitFor(() => {
      requestCatGlossaryGuidance();
      void expect(canvas.getByRole("region", { name: "Glossary guidance" })).toBeInTheDocument();
    });
    await expect(canvas.getAllByText("Reseller").length).toBeGreaterThan(0);
    await expect(canvas.getByText("Partner Program")).toBeInTheDocument();
    await expect(canvas.getByText("Product UI")).toBeInTheDocument();
    await expect(canvas.getAllByText("Product", { exact: true })).toHaveLength(2);
    await expect(
      canvas.getByText("A company or individual authorized to resell our product."),
    ).toBeInTheDocument();
    await expect(canvas.getByText("Đại lý")).toBeInTheDocument();
    await expect(canvas.getByText("Nhà bán lại")).toBeInTheDocument();
    const openGlossaryLinks = canvas.getAllByRole("link", { name: "Open glossary" });
    await expect(openGlossaryLinks).toHaveLength(2);
    await expect(openGlossaryLinks.map((link) => link.getAttribute("href"))).toEqual(
      expect.arrayContaining([
        "/org/acme/glossaries/glossary-partner",
        "/org/acme/glossaries/glossary-product",
      ]),
    );

    const openConceptLinks = canvas.getAllByRole("link", { name: "Open concept" });
    await expect(openConceptLinks).toHaveLength(2);
    await expect(openConceptLinks.map((link) => link.getAttribute("href"))).toEqual(
      expect.arrayContaining([
        "/org/acme/glossaries/glossary-partner/concepts/concept-reseller",
        "/org/acme/glossaries/glossary-product/concepts/concept-review",
      ]),
    );
    await expect(canvas.queryByRole("heading", { name: "Add concept" })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Add concept" })).not.toBeInTheDocument();
  },
};

export const Loading: Story = {
  args: {
    isLoading: true,
  },
  play: async ({ canvas }) => {
    await waitFor(() => {
      requestCatGlossaryGuidance();
      void expect(canvas.getByRole("region", { name: "Glossary guidance" })).toBeInTheDocument();
    });
    await expect(
      canvas.getByRole("status", { name: "Checking the glossary for matches" }),
    ).toBeInTheDocument();
    await expect(canvas.queryByText("Partner Program")).not.toBeInTheDocument();
  },
};

export const Empty: Story = {
  args: {
    intelligence: {
      ...contentEditorIntelligenceFixture,
      glossaryTerms: [],
      glossaryConcepts: [],
      translationMemoryMatches: [],
    },
  },
  play: async ({ canvas }) => {
    await waitFor(() => {
      requestCatGlossaryGuidance();
      void expect(canvas.getByRole("region", { name: "Glossary guidance" })).toBeInTheDocument();
    });
    await expect(canvas.getByText(glossaryEmptyTitle)).toBeInTheDocument();
    await expect(canvas.getByText(glossaryEmptyDescription)).toBeInTheDocument();
  },
};

const untranslatableConceptIntelligence: ContentEditorSegmentIntelligence = {
  ...contentEditorIntelligenceFixture,
  glossaryConcepts: [untranslatableGlossaryConceptFixture],
};

export const UntranslatableConcept: Story = {
  args: {
    intelligence: untranslatableConceptIntelligence,
  },
  play: async ({ canvas }) => {
    await waitFor(() => {
      requestCatGlossaryGuidance();
      void expect(canvas.getByRole("region", { name: "Glossary guidance" })).toBeInTheDocument();
    });
    await expect(canvas.getByText("Untranslatable")).toBeInTheDocument();
    await expect(canvas.getByText("Hyperlocalise FR")).not.toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: "Show glossary concept details" }));
    await expect(canvas.getByText("Brand name that must stay in English.")).toBeInTheDocument();
    await expect(canvas.getByText("Hyperlocalise FR")).not.toBeInTheDocument();
  },
};

const sourceOnlyConceptIntelligence: ContentEditorSegmentIntelligence = {
  ...contentEditorIntelligenceFixture,
  glossaryConcepts: [sourceOnlyGlossaryConceptFixture],
};

export const SourceOnlyConcept: Story = {
  args: {
    intelligence: sourceOnlyConceptIntelligence,
    targetLocale: "vi-VN",
    sourceLocale: "en-US",
  },
  play: async ({ canvas }) => {
    await waitFor(() => {
      requestCatGlossaryGuidance();
      void expect(canvas.getByRole("region", { name: "Glossary guidance" })).toBeInTheDocument();
    });
    await expect(canvas.getByText(glossaryEmptyTitle)).toBeInTheDocument();
    await expect(canvas.queryByText("Dashboard", { exact: true })).not.toBeInTheDocument();
  },
};

export const PrimaryTermFallback: Story = {
  args: {
    intelligence: {
      ...contentEditorIntelligenceFixture,
      glossaryConcepts: [primaryTermFallbackGlossaryConceptFixture],
    },
    targetLocale: "vi-VN",
    sourceLocale: "en-US",
  },
  play: async ({ canvas }) => {
    await waitFor(() => {
      requestCatGlossaryGuidance();
      void expect(canvas.getByRole("region", { name: "Glossary guidance" })).toBeInTheDocument();
    });
    await expect(canvas.getByText(glossaryEmptyTitle)).toBeInTheDocument();
    await expect(canvas.queryByText("API", { exact: true })).not.toBeInTheDocument();
  },
};

export const ConceptOnlyEmpty: Story = {
  args: {
    intelligence: {
      ...contentEditorIntelligenceFixture,
      glossaryConcepts: undefined,
    },
  },
  play: async ({ canvas }) => {
    await waitFor(() => {
      requestCatGlossaryGuidance();
      void expect(canvas.getByRole("region", { name: "Glossary guidance" })).toBeInTheDocument();
    });
    await expect(canvas.getByText(glossaryEmptyTitle)).toBeInTheDocument();
    await expect(canvas.queryByText("Dashboard", { exact: true })).not.toBeInTheDocument();
    await expect(canvas.queryByText("Bảng điều khiển", { exact: true })).not.toBeInTheDocument();
  },
};

export const AddToTeamGlossary: Story = {
  args: {
    sourceText: "Dashboard",
    targetText: "Bảng điều khiển",
    sourceLocale: "en",
    targetLocale: "vi",
    organizationSlug: "acme",
    projectId: "project_1",
    canContributeTeamGlossary: true,
    teamName: "Product",
    projectTeamId: teamProductId,
    contributorTeams: [
      { id: teamProductId, name: "Product" },
      { id: teamMarketingId, name: "Marketing" },
    ],
    teamGlossaries: [
      { id: "glossary-team-1", name: "Product team terms", teamId: teamProductId },
      { id: "glossary-team-2", name: "Marketing team terms", teamId: teamMarketingId },
    ],
  },
  play: async ({ canvas, canvasElement }) => {
    await waitFor(() => {
      requestCatGlossaryGuidance();
      void expect(canvas.getByRole("region", { name: "Glossary guidance" })).toBeInTheDocument();
    });
    await expect(canvas.getByRole("heading", { name: "Product", level: 3 })).toBeInTheDocument();
    await expect(canvas.getByRole("heading", { name: "Marketing", level: 3 })).toBeInTheDocument();
    await expect(canvas.getAllByRole("button", { name: "Add concept" })).toHaveLength(2);
    await expect(canvas.queryByRole("textbox", { name: "Primary term" })).not.toBeInTheDocument();
    await userEvent.click(canvas.getAllByRole("button", { name: "Add concept" })[0]!);
    await expect(canvas.getByRole("heading", { name: "Add concept" })).toBeInTheDocument();
    await expect(canvas.getByRole("textbox", { name: "Primary term" })).toHaveValue("Dashboard");
    await expect(canvas.getByText("Shared with Product.")).toBeInTheDocument();
    await expect(canvas.getByRole("combobox", { name: "Team glossary" })).toHaveTextContent(
      "Product team terms",
    );
    await expect(canvas.getByRole("button", { name: "Add concept" })).toBeEnabled();
    await expect(canvas.getAllByRole("combobox", { name: "Status" })[0]).toHaveTextContent(
      "Preferred",
    );
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("combobox", { name: "Team glossary" }));
    await expect(await body.findByRole("option", { name: "Create new" })).toBeInTheDocument();
    await expect(
      body.queryByRole("option", { name: "Marketing team terms" }),
    ).not.toBeInTheDocument();
  },
};

export const AddToSingleTeamGlossary: Story = {
  args: {
    sourceText: "Dashboard",
    targetText: "Bảng điều khiển",
    sourceLocale: "en",
    targetLocale: "vi",
    organizationSlug: "acme",
    projectId: "project_1",
    canContributeTeamGlossary: true,
    teamName: "Product",
    projectTeamId: teamProductId,
    contributorTeams: [{ id: teamProductId, name: "Product" }],
    teamGlossaries: [{ id: "glossary-team-1", name: "Product team terms", teamId: teamProductId }],
  },
  play: async ({ canvas }) => {
    await waitFor(() => {
      requestCatGlossaryGuidance();
      void expect(canvas.getByRole("region", { name: "Glossary guidance" })).toBeInTheDocument();
    });
    await expect(canvas.getByRole("heading", { name: "Product", level: 3 })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Add concept" }));
    await expect(canvas.getByRole("heading", { name: "Add concept" })).toBeInTheDocument();
    await expect(canvas.getByText("Shared with Product.")).toBeInTheDocument();
    await expect(canvas.getByRole("combobox", { name: "Team glossary" })).toHaveTextContent(
      "Product team terms",
    );
    await expect(canvas.getByRole("button", { name: "Add concept" })).toBeEnabled();
  },
};

export const TeamSectionsWithOrgAndTeamMatches: Story = {
  args: {
    intelligence: conceptIntelligence,
    canContributeTeamGlossary: true,
    projectTeamId: teamProductId,
    contributorTeams: [
      { id: teamProductId, name: "Product" },
      { id: teamMarketingId, name: "Marketing" },
    ],
    teamGlossaries: [
      { id: "glossary-product", name: "Product UI", teamId: teamProductId },
      { id: "glossary-team-2", name: "Marketing team terms", teamId: teamMarketingId },
    ],
  },
  play: async ({ canvas }) => {
    await waitFor(() => {
      requestCatGlossaryGuidance();
      void expect(canvas.getByRole("region", { name: "Glossary guidance" })).toBeInTheDocument();
    });
    await expect(canvas.getByText("Partner Program")).toBeInTheDocument();
    await expect(canvas.getByText("Reseller")).toBeInTheDocument();
    await expect(canvas.getByRole("heading", { name: "Product", level: 3 })).toBeInTheDocument();
    await expect(canvas.getByRole("heading", { name: "Marketing", level: 3 })).toBeInTheDocument();
    await expect(canvas.getByText("Review")).toBeInTheDocument();
    await expect(canvas.getAllByRole("button", { name: "Add concept" })).toHaveLength(2);
    await expect(
      canvas.queryByText("Attach a team glossary to this project."),
    ).not.toBeInTheDocument();
  },
};

export const AddToTeamGlossaryEmpty: Story = {
  args: {
    sourceText: "Dashboard",
    targetText: "Bảng điều khiển",
    sourceLocale: "en",
    targetLocale: "vi",
    organizationSlug: "acme",
    projectId: "project_1",
    canContributeTeamGlossary: true,
    teamName: "Product",
    projectTeamId: teamProductId,
    contributorTeams: [{ id: teamProductId, name: "Product" }],
    teamGlossaries: [],
    intelligence: {
      ...contentEditorIntelligenceFixture,
      glossaryConcepts: [],
      translationMemoryMatches: [],
    },
  },
  play: async ({ canvas }) => {
    await waitFor(() => {
      requestCatGlossaryGuidance();
      void expect(canvas.getByRole("region", { name: "Glossary guidance" })).toBeInTheDocument();
    });
    await expect(canvas.getByText("No matching terms for Product.")).toBeInTheDocument();
    await expect(canvas.getByText("Attach a team glossary to this project.")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Add concept" }));
    await expect(canvas.getByRole("combobox", { name: "Team glossary" })).toHaveTextContent(
      "Select team glossary",
    );
    await expect(canvas.getByRole("button", { name: "Add concept" })).toBeDisabled();
    await expect(canvas.getAllByRole("combobox", { name: "Status" })[0]).toHaveTextContent(
      "Preferred",
    );
  },
};

export const NamedTeamWithoutDefaultSection: Story = {
  args: {
    sourceText: "Amount",
    targetText: "Số tiền",
    sourceLocale: "en-US",
    targetLocale: "vi-VN",
    organizationSlug: "acme",
    projectId: "project_1",
    projectTeamId: teamDefaultId,
    projectTeamSlug: DEFAULT_WORKSPACE_TEAM_SLUG,
    contributorTeams: [{ id: teamLinguistsId, name: "Linguists" }],
    teamGlossaries: [
      { id: "glossary-linguists", name: "Internal Linguists", teamId: teamLinguistsId },
    ],
    intelligence: {
      ...contentEditorIntelligenceFixture,
      glossaryConcepts: [],
      translationMemoryMatches: [],
    },
  },
  play: async ({ canvas }) => {
    await waitFor(() => {
      requestCatGlossaryGuidance();
      void expect(canvas.getByRole("region", { name: "Glossary guidance" })).toBeInTheDocument();
    });
    await expect(canvas.getByRole("heading", { name: "Linguists", level: 3 })).toBeInTheDocument();
    await expect(
      canvas.queryByText("Attach a team glossary to this project."),
    ).not.toBeInTheDocument();
    await expect(canvas.queryByText("No matching terms.", { exact: true })).not.toBeInTheDocument();
  },
};

export const FiltersSourceOnlyDuplicateConcepts: Story = {
  args: {
    sourceText: "Amount",
    targetText: "Số tiền",
    sourceLocale: "en-US",
    targetLocale: "vi-VN",
    organizationSlug: "acme",
    projectId: "project_1",
    contributorTeams: [{ id: teamLinguistsId, name: "Linguists" }],
    teamGlossaries: [
      { id: "glossary-linguists", name: "Internal Linguists", teamId: teamLinguistsId },
    ],
    intelligence: {
      ...contentEditorIntelligenceFixture,
      glossaryConcepts: [amountWithViTargetFixture, amountSourceOnlyFixture],
      translationMemoryMatches: [],
    },
  },
  play: async ({ canvas }) => {
    await waitFor(() => {
      requestCatGlossaryGuidance();
      void expect(canvas.getByRole("region", { name: "Glossary guidance" })).toBeInTheDocument();
    });
    await expect(canvas.getByText("Số tiền")).toBeInTheDocument();
    await expect(canvas.getAllByText("Amount", { exact: true })).toHaveLength(1);
  },
};

export const LockedStringAddConcept: Story = {
  args: {
    sourceText: "Dashboard",
    targetText: "Bảng điều khiển",
    sourceLocale: "en",
    targetLocale: "vi",
    organizationSlug: "acme",
    projectId: "project_1",
    canContributeTeamGlossary: true,
    isTranslationLocked: true,
    teamName: "Product",
    projectTeamId: teamProductId,
    contributorTeams: [{ id: teamProductId, name: "Product" }],
    teamGlossaries: [{ id: "glossary-team-1", name: "Product team terms", teamId: teamProductId }],
  },
  play: async ({ canvas, canvasElement }) => {
    await waitFor(() => {
      requestCatGlossaryGuidance();
      void expect(canvas.getByRole("region", { name: "Glossary guidance" })).toBeInTheDocument();
    });
    const addButton = canvas.getByRole("button", { name: "Add concept" });
    await expect(addButton).toBeDisabled();
    await userEvent.hover(addButton.parentElement ?? addButton);
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await body.findByText("This string is locked. Unlock it to add a concept."),
    ).toBeInTheDocument();
  },
};
