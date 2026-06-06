import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { Badge } from "./badge";
import { Button } from "./button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./card";

const meta = {
  title: "UI/Card",
  component: Card,
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <div className="grid max-w-4xl gap-4 p-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Mobile checkout</CardTitle>
          <CardDescription>
            French, German, and Japanese translations are in review.
          </CardDescription>
          <CardAction>
            <Badge variant="secondary">Active</Badge>
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <div className="font-medium">128</div>
              <div className="text-muted-foreground">Strings</div>
            </div>
            <div>
              <div className="font-medium">8</div>
              <div className="text-muted-foreground">Issues</div>
            </div>
            <div>
              <div className="font-medium">3</div>
              <div className="text-muted-foreground">Locales</div>
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button size="sm">Open project</Button>
        </CardFooter>
      </Card>
      <Card size="sm">
        <CardHeader>
          <CardTitle>Provider memory</CardTitle>
          <CardDescription>Read-only entries synced from Phrase.</CardDescription>
        </CardHeader>
      </Card>
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Mobile checkout")).toHaveAttribute("data-slot", "card-title");
  },
};
