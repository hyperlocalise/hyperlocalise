import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "./chart";

const chartData = [
  { locale: "FR", strings: 186 },
  { locale: "DE", strings: 144 },
  { locale: "JA", strings: 122 },
];

const chartConfig = {
  strings: {
    label: "Strings",
    color: "var(--primary)",
  },
} satisfies ChartConfig;

const meta = {
  title: "UI/Chart",
  component: ChartContainer,
} satisfies Meta<typeof ChartContainer>;

export default meta;
type Story = StoryObj;

export const Overview: Story = {
  render: () => (
    <div className="max-w-xl">
      <h3 className="mb-3 text-sm font-medium">Strings by locale</h3>
      <ChartContainer className="h-64" config={chartConfig}>
        <BarChart accessibilityLayer data={chartData}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="locale" tickLine={false} axisLine={false} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar dataKey="strings" fill="var(--color-strings)" radius={8} />
        </BarChart>
      </ChartContainer>
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Strings by locale")).toBeInTheDocument();
  },
};
