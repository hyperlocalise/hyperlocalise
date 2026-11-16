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
import { expect, fn } from "storybook/test";

import { DictionariesEmptyState } from "../dictionaries/_components/dictionaries-empty-state";
import { GlossariesEmptyState } from "../glossaries/_components/glossaries-empty-state";
import { GlossariesEmptyAction } from "../glossaries/_components/glossaries-table";
import { GuidelinesEmptyState } from "../knowledge/_components/guidelines-empty-state";
import { WorkspacePageShell } from "./workspace-resource-shared";

const meta = {
  title: "App/Workspace/Empty states",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Glossaries: Story = {
  render: () => (
    <WorkspacePageShell>
      <GlossariesEmptyState
        onCreate={fn()}
        secondaryAction={<GlossariesEmptyAction organizationSlug="acme" />}
      />
    </WorkspacePageShell>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Create glossary" })).toBeInTheDocument();
  },
};

export const Dictionaries: Story = {
  render: () => (
    <WorkspacePageShell>
      <DictionariesEmptyState onCreate={fn()} />
    </WorkspacePageShell>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Create dictionary" })).toBeInTheDocument();
  },
};

export const Guidelines: Story = {
  render: () => (
    <div className="mx-auto w-full max-w-4xl p-6">
      <GuidelinesEmptyState uploadHref="/org/acme/knowledge/upload" />
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Upload guideline" })).toHaveAttribute(
      "href",
      "/org/acme/knowledge/upload",
    );
  },
};
