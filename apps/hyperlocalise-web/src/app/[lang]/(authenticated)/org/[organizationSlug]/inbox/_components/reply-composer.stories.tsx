import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn } from "storybook/test";

import { PromptInputProvider } from "@/components/ai-elements/prompt-input";

import { projectsFixture } from "./inbox.fixture";
import { ReplyComposerView } from "./reply-composer";

const meta = {
  title: "App/Inbox/ReplyComposer",
  component: ReplyComposerView,
  parameters: {
    layout: "padded",
  },
  decorators: [
    (Story) => (
      <PromptInputProvider>
        <div className="w-full max-w-3xl bg-background">
          <Story />
        </div>
      </PromptInputProvider>
    ),
  ],
  args: {
    conversationProjectId: "project_website",
    disabled: false,
    isStreaming: false,
    projects: projectsFixture,
    projectsIsLoading: false,
    projectsIsError: false,
    onSend: fn(),
  },
} satisfies Meta<typeof ReplyComposerView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByPlaceholderText("Paste text or describe what to translate..."),
    ).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Send reply" })).toBeInTheDocument();
    await expect(canvas.getByText("Website")).toBeInTheDocument();
  },
};

export const Streaming: Story = {
  args: {
    isStreaming: true,
    disabled: true,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByPlaceholderText("Agent is responding...")).toBeInTheDocument();
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
};

export const LoadingProjects: Story = {
  args: {
    projects: [],
    projectsIsLoading: true,
  },
};

export const ProjectsLoadError: Story = {
  args: {
    projects: [],
    projectsIsError: true,
  },
};

export const NoProjects: Story = {
  args: {
    projects: [],
    conversationProjectId: null,
  },
};
