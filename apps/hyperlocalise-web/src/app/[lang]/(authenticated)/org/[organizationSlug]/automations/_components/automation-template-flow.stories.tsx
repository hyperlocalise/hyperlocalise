import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { getWorkspaceAutomationTemplate } from "@/lib/agents/workspace-automation-templates";

import { automationTemplatesFixture } from "./automations.fixture";
import { AutomationTemplateFlow } from "./automation-template-flow";

const meta = {
  title: "App/Automations/TemplateFlow",
  component: AutomationTemplateFlow,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof AutomationTemplateFlow>;

export default meta;
type Story = StoryObj<typeof meta>;

function templateStory(templateId: string): Story {
  const template = getWorkspaceAutomationTemplate(templateId, automationTemplatesFixture);
  if (!template) {
    throw new Error(`Template ${templateId} is missing from fixtures`);
  }

  return {
    args: {
      template,
    },
  };
}

export const GithubPushValidation: Story = {
  ...templateStory("validate-localisation-on-push"),
  play: async ({ canvas }) => {
    await expect(
      canvas.getByLabelText("GitHub push → Validation → Slack"),
    ).toBeInTheDocument();
  },
};

export const ScheduledSync: Story = {
  ...templateStory("pull-translations-daily"),
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText("Daily → Pull translations")).toBeInTheDocument();
  },
};

export const ManualWorkflow: Story = {
  ...templateStory("create-localisation-job-brief"),
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText("Manual → GitHub → Slack")).toBeInTheDocument();
  },
};

export const ContentfulTranslation: Story = {
  ...templateStory("translate-contentful-article"),
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText("Contentful webhook → Contentful")).toBeInTheDocument();
  },
};

export const TriggerOnly: Story = {
  ...templateStory("summarize-changes-daily"),
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText("Daily → GitHub → Slack")).toBeInTheDocument();
  },
};
