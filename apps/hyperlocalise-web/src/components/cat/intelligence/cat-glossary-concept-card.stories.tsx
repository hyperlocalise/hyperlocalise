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
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent } from "storybook/test";

import type { CatGlossaryConcept } from "@/components/cat/shared/types";

import { CatGlossaryConceptCard } from "./cat-glossary-concept-card";
import {
  matchedGlossaryConceptFixture,
  primaryTermFallbackGlossaryConceptFixture,
  sourceOnlyGlossaryConceptFixture,
  untranslatableGlossaryConceptFixture,
} from "./cat-glossary-concept-card.fixture";

function ConceptCardStoryHost({
  concept,
  teamName,
}: {
  concept: CatGlossaryConcept;
  teamName?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <CatGlossaryConceptCard
      concept={concept}
      teamName={teamName}
      expanded={expanded}
      onToggle={() => setExpanded((current) => !current)}
    />
  );
}

const meta = {
  title: "CAT/Glossary Concept Card",
  component: ConceptCardStoryHost,
  parameters: {
    layout: "centered",
  },
  decorators: [
    (Story) => (
      <div className="w-full max-w-md rounded-xl border border-border bg-background p-4 text-foreground">
        <Story />
      </div>
    ),
  ],
  args: {
    concept: matchedGlossaryConceptFixture,
    teamName: "Product",
  },
} satisfies Meta<typeof ConceptCardStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MatchedConcept: Story = {
  args: {
    concept: matchedGlossaryConceptFixture,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Reseller")).toBeInTheDocument();
    await expect(canvas.getByText("Partner Program")).toBeInTheDocument();
    await expect(canvas.getByText("Product")).toBeInTheDocument();
    await expect(canvas.getByText("Đại lý")).toBeInTheDocument();
    await expect(canvas.getByText("Preferred")).toBeInTheDocument();
    await expect(canvas.queryByText("Untranslatable")).not.toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: "Show glossary concept details" }));
    await expect(canvas.getByText("Nhà bán lại")).toBeInTheDocument();
    await expect(canvas.getByText("Not recommended")).toBeInTheDocument();
  },
};

export const UntranslatableConcept: Story = {
  args: {
    concept: untranslatableGlossaryConceptFixture,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Hyperlocalise")).toBeInTheDocument();
    await expect(canvas.getByText("Untranslatable")).toBeInTheDocument();
    await expect(canvas.queryByText("Hyperlocalise FR")).not.toBeInTheDocument();
    await expect(canvas.queryByText("Preferred")).not.toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: "Show glossary concept details" }));
    await expect(canvas.getByText("Brand name that must stay in English.")).toBeInTheDocument();
    await expect(canvas.queryByText("Hyperlocalise FR")).not.toBeInTheDocument();
  },
};

export const SourceOnlyConcept: Story = {
  args: {
    concept: sourceOnlyGlossaryConceptFixture,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Dashboard")).toBeInTheDocument();
    await expect(canvas.getByText("Draft")).toBeInTheDocument();
    await expect(canvas.queryByText("Untranslatable")).not.toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: "Show glossary concept details" }));
    await expect(canvas.getAllByText("Dashboard")).toHaveLength(2);
    await expect(canvas.queryByText("Untranslatable")).not.toBeInTheDocument();
  },
};

export const PrimaryTermFallback: Story = {
  args: {
    concept: primaryTermFallbackGlossaryConceptFixture,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("API")).toBeInTheDocument();
    await expect(canvas.getByText("Draft")).toBeInTheDocument();
  },
};
