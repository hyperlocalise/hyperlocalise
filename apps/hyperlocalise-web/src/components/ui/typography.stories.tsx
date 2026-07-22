/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import {
  TypographyBlockquote,
  TypographyH1,
  TypographyH2,
  TypographyH3,
  TypographyH4,
  TypographyInlineCode,
  TypographyLarge,
  TypographyLead,
  TypographyMuted,
  TypographyP,
  TypographySmall,
} from "./typography";

const meta = {
  title: "UI/Typography",
  component: TypographyP,
} satisfies Meta<typeof TypographyP>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <div className="flex max-w-3xl flex-col gap-4 p-6">
      <TypographyH1>Localization dashboard</TypographyH1>
      <TypographyH2>Review queue</TypographyH2>
      <TypographyH3>Provider sync</TypographyH3>
      <TypographyH4>Glossary updates</TypographyH4>
      <TypographyLead>Ship consistent translations with fewer manual handoffs.</TypographyLead>
      <TypographyP>
        Use <TypographyInlineCode>provider.sync()</TypographyInlineCode> to refresh source strings.
      </TypographyP>
      <TypographyBlockquote>Preserve product names and ICU placeholders.</TypographyBlockquote>
      <TypographyLarge>Large emphasis text</TypographyLarge>
      <TypographySmall>Small supporting text</TypographySmall>
      <TypographyMuted>Muted metadata and timestamps</TypographyMuted>
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Localization dashboard")).toBeInTheDocument();
  },
};
