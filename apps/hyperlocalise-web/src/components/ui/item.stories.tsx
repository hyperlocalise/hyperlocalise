import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { Badge } from "./badge";
import { Button } from "./button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemHeader,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "./item";

const meta = {
  title: "UI/Item",
  component: Item,
} satisfies Meta<typeof Item>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <ItemGroup className="max-w-xl p-6">
      <Item variant="default">
        <ItemMedia variant="icon">FR</ItemMedia>
        <ItemContent>
          <ItemTitle>French locale</ItemTitle>
          <ItemDescription>186 strings ready for reviewer approval.</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Badge variant="secondary">Ready</Badge>
        </ItemActions>
      </Item>
      <Item variant="outline" size="sm">
        <ItemHeader>
          <ItemTitle>Provider sync</ItemTitle>
          <Button size="xs" variant="outline">
            Retry
          </Button>
        </ItemHeader>
        <ItemFooter>
          <ItemDescription>Last run completed 2 minutes ago.</ItemDescription>
        </ItemFooter>
      </Item>
      <ItemSeparator />
      <Item variant="muted" size="xs">
        <ItemContent>
          <ItemTitle>QA findings</ItemTitle>
        </ItemContent>
        <ItemActions>8 open</ItemActions>
      </Item>
    </ItemGroup>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("French locale")).toBeInTheDocument();
  },
};
