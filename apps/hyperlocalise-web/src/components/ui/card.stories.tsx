import type { Meta, StoryObj } from "@storybook/nextjs-vite";

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
  component: Card,
  tags: ["ai-generated", "needs-work"],
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ProjectSummary: Story = {
  render: () => (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Demo Release</CardTitle>
        <CardDescription>Primary website strings for the spring launch.</CardDescription>
        <CardAction>
          <Button size="sm" variant="outline">
            Open
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">2 open jobs · fr, de</p>
      </CardContent>
      <CardFooter>
        <Button size="sm">Create job</Button>
      </CardFooter>
    </Card>
  ),
};

export const Compact: Story = {
  render: () => (
    <Card size="sm" className="max-w-sm">
      <CardHeader>
        <CardTitle>Locale readiness</CardTitle>
        <CardDescription>Markets blocked on missing glossary terms.</CardDescription>
      </CardHeader>
    </Card>
  ),
};
