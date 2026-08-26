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
import { expect, fn, userEvent } from "storybook/test";

import { catSegmentsFixture, catIntelligenceFixture } from "@/components/cat/shared/cat.fixture";
import type { CatSegmentIntelligence } from "@/components/cat/shared/types";

import { CatIntelligencePanel } from "./cat-intelligence-panel";
import { requestCatGlossaryGuidance } from "./cat-glossary-guidance-event";

const defaultTargetText = catSegmentsFixture[1]?.targetText ?? "";

const conceptIntelligence: CatSegmentIntelligence = {
  ...catIntelligenceFixture,
  glossaryConcepts: [
    {
      id: "concept-reseller",
      glossaryId: "glossary-project",
      glossaryName: "Partner Program",
      glossaryUrl: "https://example.com/project-glossary",
      primaryTerm: "Reseller",
      definition: "A company or individual authorized to resell our product.",
      sourceTerms: [
        {
          id: "reseller-en",
          locale: "en",
          text: "Reseller",
          status: "preferred",
          preferred: true,
          termType: "full form",
          partOfSpeech: "noun",
          gender: "neuter",
        },
      ],
      targetTerms: [
        {
          id: "reseller-vi-preferred",
          locale: "vi",
          text: "Đại lý",
          status: "preferred",
          preferred: true,
          termType: "full form",
          partOfSpeech: "noun",
          gender: "neuter",
        },
        {
          id: "reseller-vi-alternate",
          locale: "vi",
          text: "Nhà bán lại",
          status: "not_recommended",
          forbidden: true,
          termType: "full form",
          partOfSpeech: "noun",
          gender: "masculine",
        },
      ],
    },
    {
      id: "concept-review",
      glossaryId: "glossary-project",
      glossaryName: "Partner Program",
      primaryTerm: "Review",
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
  },
} satisfies Meta<typeof CatIntelligencePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Results: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Translation Intelligence" }),
    ).toBeInTheDocument();
    requestCatGlossaryGuidance();
    await expect(canvas.getByRole("region", { name: "Glossary guidance" })).toBeInTheDocument();
    await expect(canvas.getByText("Reseller")).toBeInTheDocument();
    await expect(canvas.getByText("Partner Program")).toBeInTheDocument();
    await expect(
      canvas.getByText("A company or individual authorized to resell our product."),
    ).toBeInTheDocument();
    await expect(canvas.getByText("Đại lý")).toBeInTheDocument();
    await expect(canvas.getByText("Nhà bán lại")).toBeInTheDocument();
    await expect(canvas.getAllByText("Project Glossary")).toHaveLength(2);
    await expect(canvas.getByText("Translation memory")).toBeInTheDocument();
    await expect(canvas.getByText("Dashboard card", { exact: true })).toBeInTheDocument();
    await expect(canvas.getAllByRole("button", { name: "Use" })).toHaveLength(3);
  },
};

export const Loading: Story = {
  args: {
    isConcordanceLoading: true,
  },
  play: async ({ canvas }) => {
    requestCatGlossaryGuidance();
    await expect(canvas.getByRole("region", { name: "Glossary guidance" })).toBeInTheDocument();
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
    requestCatGlossaryGuidance();
    await expect(canvas.getByRole("region", { name: "Glossary guidance" })).toBeInTheDocument();
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

export const LegacyFallback: Story = {
  args: {
    intelligence: {
      ...catIntelligenceFixture,
      glossaryConcepts: undefined,
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Dashboard", { exact: true })).toBeInTheDocument();
    await expect(canvas.getByText("Bảng điều khiển", { exact: true })).toBeInTheDocument();
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
