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
import { expect, fn, userEvent, within } from "storybook/test";

import { CreateTranslationJobDialog } from "./create-translation-job-dialog";
import { createProjectFileRecord } from "./project-files.fixture";

const manyTargetLocales = [
  "da-DK",
  "de-DE",
  "fil-PH",
  "fr-FR",
  "ja-JP",
  "ko-KR",
  "nl-NL",
  "th-TH",
  "vi-VN",
  "zh-CN",
];

const meta = {
  title: "App/Project/Files/Translate With Agent Dialog",
  component: CreateTranslationJobDialog,
  parameters: {
    layout: "centered",
  },
  args: {
    open: true,
    onOpenChange: fn(),
    organizationSlug: "acme",
    projectId: "project_website",
    file: createProjectFileRecord({
      sourcePath: "_posts/en/hyperlocalise-featured-in-startmate-launchpad-club.md",
    }),
    sourceLocale: "en-US",
    targetLocales: manyTargetLocales,
    onCreated: fn(),
  },
} satisfies Meta<typeof CreateTranslationJobDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ManyLocales: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = body.getByRole("dialog", { name: "Translate with agent" });

    await expect(dialog).toBeInTheDocument();
    await expect(body.getByText("en-US")).toBeInTheDocument();
    await expect(body.getByLabelText("Target locales")).toBeInTheDocument();
    await expect(body.queryByRole("checkbox", { name: "da-DK" })).not.toBeInTheDocument();
    await expect(
      body.getByRole("checkbox", { name: /Force translate untranslated strings/i }),
    ).toBeChecked();

    await userEvent.click(body.getByRole("button", { name: "Clear" }));
    await expect(body.getByRole("button", { name: "Translate with agent" })).toBeDisabled();

    const localeSearch = body.getByPlaceholderText("Search locales…");
    await userEvent.click(localeSearch);
    await userEvent.type(localeSearch, "japan");
    await userEvent.click(await body.findByRole("option", { name: /Japanese \(Japan\)/i }));
    await expect(body.getByText("ja-JP")).toBeInTheDocument();
    await expect(body.getByRole("button", { name: "Select all" })).toBeInTheDocument();
  },
};
