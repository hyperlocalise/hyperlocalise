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
import { expect } from "storybook/test";

import { Box } from "./layout/box";
import { Rows } from "./layout/rows";
import {
  Text,
  Title,
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
  typographyTones,
} from "./typography";

const meta = {
  title: "UI/Typography",
  component: Text,
} satisfies Meta<typeof Text>;

export default meta;
type Story = StoryObj<typeof meta>;

const textSizes = ["xxlarge", "xlarge", "large", "medium", "small", "xsmall"] as const;
const titleSizes = ["xlarge", "large", "medium", "small", "xsmall", "xxsmall"] as const;

export const Overview: Story = {
  render: () => (
    <Rows spacing="2u">
      <Title size="xlarge">Localization dashboard</Title>
      <Title size="large">Review queue</Title>
      <Title size="medium">Provider sync</Title>
      <Title size="small">Glossary updates</Title>
      <Text size="xlarge" tone="subtle">
        Ship consistent translations with fewer manual handoffs.
      </Text>
      <Text>
        Use <TypographyInlineCode>provider.sync()</TypographyInlineCode> to refresh source strings.
      </Text>
      <TypographyBlockquote>Preserve product names and ICU placeholders.</TypographyBlockquote>
      <Text size="large" weight="bold">
        Large emphasis text
      </Text>
      <Text size="small" weight="medium">
        Small supporting text
      </Text>
      <Text size="small" tone="subtle">
        Muted metadata and timestamps
      </Text>
    </Rows>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Localization dashboard")).toBeInTheDocument();
    await expect(canvas.getByText("Muted metadata and timestamps")).toBeInTheDocument();
  },
};

export const TextSizes: Story = {
  render: () => (
    <Rows spacing="1u">
      {textSizes.map((size) => (
        <Text key={size} size={size}>
          Text {size}
        </Text>
      ))}
    </Rows>
  ),
};

export const TitleSizes: Story = {
  render: () => (
    <Rows spacing="2u">
      {titleSizes.map((size) => (
        <Title key={size} size={size}>
          Title {size}
        </Title>
      ))}
    </Rows>
  ),
};

export const Tones: Story = {
  render: () => (
    <Rows spacing="1u">
      {typographyTones.map((tone) => (
        <Text key={tone} tone={tone}>
          Tone {tone}
        </Text>
      ))}
    </Rows>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Tone critical")).toBeInTheDocument();
    await expect(canvas.getByText("Tone subtle")).toBeInTheDocument();
  },
};

export const AlignmentAndClamp: Story = {
  render: () => (
    <Rows spacing="3u">
      <Rows spacing="1u">
        <Text alignment="start">Aligned start</Text>
        <Text alignment="center">Aligned center</Text>
        <Text alignment="end">Aligned end</Text>
      </Rows>
      <Box width="full">
        <Title size="small" lineClamp={1}>
          This title truncates to a single line instead of wrapping onto the next row.
        </Title>
        <Text lineClamp={2}>
          This paragraph clamps after two lines. Teams use it for filenames, activity previews, and
          other copy that must stay compact without a one-off className.
        </Text>
      </Box>
      <Text wrapStyle="balance">Balanced wrapping for headings and short marketing sentences.</Text>
      <Text capitalization="uppercase" size="small" weight="medium">
        Uppercase label
      </Text>
    </Rows>
  ),
};

export const Wrappers: Story = {
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
};
