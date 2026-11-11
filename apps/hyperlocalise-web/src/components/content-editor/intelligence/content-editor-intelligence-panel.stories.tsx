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

import {
  contentEditorSegmentsFixture,
  contentEditorIntelligenceFixture,
} from "@/components/content-editor/shared/content-editor.fixture";

import { ContentEditorIntelligencePanel } from "./content-editor-intelligence-panel";

const defaultTargetText = contentEditorSegmentsFixture[1]?.targetText ?? "";

const meta = {
  title: "CAT/Translation Intelligence",
  component: ContentEditorIntelligencePanel,
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
    intelligence: contentEditorIntelligenceFixture,
    targetText: defaultTargetText,
    isLookingUpContext: false,
    isConcordanceLoading: false,
    isVisualContextLoading: false,
    showAgentContext: false,
    showVisualContext: false,
    canEditTranslations: true,
    canLookupFreshContext: true,
    showMaxLengthEditor: true,
    onSetMaxLength: fn(),
  },
} satisfies Meta<typeof ContentEditorIntelligencePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const UnicodeTable: Story = {
  args: {
    intelligence: {
      ...contentEditorIntelligenceFixture,
      glossaryConcepts: undefined,
      translationMemoryMatches: [],
    },
    onInsertCharacter: fn(),
  },
  play: async ({ canvas, args }) => {
    await expect(canvas.getByRole("heading", { name: "Unicode table" })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Show unicode characters" }));
    await expect(canvas.getByLabelText("Search unicode symbols")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Insert EURO SIGN (U+20AC)" }));
    await expect(args.onInsertCharacter).toHaveBeenCalledWith("€");
  },
};

export const Results: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Translation Intelligence" }),
    ).toBeInTheDocument();
    await expect(canvas.getByText("Dashboard card", { exact: true })).toBeInTheDocument();
    await expect(
      canvas.queryByRole("region", { name: "Glossary guidance" }),
    ).not.toBeInTheDocument();
  },
};

export const Loading: Story = {
  args: {
    isConcordanceLoading: true,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Translation memory")).toBeInTheDocument();
    await expect(canvas.queryByText("Dashboard card", { exact: true })).not.toBeInTheDocument();
  },
};

export const ReadOnly: Story = {
  args: {
    canEditTranslations: false,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Dashboard card", { exact: true })).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Use" })).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("button", { name: "Set character limit" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("spinbutton", { name: "Character limit" }),
    ).not.toBeInTheDocument();
    await expect(canvas.getByText("No limit")).toBeInTheDocument();
  },
};

export const CharacterLimit: Story = {
  args: {
    intelligence: {
      ...contentEditorIntelligenceFixture,
      maxLength: 32,
    },
    targetText: "Short label",
    onSetMaxLength: fn(),
  },
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Set character limit" }));
    const input = canvas.getByRole("spinbutton", { name: "Character limit" });
    await expect(input).toHaveValue(32);
    await expect(canvas.getByText("11 used")).toBeInTheDocument();

    await userEvent.clear(input);
    await userEvent.type(input, "24");
    await userEvent.tab();
    await expect(args.onSetMaxLength).toHaveBeenCalledWith(24);
  },
};

export const LowMatchConfirmation: Story = {
  args: {
    intelligence: {
      ...contentEditorIntelligenceFixture,
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

export const LockedString: Story = {
  args: {
    isTranslationLocked: true,
    onUseTmMatch: fn(),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Dashboard card", { exact: true })).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Use" })).not.toBeInTheDocument();
  },
};
