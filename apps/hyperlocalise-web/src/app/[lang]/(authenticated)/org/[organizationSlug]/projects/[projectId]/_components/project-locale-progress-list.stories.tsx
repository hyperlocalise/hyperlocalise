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
import { expect, userEvent } from "storybook/test";

import { projectOverviewLocaleProgressFixture } from "./project-overview.fixture";
import { ProjectLocaleProgressList } from "./project-locale-progress-list";

const meta = {
  title: "App/Project/Overview/LocaleProgress",
  component: ProjectLocaleProgressList,
  parameters: {
    layout: "padded",
  },
  args: {
    locales: projectOverviewLocaleProgressFixture,
    isLoading: false,
    isError: false,
    settingsHref: "/org/acme/projects/project_website/settings",
    stringsHref: "/org/acme/projects/project_website/strings",
  },
} satisfies Meta<typeof ProjectLocaleProgressList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Languages")).toBeInTheDocument();
    await expect(canvas.getByText("French (France)")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Show French (France) details" }));
    await expect(canvas.getByText("Translated")).toBeInTheDocument();
    await expect(canvas.getByText("Approved")).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Translate" })).toHaveAttribute(
      "href",
      "/org/acme/projects/project_website/strings?locale=fr-FR&queueFilter=untranslated",
    );
    await expect(canvas.getByRole("link", { name: "Proofread" })).toHaveAttribute(
      "href",
      "/org/acme/projects/project_website/strings?locale=fr-FR&queueFilter=needs_review",
    );
    await userEvent.click(canvas.getByRole("tab", { name: "Strings" }));
    await expect(canvas.getByText("40 translatable strings in total")).toBeInTheDocument();
    await expect(canvas.getByText("25%")).toBeInTheDocument();
  },
};

export const Empty: Story = {
  args: {
    locales: [],
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No target languages yet")).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "View settings" })).toBeInTheDocument();
  },
};

export const Loading: Story = {
  args: {
    locales: [],
    isLoading: true,
  },
};
