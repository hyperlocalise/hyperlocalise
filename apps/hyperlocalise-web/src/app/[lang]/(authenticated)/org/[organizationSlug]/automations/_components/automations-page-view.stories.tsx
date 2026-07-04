import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { automationTemplatesFixture, automationsFixture } from "./automations.fixture";
import { AutomationsPageView } from "./automations-page-view";

const fixedNow = Date.UTC(2026, 5, 7, 12, 0, 0);

const meta = {
  title: "App/Automations/Page",
  component: AutomationsPageView,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    organizationSlug: "acme",
    automations: automationsFixture,
    templates: automationTemplatesFixture,
    isLoading: false,
    now: fixedNow,
  },
} satisfies Meta<typeof AutomationsPageView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Automations" })).toBeInTheDocument();
    await expect(canvas.getByText("Validate localisation on push")).toBeInTheDocument();
    await expect(canvas.getByText("Weekly translation sync")).toBeInTheDocument();
    await expect(canvas.getByText("Translate Contentful article")).toBeInTheDocument();
  },
};

export const Loading: Story = {
  args: {
    automations: [],
    isLoading: true,
  },
  play: async ({ canvas }) => {
    const loadingRegion = canvas.getByLabelText("Loading automations");
    await expect(loadingRegion.children).toHaveLength(5);
  },
};

export const Empty: Story = {
  args: {
    automations: [],
    isLoading: false,
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText(
        "No automations yet. Start from a template below or create a new automation.",
      ),
    ).toBeInTheDocument();
  },
};

export const LoadError: Story = {
  args: {
    automations: [],
    error: new Error("The automations API returned a 500."),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Automations failed to load.")).toBeInTheDocument();
  },
};

export const ActiveAndPaused: Story = {
  args: {
    automations: automationsFixture,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("3")).toBeInTheDocument();
    await expect(canvas.getAllByText("active")).toHaveLength(2);
    await expect(canvas.getByText("paused")).toBeInTheDocument();
  },
};

export const SingleAutomation: Story = {
  args: {
    automations: [automationsFixture[0]!],
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Validate localisation on push")).toBeInTheDocument();
    await expect(canvas.queryByText("Weekly translation sync")).not.toBeInTheDocument();
    await expect(canvas.getByText("1")).toBeInTheDocument();
  },
};

export const MarketingTemplates: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("tab", { name: "Marketing" }));
    await expect(canvas.getByText("Market messaging brief")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Coming soon" })).toBeInTheDocument();
  },
};

export const ActivatableTemplate: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Translate Contentful article")).toBeInTheDocument();
    await expect(canvas.getAllByRole("button", { name: "Add" }).length).toBeGreaterThan(0);
  },
};
