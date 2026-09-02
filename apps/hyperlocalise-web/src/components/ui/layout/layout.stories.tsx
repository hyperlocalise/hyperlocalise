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

import { Box } from "./box";
import { Column } from "./column";
import { Columns } from "./columns";
import { Grid } from "./grid";
import { Row } from "./row";
import { Rows } from "./rows";

const meta = {
  title: "UI/Layout",
  component: Box,
} satisfies Meta<typeof Box>;

export default meta;
type Story = StoryObj<typeof meta>;

function Cell({ children }: { children: string }) {
  return (
    <Box padding="1u" background="muted" border="standard" borderRadius="standard">
      {children}
    </Box>
  );
}

export const Overview: Story = {
  render: () => (
    <Rows spacing="3u">
      <Box padding="2u" background="surface" border="standard" borderRadius="large">
        <Rows spacing="1u">
          <Box>Padding, background, and radius come from Box props.</Box>
          <Box>Layout components do not accept className.</Box>
        </Rows>
      </Box>
      <Rows spacing="1u">
        <Cell>Rows stack vertically</Cell>
        <Cell>with token spacing</Cell>
      </Rows>
      <Row spacing="1u" align="spaceBetween" alignY="center">
        <Cell>Row is horizontal</Cell>
        <Cell>spaceBetween</Cell>
      </Row>
      <Columns spacing="2u">
        <Column width="1/3">
          <Cell>1/3</Cell>
        </Column>
        <Column width="2/3">
          <Cell>2/3</Cell>
        </Column>
      </Columns>
      <Columns spacing="1u">
        <Column width="content">
          <Cell>content</Cell>
        </Column>
        <Column width="fluid">
          <Cell>fluid</Cell>
        </Column>
      </Columns>
      <Grid columns={3} spacing="1u">
        <Cell>Grid 1</Cell>
        <Cell>Grid 2</Cell>
        <Cell>Grid 3</Cell>
        <Cell>Grid 4</Cell>
        <Cell>Grid 5</Cell>
        <Cell>Grid 6</Cell>
      </Grid>
    </Rows>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Rows stack vertically")).toBeInTheDocument();
    await expect(canvas.getByText("1/3")).toBeInTheDocument();
    await expect(canvas.getByText("Grid 1")).toBeInTheDocument();
  },
};

export const BoxPadding: Story = {
  render: () => (
    <Rows spacing="2u">
      <Box padding="1u" background="muted" borderRadius="standard">
        padding 1u
      </Box>
      <Box padding="2u" background="muted" borderRadius="standard">
        padding 2u
      </Box>
      <Box padding="3u" background="muted" borderRadius="standard">
        padding 3u
      </Box>
    </Rows>
  ),
};

export const GridSpacing: Story = {
  render: () => (
    <Rows spacing="3u">
      <Grid columns={3} spacing="0.5u">
        <Cell>0.5u</Cell>
        <Cell>0.5u</Cell>
        <Cell>0.5u</Cell>
      </Grid>
      <Grid columns={3} spacing="2u">
        <Cell>2u</Cell>
        <Cell>2u</Cell>
        <Cell>2u</Cell>
      </Grid>
      <Grid columns={3} spacingX="3u" spacingY="1u">
        <Cell>X 3u / Y 1u</Cell>
        <Cell>X 3u / Y 1u</Cell>
        <Cell>X 3u / Y 1u</Cell>
      </Grid>
    </Rows>
  ),
};
