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
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import { catSegmentsFixture, catIntelligenceFixture } from "@/components/cat/shared/cat.fixture";
import type { CatSegmentIntelligence } from "@/components/cat/shared/types";

import { CatIntelligencePanel } from "./cat-intelligence-panel";
import { requestCatGlossaryGuidance } from "./cat-glossary-guidance-event";
import {
  matchedGlossaryConceptFixture,
  primaryTermFallbackGlossaryConceptFixture,
  sourceOnlyGlossaryConceptFixture,
  untranslatableGlossaryConceptFixture,
} from "./cat-glossary-concept-card.fixture";

const teamProductId = "team-product";
const teamMarketingId = "team-marketing";

const defaultTargetText = catSegmentsFixture[1]?.targetText ?? "";

const conceptIntelligence: CatSegmentIntelligence = {
  ...catIntelligenceFixture,
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
  title: "CAT/Translation Intelligence",
  component: CatIntelligencePanel,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <div className="mx-auto h-[42rem] max-w-xl border-x border-border bg-background text-foreground">
        <Story />
      </div>
    ),
  ],
  args: {
    intelligence: conceptIntelligence,
    targetText: defaultTargetText,
    isLookingUpContext: false,
    isConcordanceLoading: false,
    isVisualContextLoading: false,
    showAgentContext: false,
    showVisualContext: false,
    canEditTranslations: true,
    canLookupFreshContext: true,
    teamName: "Product",
  },
} satisfies Meta<typeof CatIntelligencePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Results: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Translation Intelligence" }),
    ).toBeInTheDocument();
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
    await expect(canvas.getByText("Dashboard card", { exact: true })).toBeInTheDocument();
    await expect(canvas.queryByRole("heading", { name: "Add concept" })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Add concept" })).not.toBeInTheDocument();
  },
};

export const Loading: Story = {
  args: {
    isConcordanceLoading: true,
  },
  play: async ({ canvas }) => {
    await waitFor(() => {
      requestCatGlossaryGuidance();
      void expect(canvas.getByRole("region", { name: "Glossary guidance" })).toBeInTheDocument();
    });
    await expect(canvas.getByText("Translation memory")).toBeInTheDocument();
    await expect(canvas.queryByText("Dashboard card", { exact: true })).not.toBeInTheDocument();
  },
};

export const Empty: Story = {
  args: {
    intelligence: {
      ...catIntelligenceFixture,
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
    await expect(canvas.getByText("No glossary matches")).toBeInTheDocument();
    await expect(
      canvas.getByText("No project glossary concepts match this string."),
    ).toBeInTheDocument();
  },
};

export const ReadOnly: Story = {
  args: {
    canEditTranslations: false,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Dashboard card", { exact: true })).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Use" })).not.toBeInTheDocument();
  },
};

const untranslatableConceptIntelligence: CatSegmentIntelligence = {
  ...catIntelligenceFixture,
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

const sourceOnlyConceptIntelligence: CatSegmentIntelligence = {
  ...catIntelligenceFixture,
  glossaryConcepts: [sourceOnlyGlossaryConceptFixture],
};

export const SourceOnlyConcept: Story = {
  args: {
    intelligence: sourceOnlyConceptIntelligence,
  },
  play: async ({ canvas }) => {
    await waitFor(() => {
      requestCatGlossaryGuidance();
      void expect(canvas.getByRole("region", { name: "Glossary guidance" })).toBeInTheDocument();
    });
    await expect(canvas.getByText("Dashboard")).toBeInTheDocument();
    await expect(canvas.getByText("Draft")).toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: "Show glossary concept details" }));
    await expect(canvas.getAllByText("Dashboard")).toHaveLength(2);
  },
};

export const PrimaryTermFallback: Story = {
  args: {
    intelligence: {
      ...catIntelligenceFixture,
      glossaryConcepts: [primaryTermFallbackGlossaryConceptFixture],
    },
  },
  play: async ({ canvas }) => {
    await waitFor(() => {
      requestCatGlossaryGuidance();
      void expect(canvas.getByRole("region", { name: "Glossary guidance" })).toBeInTheDocument();
    });
    await expect(canvas.getByText("API")).toBeInTheDocument();
    await expect(canvas.getByText("Draft")).toBeInTheDocument();
  },
};

export const ConceptOnlyEmpty: Story = {
  args: {
    intelligence: {
      ...catIntelligenceFixture,
      glossaryConcepts: undefined,
    },
  },
  play: async ({ canvas }) => {
    await waitFor(() => {
      requestCatGlossaryGuidance();
      void expect(canvas.getByRole("region", { name: "Glossary guidance" })).toBeInTheDocument();
    });
    await expect(canvas.getByText("No glossary matches")).toBeInTheDocument();
    await expect(canvas.queryByText("Dashboard", { exact: true })).not.toBeInTheDocument();
    await expect(canvas.queryByText("Bảng điều khiển", { exact: true })).not.toBeInTheDocument();
  },
};

export const LowMatchConfirmation: Story = {
  args: {
    intelligence: {
      ...catIntelligenceFixture,
      translationMemoryMatches: [
        {
          id: "tm-low-match",
          sourceText: "Review the pending dashboard changes.",
          targetText: "Xem các thay đổi đang chờ duyệt trên bảng điều khiển.",
          matchPercent: 62,
          contextLabel: "Review queue",
        },
      ],
    },
    onUseTmMatch: fn(),
  },
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Use" }));
    await expect(canvas.getByRole("dialog")).toBeInTheDocument();
    await expect(canvas.getByText("Apply low-quality TM match?")).toBeInTheDocument();
    await expect(canvas.getByText(/only 62% similar/)).toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: "Apply anyway" }));
    await expect(args.onUseTmMatch).toHaveBeenCalledWith(
      expect.objectContaining({ id: "tm-low-match", matchPercent: 62 }),
    );
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
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("combobox", { name: "Team glossary" }));
    await expect(
      await body.findByRole("option", { name: "Marketing team terms" }),
    ).not.toBeInTheDocument();
    await expect(body.getByRole("option", { name: "Create new" })).toBeInTheDocument();
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
      ...catIntelligenceFixture,
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
    await userEvent.click(canvas.getByRole("button", { name: "Add concept" }));
    await expect(canvas.getByRole("textbox", { name: "Glossary name" })).toHaveValue(
      "Shared with Product.",
    );
    await expect(canvas.getByRole("button", { name: "Create" })).toBeEnabled();
  },
};
